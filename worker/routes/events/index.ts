import type { Env } from '../../lib/http';
import { bad, json } from '../../lib/http';

const EVENT_TYPE_RE = /^[a-z0-9_]{1,40}$/;

const MEDIA_TYPES = new Set(['image', 'video']);

interface EventMediaIn {
  type: string;
  url: string;
  caption?: string | null;
}

interface EventInput {
  title?: string;
  body?: string | null;
  event_date?: string | null;
  event_type?: string;
  location?: string | null;
  longitude?: number | null;
  latitude?: number | null;
  media?: unknown;
  person_ids?: unknown;
  subject_ids?: unknown;
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
  deleted_at: number | null;
}

function parseMedia(raw: string | null | undefined): EventMediaIn[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    if (!Array.isArray(v)) return [];
    return v
      .filter(
        (m): m is EventMediaIn =>
          m &&
          typeof m === 'object' &&
          MEDIA_TYPES.has((m as EventMediaIn).type) &&
          typeof (m as EventMediaIn).url === 'string'
      )
      .map((m) => ({
        type: m.type,
        url: m.url,
        caption: m.caption ?? null,
      }));
  } catch {
    return [];
  }
}

function normalizeMedia(input: unknown): EventMediaIn[] | null {
  if (!Array.isArray(input)) return null;
  const out: EventMediaIn[] = [];
  for (const m of input) {
    if (!m || typeof m !== 'object') return null;
    const rec = m as Record<string, unknown>;
    if (typeof rec.type !== 'string' || !MEDIA_TYPES.has(rec.type)) return null;
    if (typeof rec.url !== 'string' || !rec.url) return null;
    out.push({
      type: rec.type,
      url: rec.url,
      caption:
        typeof rec.caption === 'string' && rec.caption ? rec.caption : null,
    });
  }
  return out;
}

function normalizePersonIds(input: unknown): number[] | null {
  if (!Array.isArray(input) || input.length === 0) return null;
  const seen = new Set<number>();
  for (const v of input) {
    const n = Number(v);
    if (!Number.isFinite(n) || n <= 0 || !Number.isInteger(n)) return null;
    seen.add(n);
  }
  return Array.from(seen);
}

function normalizeSubjectIds(
  input: unknown,
  personIds: number[]
): number[] | null {
  if (input == null) return [];
  if (!Array.isArray(input)) return null;
  const personSet = new Set(personIds);
  const seen = new Set<number>();
  for (const v of input) {
    const n = Number(v);
    if (!Number.isFinite(n) || !Number.isInteger(n)) return null;
    if (!personSet.has(n)) return null;
    seen.add(n);
  }
  return Array.from(seen);
}

function rowToResponse(
  row: EventRow,
  personIds: number[],
  subjectIds: number[]
) {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    event_date: row.event_date,
    event_type: row.event_type,
    location: row.location,
    longitude: row.longitude,
    latitude: row.latitude,
    media: parseMedia(row.media),
    person_ids: personIds,
    subject_ids: subjectIds,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function normalizeCoord(v: unknown, min: number, max: number): number | null {
  if (v == null) return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max) return null;
  return n;
}

