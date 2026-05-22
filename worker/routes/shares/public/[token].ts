import type { Env } from '../../../lib/http';
import { bad, json } from '../../../lib/http';
import { decryptSharePassword } from '../../../lib/shareCrypto';
import {
  applyVisibility,
  parseVisibleFields,
  type EventForShare,
  type SharedPersonRef,
  type VisibleField,
} from '../../../lib/personMask';

interface ShareRow {
  id: number;
  token: string;
  root_person_id: number;
  title: string | null;
  password_encrypted: string;
  expires_at: number | null;
  mode: 'tree' | 'person';
  hide_sensitive: number;
  visible_fields: string | null;
}

function timingSafeEqualStr(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

interface PersonRow {
  id: number;
  nickname: string | null;
  standard_title: string | null;
  dialect_title: string | null;
  real_name: string | null;
  gender: string;
  birth_date: string | null;
  kinship: string;
  avatar_url: string | null;
  notes: string | null;
  created_at: number;
  updated_at: number;
}

interface PhoneRow {
  id: number;
  person_id: number;
  phone: string;
  note: string | null;
  created_at: number;
}

interface AddressRow {
  id: number;
  person_id: number;
  address: string;
  longitude: number | null;
  latitude: number | null;
  label: string | null;
  created_at: number;
}

interface EventRow {
  id: number;
  title: string;
  body: string | null;
  event_date: string | null;
  event_type: string;
  location: string | null;
  longitude: number | null;
  latitude: number | null;
  media: string;
  created_at: number;
  updated_at: number;
  role: string | null;
}

interface RawMedia {
  type?: unknown;
  url?: unknown;
  caption?: unknown;
}

function parseMedia(raw: string | null | undefined): EventForShare['media'] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    if (!Array.isArray(v)) return [];
    const out: EventForShare['media'] = [];
    for (const m of v as RawMedia[]) {
      if (!m || typeof m !== 'object') continue;
      if (typeof m.type !== 'string') continue;
      if (m.type !== 'image' && m.type !== 'video') continue;
      if (typeof m.url !== 'string' || !m.url) continue;
      out.push({
        type: m.type,
        url: m.url,
        caption: typeof m.caption === 'string' && m.caption ? m.caption : null,
      });
    }
    return out;
  } catch {
    return [];
  }
}

function resolveVisibleFields(row: ShareRow): VisibleField[] {
  const parsed = parseVisibleFields(row.visible_fields);
  if (parsed.length > 0) return parsed;
  if (row.visible_fields && row.visible_fields !== '[]') return parsed;
  if (row.hide_sensitive === 0) {
    return ['real_name', 'birth_date', 'address', 'notes', 'phones', 'events', 'event_map'];
  }
  return [];
}

