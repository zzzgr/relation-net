import type { Env } from '../../lib/http';
import { bad, json } from '../../lib/http';
import { buildBackupPayload } from '../../lib/backup';
import {
  BACKUP_RETENTION,
  buildBackupObjectKey,
  makeAwsClient,
  pruneBackups,
  readS3BackupConfig,
  uploadBackupObject,
} from '../../lib/backupOss';

interface AutoBody {
  force?: boolean;
}

const COOLDOWN_SEC = 24 * 3600;

export async function POST(request: Request, env: Env): Promise<Response> {
  let body: AutoBody = {};
  try {
    body = (await request.json()) as AutoBody;
  } catch {
    // 允许空 body
  }
  const force = body.force === true;

  const { results } = await env.DB.prepare(
    `SELECT key, value FROM settings WHERE key IN ('auto_backup_enabled', 'last_auto_backup_at')`
  ).all<{ key: string; value: string }>();
  const settings: Record<string, string> = {};
  for (const r of results ?? []) settings[r.key] = r.value;

  const enabled = settings.auto_backup_enabled === '1';
  const lastTs = Number(settings.last_auto_backup_at || 0);
  const now = Math.floor(Date.now() / 1000);

  if (!force) {
    if (!enabled) {
      return bad(409, '未启用自动备份');
    }
    if (lastTs && now - lastTs < COOLDOWN_SEC) {
      return json({
        ok: true,
        skipped: true,
        reason: 'cooldown',
        last_auto_backup_at: lastTs,
      });
    }
  }

  const cfg = await readS3BackupConfig(env);
  if (!cfg) return bad(400, '请先在「设置 → 存储」中完成备份存储配置');

  const aws = makeAwsClient(cfg);
  const payload = await buildBackupPayload(env);
  const bodyJson = JSON.stringify(payload);
  const key = buildBackupObjectKey(cfg);

  let uploadedKey: string;
  try {
    uploadedKey = await uploadBackupObject(aws, cfg, key, bodyJson);
  } catch (e) {
    return bad(502, `上传到对象存储失败：${(e as Error).message}`);
  }

  await env.DB.prepare(
    `INSERT INTO settings (key, value) VALUES ('last_auto_backup_at', ?)
     ON CONFLICT(key) DO UPDATE SET value=excluded.value`
  ).bind(String(now)).run();

  let pruned: string[] = [];
  try {
    pruned = await pruneBackups(aws, cfg, BACKUP_RETENTION);
  } catch (e) {
    console.warn('[backup/auto] prune failed', (e as Error).message);
  }

  return json({
    ok: true,
    key: uploadedKey,
    size: bodyJson.length,
    last_auto_backup_at: now,
    pruned,
  });
}
