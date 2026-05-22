// 备份 / 恢复 — 前端 API
//
// 导出直接走浏览器下载（fetch + blob）；恢复 POST JSON 给后端，
// 后端事务性替换。

import { apiFetch } from './client';

const BACKUP_TABLES = [
  'persons',
  'taxonomies',
  'settings',
  'relations',
  'person_phones',
  'shares',
  'events',
  'event_persons',
] as const;

export type BackupTable = (typeof BACKUP_TABLES)[number];

export interface BackupPayload {
  version: number;
  exported_at: number;
  tables: Partial<Record<BackupTable, Record<string, unknown>[]>>;
}

export interface RestoreResult {
  ok: true;
  counts: Record<BackupTable, number>;
}

/** 触发浏览器下载备份文件 */
export async function downloadBackup(): Promise<void> {
  const res = await fetch('/api/backup', { credentials: 'include' });
  if (!res.ok) {
    let msg = `备份失败 (HTTP ${res.status})`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body?.error) msg = body.error;
    } catch {
      // ignore
    }
    throw new Error(msg);
  }

  const blob = await res.blob();
  // 文件名从 Content-Disposition 取，没有就用默认
  const cd = res.headers.get('content-disposition') ?? '';
  const m = /filename="([^"]+)"/.exec(cd);
  const filename = m?.[1] ?? `relation-net-backup-${Date.now()}.json`;

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function restoreBackup(payload: BackupPayload): Promise<RestoreResult> {
  const res = await fetch('/api/backup/restore', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = (await res.json()) as RestoreResult | { error?: string };
  if (!res.ok) {
    throw new Error((data as { error?: string }).error ?? `恢复失败 (HTTP ${res.status})`);
  }
  return data as RestoreResult;
}

/** 在浏览器里解析备份文件并基本校验 */
export async function parseBackupFile(file: File): Promise<BackupPayload> {
  const text = await file.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('文件不是合法 JSON');
  }
  if (
    !parsed ||
    typeof parsed !== 'object' ||
    typeof (parsed as { version?: unknown }).version !== 'number' ||
    typeof (parsed as { tables?: unknown }).tables !== 'object'
  ) {
    throw new Error('不是有效的备份文件（缺少 version / tables）');
  }
  return parsed as BackupPayload;
}

export const BACKUP_TABLE_LABELS: Record<BackupTable, string> = {
  persons: '人物',
  taxonomies: '分类',
  settings: '设置',
  relations: '关系',
  person_phones: '电话',
  shares: '分享',
  events: '事件',
  event_persons: '事件参与人',
};

export { BACKUP_TABLES };

// ───────────────────────────────────────────
// OSS 自动备份相关
// ───────────────────────────────────────────

export interface OssBackupItem {
  key: string;
  size: number;
  lastModified: number;
}

export interface OssBackupListResult {
  data: OssBackupItem[];
  configured: boolean;
  prefix?: string;
}

export interface AutoBackupResult {
  ok: true;
  skipped?: boolean;
  reason?: 'cooldown';
  key?: string;
  size?: number;
  last_auto_backup_at?: number;
  pruned?: string[];
}

export function listOssBackups(): Promise<OssBackupListResult> {
  return apiFetch<OssBackupListResult>('/api/backup/oss-list');
}

export function triggerAutoBackup(opts?: {
  force?: boolean;
}): Promise<AutoBackupResult> {
  return apiFetch<AutoBackupResult>('/api/backup/auto', {
    method: 'POST',
    body: JSON.stringify({ force: opts?.force ?? false }),
  });
}

export function restoreFromOss(key: string): Promise<RestoreResult> {
  return apiFetch<RestoreResult>('/api/backup/restore-from-oss', {
    method: 'POST',
    body: JSON.stringify({ key }),
  });
}

export function deleteOssBackup(key: string): Promise<void> {
  return apiFetch<void>('/api/backup/oss-delete', {
    method: 'POST',
    body: JSON.stringify({ key }),
  });
}

/** 触发浏览器下载某个 OSS 备份对象 */
export async function downloadOssBackup(key: string): Promise<void> {
  const res = await fetch(
    `/api/backup/oss-object?key=${encodeURIComponent(key)}`,
    { credentials: 'include' }
  );
  if (!res.ok) {
    let msg = `下载失败 (HTTP ${res.status})`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body?.error) msg = body.error;
    } catch {
      // ignore
    }
    throw new Error(msg);
  }
  const blob = await res.blob();
  const basename = key.slice(key.lastIndexOf('/') + 1) || 'backup.json';
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = basename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
