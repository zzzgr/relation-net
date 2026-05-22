import type { Env } from '../../lib/http';
import { json } from '../../lib/http';

export async function GET(_request: Request, env: Env): Promise<Response> {
  const row = await env.DB.prepare(
    "SELECT value FROM settings WHERE key = 'app_title'"
  ).first<{ value: string | null }>();
  const title = (row?.value ?? '').trim();
  return json({ data: { app_title: title || null } });
}