export async function POST(request: Request, env: Env, params: Record<string, string>): Promise<Response> {
  const token = params.token as string;
  if (!token) return bad(400, 'Missing token');

  let body: { password?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return bad(400, 'Invalid JSON body');
  }

  if (!body.password?.trim()) return bad(400, '请输入访问密码');

  const share = await env.DB.prepare(
    `SELECT s.*, p.deleted_at AS root_deleted_at
       FROM shares s
       LEFT JOIN persons p ON p.id = s.root_person_id
      WHERE s.token = ?`
  )
    .bind(token)
    .first<ShareRow & { root_deleted_at: number | null }>();

  if (!share) return bad(404, '分享链接不存在或已失效');

  if (share.root_deleted_at !== null) {
    return bad(410, '分享内容已不可用');
  }

  if (share.expires_at && share.expires_at < Math.floor(Date.now() / 1000)) {
    return bad(410, '分享链接已过期');
  }

  let expected: string;
  try {
    expected = await decryptSharePassword(env, share.password_encrypted);
  } catch {
    return bad(500, '分享密码解密失败');
  }
  if (!timingSafeEqualStr(body.password.trim(), expected)) {
    return bad(401, '访问密码错误');
  }

  const mode: 'tree' | 'person' = share.mode === 'person' ? 'person' : 'tree';

  const amapRows = await env.DB.prepare(
    `SELECT key, value FROM settings WHERE key IN ('amap_key', 'amap_security_code')`
  ).all<{ key: string; value: string }>();
  const amapCfg: Record<string, string> = {};
  for (const r of amapRows.results ?? []) amapCfg[r.key] = r.value;
  const amapKey = (amapCfg.amap_key || '').trim() || null;
  const amapSecurityCode = (amapCfg.amap_security_code || '').trim() || null;

  if (mode === 'person') {
    const person = await env.DB.prepare(
      'SELECT * FROM persons WHERE id = ? AND deleted_at IS NULL'
    )
      .bind(share.root_person_id)
      .first<PersonRow>();

    if (!person) return bad(404, '该分享指向的人物已不存在');

    const visibleArr = resolveVisibleFields(share);
    const visible = new Set<VisibleField>(visibleArr);

    let phoneRows: PhoneRow[] = [];
    if (visible.has('phones')) {
      const { results } = await env.DB.prepare(
        'SELECT * FROM person_phones WHERE person_id = ? ORDER BY created_at ASC'
      )
        .bind(share.root_person_id)
        .all<PhoneRow>();
      phoneRows = results ?? [];
    }

    let addressRows: AddressRow[] = [];
    if (visible.has('address')) {
      const { results } = await env.DB.prepare(
        'SELECT * FROM person_addresses WHERE person_id = ? ORDER BY id ASC'
      )
        .bind(share.root_person_id)
        .all<AddressRow>();
      addressRows = results ?? [];
    }

    let events: EventForShare[] = [];
    if (visible.has('events')) {
      const { results } = await env.DB.prepare(
        `SELECT e.*, ep.role AS role
           FROM events e
           INNER JOIN event_persons ep ON ep.event_id = e.id
           WHERE ep.person_id = ? AND e.deleted_at IS NULL
           ORDER BY e.event_date DESC, e.id DESC
           LIMIT 500`
      )
        .bind(share.root_person_id)
        .all<EventRow>();
      const rows = results ?? [];

      type EventPersonRow = {
        event_id: number;
        person_id: number;
        role: string | null;
        real_name: string | null;
        dialect_title: string | null;
        nickname: string | null;
        standard_title: string | null;
        avatar_url: string | null;
        avatar_char: string | null;
        gender: string;
      };

      const subjectsByEvent = new Map<number, SharedPersonRef[]>();
      const participantsByEvent = new Map<number, SharedPersonRef[]>();

      if (rows.length > 0) {
        const ids = rows.map((r) => r.id);
        const placeholders = ids.map(() => '?').join(',');
        const { results: epRows } = await env.DB.prepare(
          `SELECT ep.event_id, ep.person_id, ep.role,
                  p.real_name, p.dialect_title, p.nickname, p.standard_title,
                  p.avatar_url, p.avatar_char, p.gender
             FROM event_persons ep
             INNER JOIN persons p ON p.id = ep.person_id
            WHERE ep.event_id IN (${placeholders})
              AND p.deleted_at IS NULL
            ORDER BY ep.event_id ASC, ep.person_id ASC`
        )
          .bind(...ids)
          .all<EventPersonRow>();

        for (const r of epRows ?? []) {
          const ref: SharedPersonRef = {
            id: r.person_id,
            name:
              r.real_name ||
              r.dialect_title ||
              r.nickname ||
              r.standard_title ||
              `#${r.person_id}`,
            avatar_url: r.avatar_url,
            avatar_char: r.avatar_char,
            gender: r.gender,
          };
          const bucket = r.role === 'subject' ? subjectsByEvent : participantsByEvent;
          const list = bucket.get(r.event_id) ?? [];
          list.push(ref);
          bucket.set(r.event_id, list);
        }
      }

      events = rows.map((r) => ({
        id: r.id,
        title: r.title,
        body: r.body,
        event_date: r.event_date,
        event_type: r.event_type,
        location: r.location,
        longitude: r.longitude,
        latitude: r.latitude,
        media: parseMedia(r.media),
        is_subject: r.role === 'subject',
        subjects: subjectsByEvent.get(r.id) ?? [],
        participants: participantsByEvent.get(r.id) ?? [],
        created_at: r.created_at,
        updated_at: r.updated_at,
      }));
    }

    let eventTypeTaxonomies: Array<{
      key: string;
      label: string;
      icon_name: string | null;
      color_hex: string | null;
    }> = [];
    if (visible.has('events')) {
      const { results } = await env.DB.prepare(
        `SELECT key, label, icon_name, color_hex
           FROM taxonomies
           WHERE domain = 'event_type' AND deleted_at IS NULL
           ORDER BY order_index ASC, id ASC`
      ).all<{
        key: string;
        label: string;
        icon_name: string | null;
        color_hex: string | null;
      }>();
      eventTypeTaxonomies = results ?? [];
    }

    const masked = applyVisibility(person, phoneRows, addressRows, events, visible);

    return json({
      data: {
        mode: 'person' as const,
        title: share.title,
        root_person_id: share.root_person_id,
        visible_fields: visibleArr,
        person: masked.person,
        phones: masked.phones,
        addresses: masked.addresses,
        events: masked.events,
        event_type_taxonomies: eventTypeTaxonomies,
        amap_key: amapKey,
        amap_security_code: amapSecurityCode,
      },
    });
  }

  const { results: persons } = await env.DB.prepare(
    'SELECT * FROM persons WHERE deleted_at IS NULL'
  ).all();

  const { results: relations } = await env.DB.prepare(
    'SELECT * FROM relations'
  ).all();

  return json({
    data: {
      mode: 'tree' as const,
      title: share.title,
      root_person_id: share.root_person_id,
      persons,
      relations,
    },
  });
}
