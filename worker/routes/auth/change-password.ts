import type { Env } from '../../lib/http';
import { bad, json, getPassword, getSessionSecret, DEFAULT_PASSWORD } from '../../lib/http';
import {
  buildSessionCookieHeader,
  createSessionToken,
  hashPassword,
  verifyPassword,
} from '../../lib/auth';

interface ChangePasswordBody {
  current_password?: string;
  new_password?: string;
}

interface SettingRow {
  key: string;
  value: string;
}

async function checkCurrent(env: Env, password: string): Promise<boolean> {
  const { results } = await env.DB.prepare(
    "SELECT key, value FROM settings WHERE key IN ('password_hash', 'password_salt')"
  ).all<SettingRow>();
  const dict: Record<string, string> = {};
  for (const r of results ?? []) dict[r.key] = r.value;
  if (dict.password_hash && dict.password_salt) {
    return verifyPassword(password, dict.password_salt, dict.password_hash);
  }
  return password === getPassword(env) || password === DEFAULT_PASSWORD;
}

export async function POST(request: Request, env: Env): Promise<Response> {
  let body: ChangePasswordBody;
  try {
    body = (await request.json()) as ChangePasswordBody;
  } catch {
    return bad(400, 'Invalid JSON body');
  }

  const current = (body.current_password ?? '').trim();
  const next = (body.new_password ?? '').trim();
  if (!current || !next) return bad(400, '当前密码和新密码都不能为空');
  if (next.length < 6) return bad(400, '新密码至少 6 位');
  if (next === current) return bad(400, '新密码不能与当前密码相同');

  if (!(await checkCurrent(env, current))) return bad(401, '当前密码错误');

  const { salt, hash } = await hashPassword(next);
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    ).bind('password_hash', hash),
    env.DB.prepare(
      `INSERT INTO settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    ).bind('password_salt', salt),
  ]);

  const token = await createSessionToken(await getSessionSecret(env));
  return json(
    { ok: true },
    {
      headers: {
        'Set-Cookie': buildSessionCookieHeader(token),
      },
    }
  );
}
