import type { Env } from '../../lib/http';
import { bad, json, getPassword, getSessionSecret, DEFAULT_PASSWORD } from '../../lib/http';
import {
  buildSessionCookieHeader,
  createSessionToken,
  verifyPassword,
} from '../../lib/auth';

interface LoginBody {
  password?: string;
}

interface SettingRow {
  key: string;
  value: string;
}

async function checkPassword(env: Env, password: string): Promise<boolean> {
  const { results } = await env.DB.prepare(
    "SELECT key, value FROM settings WHERE key IN ('password_hash', 'password_salt')"
  ).all<SettingRow>();
  const dict: Record<string, string> = {};
  for (const r of results ?? []) dict[r.key] = r.value;

  if (dict.password_hash && dict.password_salt) {
    return verifyPassword(password, dict.password_salt, dict.password_hash);
  }
  // 未设置过密码：接受 env 配置或默认 123456
  return password === getPassword(env) || password === DEFAULT_PASSWORD;
}

export async function POST(request: Request, env: Env): Promise<Response> {
  let body: LoginBody;
  try {
    body = (await request.json()) as LoginBody;
  } catch {
    return bad(400, 'Invalid JSON body');
  }

  if (!body.password || !(await checkPassword(env, body.password))) {
    return bad(401, '密码错误');
  }

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
