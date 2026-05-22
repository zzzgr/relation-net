// 共享类型，所有 Pages Functions 共用

export interface Env {
  DB: D1Database;
  APP_PASSWORD?: string;
  SESSION_SECRET?: string;
}

export const DEFAULT_PASSWORD = 'admin';

export function getPassword(env: Env): string {
  return env.APP_PASSWORD || DEFAULT_PASSWORD;
}

export async function getSessionSecret(env: Env): Promise<string> {
  if (env.SESSION_SECRET) return env.SESSION_SECRET;

  const row = await env.DB.prepare(
    "SELECT value FROM settings WHERE key = 'session_secret'"
  ).first<{ value: string }>();
  if (row) return row.value;

  const secret = crypto.randomUUID() + crypto.randomUUID();
  await env.DB.prepare(
    "INSERT INTO settings (key, value) VALUES ('session_secret', ?)"
  ).bind(secret).run();
  return secret;
}

export const SESSION_COOKIE = 'session';
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 天

export function json(data: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...(init?.headers ?? {}),
    },
  });
}

export function bad(status: number, message: string): Response {
  return json({ error: message }, { status });
}
