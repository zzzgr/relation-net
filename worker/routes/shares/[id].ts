import type { Env } from '../../lib/http';
import { bad, json } from '../../lib/http';
import { encryptSharePassword } from '../../lib/shareCrypto';
import { ALL_VISIBLE_FIELDS, type VisibleField } from '../../lib/personMask';

export async function DELETE(_request: Request, env: Env, params: Record<string, string>): Promise<Response> {
  const id = Number(params.id);
  if (!Number.isFinite(id)) return bad(400, 'Invalid id');
  await env.DB.prepare('DELETE FROM shares WHERE id = ?').bind(id).run();
  return json({ ok: true });
}

interface PatchBody {
  password?: string;
  title?: string | null;
  expires_days?: number | null;
  visible_fields?: unknown;
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

export async function PATCH(request: Request, env: Env, params: Record<string, string>): Promise<Response> {
  const id = Number(params.id);
  if (!Number.isFinite(id)) return bad(400, 'Invalid id');

  let body: PatchBody;
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    return bad(400, 'Invalid JSON body');
  }

  const updates: string[] = [];
  const values: unknown[] = [];

  let newPassword: string | undefined;
  if (body.password !== undefined) {
    const pwd = body.password.trim();
    if (pwd.length < 4) return bad(400, '访问密码至少 4 位');
    const encrypted = await encryptSharePassword(env, pwd);
    updates.push('password_encrypted = ?');
    values.push(encrypted);
    newPassword = pwd;
  }

  if (body.title !== undefined) {
    updates.push('title = ?');
    values.push(body.title?.trim() || null);
  }

  if ('expires_days' in body) {
    let expiresAt: number | null;
    if (body.expires_days === null || body.expires_days === undefined || body.expires_days === 0) {
      expiresAt = null;
    } else {
      const days = Number(body.expires_days);
      if (!Number.isFinite(days) || days < 0) return bad(400, '有效期天数必须 >= 0');
      expiresAt = Math.floor(Date.now() / 1000) + days * 86400;
    }
    updates.push('expires_at = ?');
    values.push(expiresAt);
  }

  if (body.visible_fields !== undefined) {
    const visible = normalizeVisibleFields(body.visible_fields);
    updates.push('visible_fields = ?', 'hide_sensitive = ?');
    values.push(JSON.stringify(visible), visible.length === 0 ? 1 : 0);
  }

  if (updates.length === 0) return bad(400, '没有可更新的字段');

  values.push(id);
  const result = await env.DB.prepare(
    `UPDATE shares SET ${updates.join(', ')} WHERE id = ?
     RETURNING id, token, root_person_id, title, created_at, expires_at, mode,
               hide_sensitive, visible_fields`
  )
    .bind(...values)
    .first();

  if (!result) return bad(404, '分享不存在');
  return json({ data: { ...result, ...(newPassword !== undefined ? { password: newPassword } : {}) } });
}
