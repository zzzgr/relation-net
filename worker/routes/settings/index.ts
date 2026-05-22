import type { Env } from '../../lib/http';
import { bad, json } from '../../lib/http';

interface SettingRow {
  key: string;
  value: string;
}

const RESERVED_SETTING_KEYS = new Set([
  'password_hash',
  'password_salt',
  'share_encryption_key',
]);

export async function GET(_request: Request, env: Env): Promise<Response> {
  const { results } = await env.DB.prepare('SELECT key, value FROM settings').all<SettingRow>();
  const dict: Record<string, string> = {};
  for (const r of results ?? []) {
    if (RESERVED_SETTING_KEYS.has(r.key)) continue;
    dict[r.key] = r.value;
  }
  return json({ data: dict });
}

interface SettingsInput {
  [key: string]: string | null;
}

export async function PUT(request: Request, env: Env): Promise<Response> {
  let body: SettingsInput;
  try {
    body = (await request.json()) as SettingsInput;
  } catch {
    return bad(400, 'Invalid JSON body');
  }

  const stmts: D1PreparedStatement[] = [];
  for (const [key, value] of Object.entries(body)) {
    if (RESERVED_SETTING_KEYS.has(key)) continue;
    if (value === null) {
      stmts.push(env.DB.prepare('DELETE FROM settings WHERE key = ?').bind(key));
    } else {
      stmts.push(
        env.DB.prepare(
          `INSERT INTO settings (key, value) VALUES (?, ?)
           ON CONFLICT(key) DO UPDATE SET value = excluded.value`
        ).bind(key, value)
      );
    }
  }
  if (stmts.length) await env.DB.batch(stmts);
  return json({ ok: true });
}
