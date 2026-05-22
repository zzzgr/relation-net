import type { Env } from '../../lib/http';
import { bad, json } from '../../lib/http';
import { applyRestore, assertValidBackupBody } from '../../lib/backup';
import {
  downloadBackupObject,
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

  let text: string;
  try {
    text = await downloadBackupObject(aws, cfg, keyCheck.key);
  } catch (e) {
    return bad(502, `从对象存储下载失败：${(e as Error).message}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return bad(400, '对象存储里的备份文件不是合法 JSON');
  }

  try {
    assertValidBackupBody(parsed);
  } catch (e) {
    return bad(400, (e as Error).message);
  }

  try {
    const counts = await applyRestore(env, parsed);
    return json({ ok: true, counts });
  } catch (e) {
    return bad(500, (e as Error).message);
  }
}
