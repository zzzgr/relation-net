// 备份专用 S3 客户端
//
// 与头像上传完全独立：自己的 endpoint / region / bucket / 密钥 / 路径模板。
// 备份对象始终私有（不发 x-amz-acl: public-read），读取走 SigV4 GET。

import { AwsClient } from 'aws4fetch';
import type { Env } from './http';
import { substitutePath } from './pathTemplate';

export const DEFAULT_BACKUP_PATH_TEMPLATE =
  'backup/relation-net-backup-{yyyy}-{MM}-{dd}_{HH}-{mm}-{ss}.json';
export const BACKUP_RETENTION = 7;

export interface S3BackupConfig {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** 例如 `https://my-bucket.s3.example.com`（不带末尾斜杠）。 */
  bucketHost: string;
  /** 完整的 key 模板，含占位符 */
  pathTemplate: string;
  /** 静态前缀：模板第一个 `{` 之前的部分，用于 list 和校验 */
  prefix: string;
}

export interface OssBackupObject {
  key: string;
  size: number;
  lastModified: number;
}

/** 取模板第一个 `{` 之前的部分作为列表/校验用的静态前缀。
 *  归一化策略与 `substitutePath` 对齐：去掉前导 `/`、把 `//` 合并成 `/`，
 *  否则 `'/backup/...'` 这种模板会导致 list 前缀和实际 key 错位。 */
export function computeStaticPrefix(template: string): string {
  const i = template.indexOf('{');
  const head = i < 0 ? template : template.slice(0, i);
  return head.replace(/^\/+/, '').replace(/\/{2,}/g, '/');
}

/** 用当前时间和默认元信息把模板渲染成 key。 */
export function buildBackupObjectKey(cfg: S3BackupConfig): string {
  return substitutePath(cfg.pathTemplate, {
    ext: 'json',
    originalName: 'relation-net-backup',
    kind: 'backup',
  });
}

/** 读 5 个备份必填字段；任意缺失返回 null。template 缺省默认值；兼容旧 prefix。 */
export async function readS3BackupConfig(
  env: Env
): Promise<S3BackupConfig | null> {
  const { results } = await env.DB.prepare(
    `SELECT key, value FROM settings WHERE key IN (
      's3_backup_endpoint', 's3_backup_region', 's3_backup_bucket',
      's3_backup_access_key_id', 's3_backup_secret_access_key',
      's3_backup_path_template', 's3_backup_prefix'
    )`
  ).all<{ key: string; value: string }>();
  const cfg: Record<string, string> = {};
  for (const r of results ?? []) cfg[r.key] = r.value;

  const endpoint = (cfg.s3_backup_endpoint || '').trim();
  const bucket = (cfg.s3_backup_bucket || '').trim();
  const accessKeyId = (cfg.s3_backup_access_key_id || '').trim();
  const secretAccessKey = (cfg.s3_backup_secret_access_key || '').trim();
  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) return null;

  let normalizedEndpoint = endpoint;
  if (!/^https?:\/\//.test(normalizedEndpoint)) {
    normalizedEndpoint = `https://${normalizedEndpoint}`;
  }
  normalizedEndpoint = normalizedEndpoint.replace(/\/$/, '');

  const u = new URL(normalizedEndpoint);
  const bucketHost = `${u.protocol}//${bucket}.${u.host}`;

  // 优先新 template；缺失时按老 prefix 兜底拼出等价模板，最后落到默认值
  let pathTemplate = (cfg.s3_backup_path_template || '').trim();
  if (!pathTemplate) {
    const legacyPrefix = (cfg.s3_backup_prefix || '').trim();
    if (legacyPrefix) {
      const norm = legacyPrefix.replace(/^\/+/, '');
      const withSlash = norm.endsWith('/') ? norm : `${norm}/`;
      pathTemplate = `${withSlash}relation-net-backup-{yyyy}-{MM}-{dd}_{HH}-{mm}-{ss}.json`;
    } else {
      pathTemplate = DEFAULT_BACKUP_PATH_TEMPLATE;
    }
  }

  return {
    endpoint: normalizedEndpoint,
    region: (cfg.s3_backup_region || 'us-east-1').trim(),
    bucket,
    accessKeyId,
    secretAccessKey,
    bucketHost,
    pathTemplate,
    prefix: computeStaticPrefix(pathTemplate),
  };
}

export function makeAwsClient(cfg: S3BackupConfig): AwsClient {
  return new AwsClient({
    accessKeyId: cfg.accessKeyId,
    secretAccessKey: cfg.secretAccessKey,
    region: cfg.region,
    service: 's3',
  });
}

export function buildObjectUrl(cfg: S3BackupConfig, key: string): string {
  return `${cfg.bucketHost}/${encodeURI(key)}`;
}

