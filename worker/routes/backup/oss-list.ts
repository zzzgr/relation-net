import type { Env } from '../../lib/http';
import { json } from '../../lib/http';
import {
  listBackupObjects,
  makeAwsClient,
  readS3BackupConfig,
} from '../../lib/backupOss';

export async function GET(_request: Request, env: Env): Promise<Response> {
  const cfg = await readS3BackupConfig(env);
  if (!cfg) return json({ data: [], configured: false });

  const aws = makeAwsClient(cfg);
  try {
    const data = await listBackupObjects(aws, cfg);
    return json({ data, configured: true, prefix: cfg.prefix });
  } catch (e) {
    return json(
      { error: `读取对象存储失败：${(e as Error).message}` },
      { status: 502 }
    );
  }
}
