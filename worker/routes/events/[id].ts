import type { Env } from '../../lib/http';
import { bad, json } from '../../lib/http';

const EVENT_TYPE_RE = /^[a-z0-9_]{1,40}$/;

const MEDIA_TYPES = new Set(['image', 'video']);

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

interface MediaItem {
  type: string;
  url: string;
  caption: string | null;
}

function parseMedia(raw: string | null | undefined): MediaItem[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    if (!Array.isArray(v)) return [];
    return v
      .filter(
        (m): m is MediaItem =>
          m &&
          typeof m === 'object' &&
          MEDIA_TYPES.has((m as MediaItem).type) &&
          typeof (m as MediaItem).url === 'string'
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

function normalizeMedia(input: unknown): MediaItem[] | null {
  if (!Array.isArray(input)) return null;
  const out: MediaItem[] = [];
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

async function fetchPersonsAndSubjects(
  env: Env,
  eventId: number
): Promise<{ personIds: number[]; subjectIds: number[] }> {
  const { results } = await env.DB.prepare(
    'SELECT person_id, role FROM event_persons WHERE event_id = ? ORDER BY created_at ASC, person_id ASC'
  )
    .bind(eventId)
    .all<{ person_id: number; role: string | null }>();
  const personIds: number[] = [];
  const subjectIds: number[] = [];
  for (const r of results ?? []) {
    personIds.push(r.person_id);
    if (r.role === 'subject') subjectIds.push(r.person_id);
  }
  return { personIds, subjectIds };
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

export async function GET(_request: Request, env: Env, params: Record<string, string>): Promise<Response> {
  const id = Number(params.id);
  if (!Number.isFinite(id)) return bad(400, 'Invalid id');
  const row = await env.DB.prepare(
    'SELECT * FROM events WHERE id = ? AND deleted_at IS NULL'
  )
    .bind(id)
    .first<EventRow>();
  if (!row) return bad(404, 'Event not found');
  const { personIds, subjectIds } = await fetchPersonsAndSubjects(env, id);
  return json({ data: rowToResponse(row, personIds, subjectIds) });
}

export async function PUT(request: Request, env: Env, params: Record<string, string>): Promise<Response> {
  const id = Number(params.id);
  if (!Number.isFinite(id)) return bad(400, 'Invalid id');

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

  const updated = await env.DB.prepare(
    `UPDATE events SET
       title = ?,
       body = ?,
       event_date = ?,
       event_type = ?,
       location = ?,
       longitude = ?,
       latitude = ?,
       media = ?,
       updated_at = unixepoch()
     WHERE id = ? AND deleted_at IS NULL
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
      JSON.stringify(media),
      id
    )
    .first<EventRow>();
  if (!updated) return bad(404, 'Event not found');

  const subjectSet = new Set(subjectIds);
  const stmts = [
    env.DB.prepare('DELETE FROM event_persons WHERE event_id = ?').bind(id),
    ...personIds.map((pid) =>
      env.DB.prepare(
        'INSERT INTO event_persons (event_id, person_id, role) VALUES (?, ?, ?)'
      ).bind(id, pid, subjectSet.has(pid) ? 'subject' : null)
    ),
  ];
  await env.DB.batch(stmts);

  return json({ data: rowToResponse(updated, personIds, subjectIds) });
}

export async function DELETE(_request: Request, env: Env, params: Record<string, string>): Promise<Response> {
  const id = Number(params.id);
  if (!Number.isFinite(id)) return bad(400, 'Invalid id');
  await env.DB.prepare(
    'UPDATE events SET deleted_at = unixepoch() WHERE id = ? AND deleted_at IS NULL'
  )
    .bind(id)
    .run();
  return json({ ok: true });
}

export async function PATCH(request: Request, env: Env, params: Record<string, string>): Promise<Response> {
  const id = Number(params.id);
  if (!Number.isFinite(id)) return bad(400, 'Invalid id');

  let body: { action?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return bad(400, 'Invalid JSON body');
  }

  if (body.action === 'restore') {
    await env.DB.prepare('UPDATE events SET deleted_at = NULL WHERE id = ?')
      .bind(id)
      .run();
    return json({ ok: true });
  }

  if (body.action === 'purge') {
    const row = await env.DB.prepare(
      'SELECT deleted_at FROM events WHERE id = ?'
    )
      .bind(id)
      .first<{ deleted_at: number | null }>();
    if (!row) return bad(404, 'Event not found');
    if (!row.deleted_at) return bad(400, 'Event is not in trash');
    await env.DB.prepare('DELETE FROM events WHERE id = ?').bind(id).run();
    return json({ ok: true });
  }

  return bad(400, 'Unknown action');
}
