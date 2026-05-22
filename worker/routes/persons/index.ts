import type { Env } from '../../lib/http';
import { bad, json } from '../../lib/http';

const KINSHIPS = new Set(['blood', 'quasi', 'in_law', 'social']);
const GENDERS = new Set(['male', 'female', 'unknown']);
const BIRTH_CALENDARS = new Set(['solar', 'lunar', 'both']);

export async function GET(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const q = url.searchParams.get('q');
  const kinship = url.searchParams.get('kinship');
  const gender = url.searchParams.get('gender');
  const deleted = url.searchParams.get('deleted');

  const wheres: string[] = [];
  const binds: unknown[] = [];

  if (deleted === '1') {
    wheres.push('deleted_at IS NOT NULL');
  } else {
    wheres.push('deleted_at IS NULL');
  }

  if (q) {
    wheres.push('(nickname LIKE ? OR standard_title LIKE ? OR dialect_title LIKE ? OR real_name LIKE ?)');
    const like = `%${q}%`;
    binds.push(like, like, like, like);
  }
  if (kinship && KINSHIPS.has(kinship)) {
    wheres.push('kinship = ?');
    binds.push(kinship);
  }
  if (gender && GENDERS.has(gender)) {
    wheres.push('gender = ?');
    binds.push(gender);
  }
  const whereSql = wheres.length ? ` WHERE ${wheres.join(' AND ')}` : '';
  const sql = `SELECT * FROM persons${whereSql} ORDER BY id DESC`;

  const stmt = binds.length ? env.DB.prepare(sql).bind(...binds) : env.DB.prepare(sql);
  const { results } = await stmt.all();
  return json({ data: results });
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

export async function POST(request: Request, env: Env): Promise<Response> {
  let body: PersonInput;
  try {
    body = (await request.json()) as PersonInput;
  } catch {
    return bad(400, 'Invalid JSON body');
  }

  const result = await env.DB.prepare(
    `INSERT INTO persons
       (nickname, standard_title, dialect_title, real_name, gender,
        birth_date, birth_calendar, kinship, avatar_url, avatar_char, notes)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)
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
      body.notes ?? null
    )
    .first();

  return json({ data: result }, { status: 201 });
}
