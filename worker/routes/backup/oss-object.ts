import type { Env } from '../../lib/http';
import { bad } from '../../lib/http';
import {
  downloadBackupObject,
  makeAwsClient,
  readS3BackupConfig,
} from '../../lib/backupOss';
import { validateBackupKey } from '../../lib/backupKey';

export async function GET(request: Request, env: Env): Promise<Response> {
  const cfg = await readS3BackupConfig(env);
  if (!cfg) return bad(400, '请先在「设置 → 存储」中完成备份存储配置');

  const url = new URL(request.url);
  const keyCheck = validateBackupKey(url.searchParams.get('key'), cfg.prefix);
  if (!keyCheck.ok) return bad(400, keyCheck.error);

  const aws = makeAwsClient(cfg);

  let text: string;
  try {
    text = await downloadBackupObject(aws, cfg, keyCheck.key);
  } catch (e) {
    return bad(502, `从对象存储下载失败：${(e as Error).message}`);
  }

  const basename = keyCheck.key.slice(keyCheck.key.lastIndexOf('/') + 1);
  return new Response(text, {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${basename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
