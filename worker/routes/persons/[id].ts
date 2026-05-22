import type { Env } from '../../lib/http';
import { bad, json } from '../../lib/http';

const KINSHIPS = new Set(['blood', 'quasi', 'in_law', 'social']);
const BIRTH_CALENDARS = new Set(['solar', 'lunar', 'both']);

export async function GET(_request: Request, env: Env, params: Record<string, string>): Promise<Response> {
  const id = Number(params.id);
  if (!Number.isFinite(id)) return bad(400, 'Invalid id');
  const row = await env.DB.prepare('SELECT * FROM persons WHERE id = ?').bind(id).first();
  if (!row) return bad(404, 'Person not found');
  return json({ data: row });
}

interface PersonInput {
  nickname?: string | null;
  standard_title?: string | null;
  dialect_title?: string | null;
  real_name?: string | null;
  gender?: 'male' | 'female' | 'unknown';
  birth_date?: string | null;
  birth_calendar?: 'solar' | 'lunar' | 'both';
  kinship?: 'blood' | 'quasi' | 'in_law' | 'social';
  avatar_url?: string | null;
  avatar_char?: string | null;
  notes?: string | null;
}

function normalizeKinship(v: unknown): 'blood' | 'quasi' | 'in_law' | 'social' {
  if (typeof v === 'string' && KINSHIPS.has(v)) return v as 'blood' | 'quasi' | 'in_law' | 'social';
  return 'social';
}

function normalizeAvatarChar(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const trimmed = v.trim();
  if (!trimmed) return null;
  return Array.from(trimmed)[0] ?? null;
}

export async function PUT(request: Request, env: Env, params: Record<string, string>): Promise<Response> {
  const id = Number(params.id);
  if (!Number.isFinite(id)) return bad(400, 'Invalid id');

  let body: PersonInput;
  try {
    body = (await request.json()) as PersonInput;
  } catch {
    return bad(400, 'Invalid JSON body');
  }

  const result = await env.DB.prepare(
    `UPDATE persons SET
       nickname = ?,
       standard_title = ?,
       dialect_title = ?,
       real_name = ?,
       gender = ?,
       birth_date = ?,
       birth_calendar = ?,
       kinship = ?,
       avatar_url = ?,
       avatar_char = ?,
       notes = ?,
       updated_at = unixepoch()
     WHERE id = ?
     RETURNING *`
  )
    .bind(
      body.nickname ?? null,
      body.standard_title ?? null,
      body.dialect_title ?? null,
      body.real_name ?? null,
      body.gender ?? 'unknown',
      body.birth_date ?? null,
      BIRTH_CALENDARS.has(body.birth_calendar ?? '') ? body.birth_calendar! : 'solar',
      normalizeKinship(body.kinship),
      body.avatar_url ?? null,
      normalizeAvatarChar(body.avatar_char),
      body.notes ?? null,
      id
    )
    .first();

  if (!result) return bad(404, 'Person not found');
  return json({ data: result });
}

export async function DELETE(_request: Request, env: Env, params: Record<string, string>): Promise<Response> {
  const id = Number(params.id);
  if (!Number.isFinite(id)) return bad(400, 'Invalid id');
  await env.DB.prepare('UPDATE persons SET deleted_at = unixepoch() WHERE id = ? AND deleted_at IS NULL')
    .bind(id)
    .run();
  return json({ ok: true });
}

export async function PATCH(request: Request, env: Env, params: Record<string, string>): Promise<Response> {
  const id = Number(params.id);
  if (!Number.isFinite(id)) return bad(400, 'Invalid id');

  let body: { action?: string; birth_order?: number | null; description?: string | null };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return bad(400, 'Invalid JSON body');
  }

  if (body.action === 'restore') {
    await env.DB.prepare('UPDATE persons SET deleted_at = NULL WHERE id = ?').bind(id).run();
    return json({ ok: true });
  }

  if (body.action === 'purge') {
    const row = await env.DB.prepare('SELECT deleted_at FROM persons WHERE id = ?').bind(id).first();
    if (!row) return bad(404, 'Person not found');
    if (!row.deleted_at) return bad(400, 'Person is not in trash');
    await env.DB.prepare('DELETE FROM persons WHERE id = ?').bind(id).run();
    return json({ ok: true });
  }

  return bad(400, 'Unknown action');
}
