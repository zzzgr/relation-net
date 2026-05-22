import type { Env } from '../../lib/http';
import { buildBackupPayload, formatBackupFilename } from '../../lib/backup';

export async function GET(_request: Request, env: Env): Promise<Response> {
  const payload = await buildBackupPayload(env);
  const filename = formatBackupFilename(new Date());

  return new Response(JSON.stringify(payload, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