/** PUT 一份私有备份对象到指定 key。成功返回 key 原值。 */
export async function uploadBackupObject(
  aws: AwsClient,
  cfg: S3BackupConfig,
  key: string,
  bodyJson: string
): Promise<string> {
  const body = new TextEncoder().encode(bodyJson);
  const res = await aws.fetch(buildObjectUrl(cfg, key), {
    method: 'PUT',
    body,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': String(body.byteLength),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    console.error('[backupOss] upload failed', res.status, text.slice(0, 500));
    throw new Error(`对象存储返回错误（${res.status}）`);
  }
  return key;
}

export async function downloadBackupObject(
  aws: AwsClient,
  cfg: S3BackupConfig,
  key: string
): Promise<string> {
  const res = await aws.fetch(buildObjectUrl(cfg, key), { method: 'GET' });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    console.error('[backupOss] download failed', res.status, text.slice(0, 500));
    throw new Error(`对象存储返回错误（${res.status}）`);
  }
  return await res.text();
}

export async function deleteBackupObject(
  aws: AwsClient,
  cfg: S3BackupConfig,
  key: string
): Promise<void> {
  const res = await aws.fetch(buildObjectUrl(cfg, key), { method: 'DELETE' });
  // 204 / 200 视为成功；404 视为已不存在，也算成功
  if (!res.ok && res.status !== 404) {
    const text = await res.text().catch(() => '');
    console.error('[backupOss] delete failed', res.status, text.slice(0, 500));
    throw new Error(`对象存储返回错误（${res.status}）`);
  }
}

const HTML_ENTITY: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&apos;': "'",
};

function decodeXmlText(s: string): string {
  return s.replace(/&(amp|lt|gt|quot|apos);/g, (m) => HTML_ENTITY[m] ?? m);
}

function pick(content: string, tag: string): string | null {
  const m = new RegExp(`<${tag}>([^<]*)</${tag}>`).exec(content);
  return m ? m[1] : null;
}

interface ParsedListPage {
  items: OssBackupObject[];
  isTruncated: boolean;
  nextToken: string | null;
}

function parseListV2(xml: string): ParsedListPage {
  const items: OssBackupObject[] = [];
  for (const m of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
    const block = m[1];
    const keyRaw = pick(block, 'Key');
    const lmRaw = pick(block, 'LastModified');
    const sizeRaw = pick(block, 'Size');
    if (!keyRaw || !lmRaw || !sizeRaw) {
      console.warn('[backupOss] skipped malformed <Contents>', block.slice(0, 200));
      continue;
    }
    const lastModified = Math.floor(Date.parse(lmRaw) / 1000);
    const size = Number(sizeRaw);
    if (!Number.isFinite(lastModified) || !Number.isFinite(size)) {
      console.warn('[backupOss] skipped non-numeric fields', block.slice(0, 200));
      continue;
    }
    items.push({
      key: decodeXmlText(keyRaw),
      size,
      lastModified,
    });
  }
  const isTruncated = pick(xml, 'IsTruncated') === 'true';
  const nextToken = pick(xml, 'NextContinuationToken');
  return { items, isTruncated, nextToken };
}

/** ListObjectsV2，自动分页。按 lastModified 降序（并列按 key 降序）。 */
export async function listBackupObjects(
  aws: AwsClient,
  cfg: S3BackupConfig
): Promise<OssBackupObject[]> {
  const all: OssBackupObject[] = [];
  let token: string | null = null;
  // 防御性上限：最多翻 10 页 = 10000 条
  for (let page = 0; page < 10; page++) {
    const params = new URLSearchParams();
    params.set('list-type', '2');
    if (cfg.prefix) params.set('prefix', cfg.prefix);
    params.set('max-keys', '1000');
    if (token) params.set('continuation-token', token);
    const url = `${cfg.bucketHost}/?${params.toString()}`;
    const res = await aws.fetch(url, { method: 'GET' });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.error('[backupOss] list failed', res.status, text.slice(0, 500));
      throw new Error(`对象存储返回错误（${res.status}）`);
    }
    const xml = await res.text();
    const page1 = parseListV2(xml);
    all.push(...page1.items);
    if (!page1.isTruncated || !page1.nextToken) break;
    token = page1.nextToken;
  }
  all.sort((a, b) => {
    if (b.lastModified !== a.lastModified) return b.lastModified - a.lastModified;
    return b.key.localeCompare(a.key);
  });
  return all;
}

/** 保留最近 keepN 份，其余删除。删除失败仅 warn。返回被删 key 列表。 */
export async function pruneBackups(
  aws: AwsClient,
  cfg: S3BackupConfig,
  keepN: number
): Promise<string[]> {
  const all = await listBackupObjects(aws, cfg);
  if (all.length <= keepN) return [];
  const stale = all.slice(keepN);
  const deleted: string[] = [];
  for (const obj of stale) {
    try {
      await deleteBackupObject(aws, cfg, obj.key);
      deleted.push(obj.key);
    } catch (e) {
      console.warn('[backupOss] prune delete failed', obj.key, (e as Error).message);
    }
  }
  return deleted;
}
