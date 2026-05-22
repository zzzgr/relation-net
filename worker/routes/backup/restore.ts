import type { Env } from '../../lib/http';
import { bad, json } from '../../lib/http';
import { applyRestore, assertValidBackupBody } from '../../lib/backup';

export async function POST(request: Request, env: Env): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return bad(400, '备份文件解析失败：不是合法 JSON');
  }

  try {
    assertValidBackupBody(body);
  } catch (e) {
    return bad(400, (e as Error).message);
  }

  try {
    const counts = await applyRestore(env, body);
    return json({ ok: true, counts });
  } catch (e) {
    return bad(500, (e as Error).message);
  }
}
