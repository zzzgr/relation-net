import type { Env } from '../../lib/http';
import { bad, json } from '../../lib/http';
import {
  deleteBackupObject,
  makeAwsClient,
  readS3BackupConfig,
} from '../../lib/backupOss';
import { validateBackupKey } from '../../lib/backupKey';

interface ReqBody {
  key?: unknown;
}

export async function POST(request: Request, env: Env): Promise<Response> {
  let body: ReqBody;
  try {
    body = (await request.json()) as ReqBody;
  } catch {
    return bad(400, '请求体不是合法 JSON');
  }

  const cfg = await readS3BackupConfig(env);
  if (!cfg) return bad(400, '请先在「设置 → 存储」中完成备份存储配置');

  const keyCheck = validateBackupKey(body.key, cfg.prefix);
  if (!keyCheck.ok) return bad(400, keyCheck.error);

  const aws = makeAwsClient(cfg);
  try {
    await deleteBackupObject(aws, cfg, keyCheck.key);
    return json({ ok: true });
  } catch (e) {
    return bad(502, (e as Error).message);
  }
}