export async function GET(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const personIdRaw = url.searchParams.get('person_id');
  const offset = Math.max(0, Number(url.searchParams.get('offset') ?? '0') | 0);
  const limitRaw = Number(url.searchParams.get('limit') ?? '20') | 0;
  const limit = Math.min(500, Math.max(1, limitRaw || 20));
  const typeFilter = url.searchParams.get('event_type');
  const validType =
    typeFilter && EVENT_TYPE_RE.test(typeFilter) ? typeFilter : null;
  const subjectOnly = url.searchParams.get('subject_only') === '1';

  const wheres: string[] = ['e.deleted_at IS NULL'];
  const binds: unknown[] = [];

  if (personIdRaw) {
    const personId = Number(personIdRaw);
    if (!Number.isFinite(personId) || personId <= 0) {
      return bad(400, 'Invalid person_id');
    }
    wheres.push('ep.person_id = ?');
    binds.push(personId);
    if (subjectOnly) {
      wheres.push("ep.role = 'subject'");
    }
  }
  if (validType) {
    wheres.push('e.event_type = ?');
    binds.push(validType);
  }

  const joinClause = personIdRaw
    ? 'INNER JOIN event_persons ep ON ep.event_id = e.id'
    : '';

  const sql = `
    SELECT DISTINCT e.*
    FROM events e
    ${joinClause}
    WHERE ${wheres.join(' AND ')}
    ORDER BY e.event_date DESC, e.id DESC
    LIMIT ? OFFSET ?
  `;
  const { results } = await env.DB.prepare(sql)
    .bind(...binds, limit, offset)
    .all<EventRow>();
  const rows = results ?? [];

  const personIdsByEvent = new Map<number, number[]>();
  const subjectIdsByEvent = new Map<number, number[]>();
  if (rows.length > 0) {
    const ids = rows.map((r) => r.id);
    const placeholders = ids.map(() => '?').join(',');
    const linkSql = `SELECT event_id, person_id, role FROM event_persons WHERE event_id IN (${placeholders}) ORDER BY created_at ASC, person_id ASC`;
    const { results: links } = await env.DB.prepare(linkSql)
      .bind(...ids)
      .all<{ event_id: number; person_id: number; role: string | null }>();
    for (const l of links ?? []) {
      const arr = personIdsByEvent.get(l.event_id) ?? [];
      arr.push(l.person_id);
      personIdsByEvent.set(l.event_id, arr);
      if (l.role === 'subject') {
        const sarr = subjectIdsByEvent.get(l.event_id) ?? [];
        sarr.push(l.person_id);
        subjectIdsByEvent.set(l.event_id, sarr);
      }
    }
  }

  const data = rows.map((r) =>
    rowToResponse(
      r,
      personIdsByEvent.get(r.id) ?? [],
      subjectIdsByEvent.get(r.id) ?? []
    )
  );
  return json({ data, hasMore: rows.length === limit });
}

export async function POST(request: Request, env: Env): Promise<Response> {
  let body: EventInput;
  try {
    body = (await request.json()) as EventInput;
  } catch {
    return bad(400, 'Invalid JSON body');
  }
  const title = (body.title ?? '').trim();
  if (!title) return bad(400, '标题不能为空');
  const eventType =
    body.event_type && EVENT_TYPE_RE.test(body.event_type)
      ? body.event_type
      : 'other';
  const media = normalizeMedia(body.media ?? []);
  if (media === null) return bad(400, '媒体格式不正确');
  const personIds = normalizePersonIds(body.person_ids);
  if (!personIds) return bad(400, '至少需要关联一个人物');
  const subjectIds = normalizeSubjectIds(body.subject_ids, personIds);
  if (subjectIds === null) return bad(400, '主角必须在关联人物里');

  const inserted = await env.DB.prepare(
    `INSERT INTO events
       (title, body, event_date, event_type, location, longitude, latitude, media)
     VALUES (?,?,?,?,?,?,?,?)
     RETURNING *`
  )
    .bind(
      title,
      body.body ?? null,
      body.event_date ?? null,
      eventType,
      body.location ?? null,
      normalizeCoord(body.longitude, -180, 180),
      normalizeCoord(body.latitude, -90, 90),
      JSON.stringify(media)
    )
    .first<EventRow>();
  if (!inserted) return bad(500, '创建失败');

  const subjectSet = new Set(subjectIds);
  const stmts = personIds.map((pid) =>
    env.DB.prepare(
      `INSERT INTO event_persons (event_id, person_id, role) VALUES (?, ?, ?)
       ON CONFLICT(event_id, person_id) DO UPDATE SET role = excluded.role`
    ).bind(inserted.id, pid, subjectSet.has(pid) ? 'subject' : null)
  );
  await env.DB.batch(stmts);

  return json(
    { data: rowToResponse(inserted, personIds, subjectIds) },
    { status: 201 }
  );
}
