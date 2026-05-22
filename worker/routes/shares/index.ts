import type { Env } from '../../lib/http';
import { bad, json } from '../../lib/http';
import { decryptSharePassword, encryptSharePassword } from '../../lib/shareCrypto';
import { ALL_VISIBLE_FIELDS, type VisibleField } from '../../lib/personMask';

function generateToken(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(36).padStart(2, '0'))
    .join('')
    .slice(0, 24);
}

function normalizeVisibleFields(input: unknown): VisibleField[] {
  if (!Array.isArray(input)) return [];
  const allowed = new Set<string>(ALL_VISIBLE_FIELDS);
  const seen = new Set<VisibleField>();
  for (const v of input) {
    if (typeof v === 'string' && allowed.has(v)) seen.add(v as VisibleField);
  }
  return Array.from(seen);
}

interface ShareListRow {
  id: number;
  token: string;
  root_person_id: number;
  title: string | null;
  created_at: number;
  expires_at: number | null;
  mode: 'tree' | 'person';
  hide_sensitive: number;
  visible_fields: string;
  password_encrypted: string;
  root_deleted_at: number | null;
}

export async function GET(_request: Request, env: Env): Promise<Response> {
  const { results } = await env.DB.prepare(
    `SELECT s.id, s.token, s.root_person_id, s.title, s.created_at, s.expires_at,
            s.mode, s.hide_sensitive, s.visible_fields, s.password_encrypted,
            p.deleted_at AS root_deleted_at
       FROM shares s
       LEFT JOIN persons p ON p.id = s.root_person_id
      ORDER BY s.created_at DESC`
  ).all<ShareListRow>();

  const data = await Promise.all(
    (results ?? []).map(async (r) => {
      let password: string | null = null;
      try {
        password = await decryptSharePassword(env, r.password_encrypted);
      } catch {
        password = null;
      }
      const { password_encrypted: _omit, ...rest } = r;
      void _omit;
      return { ...rest, password };
    })
  );

  return json({ data });
}

interface CreateBody {
  root_person_id: number;
  title?: string;
  password: string;
  expires_days?: number;
  mode?: 'tree' | 'person';
  visible_fields?: unknown;
}

export async function POST(request: Request, env: Env): Promise<Response> {
  let body: CreateBody;
  try {
    body = (await request.json()) as CreateBody;
  } catch {
    return bad(400, 'Invalid JSON body');
  }

  if (!body.root_person_id || !body.password?.trim()) {
    return bad(400, '缺少必要参数');
  }
  if (body.password.trim().length < 4) {
    return bad(400, '访问密码至少 4 位');
  }

  const mode: 'tree' | 'person' = body.mode === 'person' ? 'person' : 'tree';
  const visibleFields =
    mode === 'person' ? normalizeVisibleFields(body.visible_fields) : [];

  const password = body.password.trim();
  const token = generateToken();
  const passwordEncrypted = await encryptSharePassword(env, password);
  const expiresAt = body.expires_days
    ? Math.floor(Date.now() / 1000) + body.expires_days * 86400
    : null;

  const hideSensitiveLegacy = mode === 'person' && visibleFields.length === 0 ? 1 : 0;

  const result = await env.DB.prepare(
    `INSERT INTO shares
       (token, root_person_id, title, password_encrypted, expires_at,
        mode, hide_sensitive, visible_fields)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     RETURNING id, token, root_person_id, title, created_at, expires_at, mode,
               hide_sensitive, visible_fields`
  )
    .bind(
      token,
      body.root_person_id,
      body.title?.trim() || null,
      passwordEncrypted,
      expiresAt,
      mode,
      hideSensitiveLegacy,
      JSON.stringify(visibleFields)
    )
    .first();

  return json({ data: { ...result, password } }, { status: 201 });
}
