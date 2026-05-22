// 备份 / 恢复 — 表元数据 + 共享 helper
//
// 顺序很关键：
//   - DELETE 时按依赖反向（先子表后父表）
//   - INSERT 时按依赖正向（先父表后子表）
//
// 所有表列名都在这里写死，避免后端通过 PRAGMA 取列名后被备份文件影响。

import type { Env } from './http';

export const TABLES_INSERT_ORDER = [
  'persons',
  'taxonomies',
  'settings',
  'relations',
  'person_phones',
  'person_addresses',
  'shares',
  'events',
  'event_persons',
] as const;

export type BackupTable = (typeof TABLES_INSERT_ORDER)[number];

export const TABLE_COLUMNS: Record<BackupTable, string[]> = {
  persons: [
    'id', 'nickname', 'standard_title', 'dialect_title', 'real_name', 'gender',
    'birth_date', 'kinship', 'avatar_url', 'avatar_char',
    'notes', 'deleted_at', 'created_at', 'updated_at',
  ],
  taxonomies: [
    'id', 'domain', 'key', 'label', 'icon_name', 'color_hex', 'order_index',
    'is_default', 'deleted_at', 'created_at',
  ],
  settings: ['key', 'value'],
  relations: [
    'id', 'from_person_id', 'to_person_id', 'relation_type', 'birth_order',
    'description', 'created_at',
  ],
  person_phones: ['id', 'person_id', 'phone', 'note', 'created_at'],
  person_addresses: [
    'id', 'person_id', 'address', 'longitude', 'latitude', 'label', 'created_at',
  ],
  shares: [
    'id', 'token', 'root_person_id', 'title', 'password_encrypted',
    'created_at', 'expires_at', 'mode', 'hide_sensitive', 'visible_fields',
  ],
  events: [
    'id', 'title', 'body', 'event_date', 'event_type', 'location', 'longitude',
    'latitude', 'media', 'created_at', 'updated_at', 'deleted_at',
  ],
  event_persons: ['event_id', 'person_id', 'role', 'created_at'],
};

export const BACKUP_VERSION = 1;

export const INSERT_BATCH_SIZE = 50;

export interface BackupPayload {
  version: number;
  exported_at: number;
  tables: Record<BackupTable, unknown[]>;
}

/** 全量读出所有表，组装成可 JSON 序列化的 payload。 */
export async function buildBackupPayload(env: Env): Promise<BackupPayload> {
  const tables: Record<BackupTable, unknown[]> = {} as Record<
    BackupTable,
    unknown[]
  >;
  for (const t of TABLES_INSERT_ORDER) {
    const cols = TABLE_COLUMNS[t].join(', ');
    const { results } = await env.DB.prepare(
      `SELECT ${cols} FROM ${t}`
    ).all();
    tables[t] = results ?? [];
  }
  return {
    version: BACKUP_VERSION,
    exported_at: Math.floor(Date.now() / 1000),
    tables,
  };
}

/** 标准化的备份文件名：`relation-net-backup-YYYY-MM-DD_HH-MM-SS.json`。 */
export function formatBackupFilename(now: Date): string {
  const stamp = now
    .toISOString()
    .replace(/:/g, '-')
    .replace(/\..+$/, '')
    .replace('T', '_');
  return `relation-net-backup-${stamp}.json`;
}

/** 校验外部传入的备份体。失败时抛 Error，文案直接面向用户。 */
export function assertValidBackupBody(body: unknown): asserts body is BackupPayload {
  if (!body || typeof body !== 'object') {
    throw new Error('备份缺少 tables 字段');
  }
  const b = body as Record<string, unknown>;
  if (b.version !== BACKUP_VERSION) {
    throw new Error(`不支持的备份版本：${(b.version as number | undefined) ?? '(空)'}`);
  }
  if (!b.tables || typeof b.tables !== 'object') {
    throw new Error('备份缺少 tables 字段');
  }
  const tables = b.tables as Record<string, unknown>;
  for (const t of Object.keys(tables)) {
    if (!(t in TABLE_COLUMNS)) {
      throw new Error(`备份里出现未知表：${t}`);
    }
    if (!Array.isArray(tables[t])) {
      throw new Error(`表 ${t} 不是数组`);
    }
  }
}

/**
 * 整库替换：按依赖反向 DELETE 全部表（含 sqlite_sequence 重置），
 * 然后按依赖正向分批 INSERT。
 * 失败时抛 Error 并附带表名/位置上下文。返回每表写入条数。
 *
 * 注意：DELETE 是一次 batch（原子），INSERT 是多次 batch（串行非事务）。
 * 中途失败会留下「全部 DELETE 完，部分 INSERT」的中间态——这是
 * D1 当前能力下的取舍。
 */
export async function applyRestore(
  env: Env,
  payload: BackupPayload
): Promise<Record<BackupTable, number>> {
  // 1. 清空所有表（按依赖反向 DELETE）+ 重置 sqlite_sequence
  const clearStmts = [
    ...[...TABLES_INSERT_ORDER]
      .reverse()
      .map((t) => env.DB.prepare(`DELETE FROM ${t}`)),
    env.DB.prepare(
      `DELETE FROM sqlite_sequence WHERE name IN (${TABLES_INSERT_ORDER.map(
        () => '?'
      ).join(',')})`
    ).bind(...TABLES_INSERT_ORDER),
  ];

  try {
    await env.DB.batch(clearStmts);
  } catch (e) {
    throw new Error(`清空旧数据失败：${(e as Error).message}`, { cause: e });
  }

  // 2. 按依赖正向 INSERT，分批 batch
  const counts: Record<BackupTable, number> = {} as Record<BackupTable, number>;
  for (const t of TABLES_INSERT_ORDER) {
    counts[t] = 0;
    const rows = (payload.tables[t] ?? []) as Record<string, unknown>[];
    if (rows.length === 0) continue;

    const cols = TABLE_COLUMNS[t];
    const placeholders = cols.map(() => '?').join(', ');
    const sql = `INSERT INTO ${t} (${cols.join(', ')}) VALUES (${placeholders})`;

    let batch: D1PreparedStatement[] = [];
    for (const row of rows) {
      const values = cols.map((c) => {
        const v = row[c];
        return v === undefined ? null : v;
      });
      batch.push(env.DB.prepare(sql).bind(...values));
      if (batch.length >= INSERT_BATCH_SIZE) {
        try {
          await env.DB.batch(batch);
        } catch (e) {
          throw new Error(
            `写入 ${t} 第 ${counts[t] + batch.length} 条时失败：${
              (e as Error).message
            }`,
            { cause: e }
          );
        }
        counts[t] += batch.length;
        batch = [];
      }
    }
    if (batch.length > 0) {
      try {
        await env.DB.batch(batch);
      } catch (e) {
        throw new Error(
          `写入 ${t} 最后一批失败：${(e as Error).message}`,
          { cause: e }
        );
      }
      counts[t] += batch.length;
    }
  }

  return counts;
}
