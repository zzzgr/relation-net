import type { Env } from '../../lib/http';
import { json } from '../../lib/http';
import { buildClearSessionCookieHeader } from '../../lib/auth';

export async function POST(_request: Request, _env: Env): Promise<Response> {
  return json(
    { ok: true },
    {
      headers: {
        'Set-Cookie': buildClearSessionCookieHeader(),
      },
    }
  );
}
