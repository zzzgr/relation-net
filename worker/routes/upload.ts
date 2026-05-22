import { AwsClient } from 'aws4fetch';
import type { Env } from '../lib/http';
import { bad, json } from '../lib/http';
import { DEFAULT_S3_PATH_TEMPLATE, substitutePath } from '../lib/pathTemplate';

interface S3Config {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  publicBase?: string;
  pathTemplate: string;
}

async function readS3Config(env: Env): Promise<S3Config | { error: string }> {
  const { results } = await env.DB.prepare(
    `SELECT key, value FROM settings WHERE key IN (
      's3_endpoint', 's3_region', 's3_bucket', 's3_access_key_id',
      's3_secret_access_key', 's3_public_base', 's3_path_template'
    )`
  ).all<{ key: string; value: string }>();
  const cfg: Record<string, string> = {};
  for (const r of results ?? []) cfg[r.key] = r.value;

  const endpoint = (cfg.s3_endpoint || '').trim();
  const bucket = (cfg.s3_bucket || '').trim();
  const accessKeyId = (cfg.s3_access_key_id || '').trim();
  const secretAccessKey = (cfg.s3_secret_access_key || '').trim();
  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) {
    return { error: '请先在「设置 → 存储」中完成公共文件存储配置' };
  }
  let normalizedEndpoint = endpoint;
  if (!/^https?:\/\//.test(normalizedEndpoint)) {
    normalizedEndpoint = `https://${normalizedEndpoint}`;
  }
  normalizedEndpoint = normalizedEndpoint.replace(/\/$/, '');

  return {
    endpoint: normalizedEndpoint,
    region: (cfg.s3_region || 'us-east-1').trim(),
    bucket,
    accessKeyId,
    secretAccessKey,
    publicBase: (cfg.s3_public_base || '').trim() || undefined,
    pathTemplate: (cfg.s3_path_template || '').trim() || DEFAULT_S3_PATH_TEMPLATE,
  };
}

const IMAGE_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'image/bmp',
]);
const VIDEO_MIME = new Set([
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'video/ogg',
  'video/x-matroska',
]);
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_VIDEO_BYTES = 90 * 1024 * 1024;

function extFromMime(mime: string, fallbackName: string): string {
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/svg+xml': 'svg',
    'image/bmp': 'bmp',
    'video/mp4': 'mp4',
    'video/webm': 'webm',
    'video/quicktime': 'mov',
    'video/ogg': 'ogv',
    'video/x-matroska': 'mkv',
  };
  if (map[mime]) return map[mime];
  const dot = fallbackName.lastIndexOf('.');
  if (dot >= 0) return fallbackName.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin';
  return 'bin';
}

function buildUploadUrl(cfg: S3Config, key: string): string {
  const u = new URL(cfg.endpoint);
  return `${u.protocol}//${cfg.bucket}.${u.host}/${encodeURI(key)}`;
}

function buildPublicUrl(cfg: S3Config, uploadUrl: string, key: string): string {
  if (cfg.publicBase) {
    const base = cfg.publicBase.replace(/\/$/, '');
    return `${base}/${encodeURI(key)}`;
  }
  return uploadUrl;
}

export async function POST(request: Request, env: Env): Promise<Response> {
  const cfgOrErr = await readS3Config(env);
  if ('error' in cfgOrErr) return bad(400, cfgOrErr.error);
  const cfg = cfgOrErr;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return bad(400, '请求格式错误（需要 multipart/form-data）');
  }
  const file = form.get('file');
  if (!(file instanceof File)) return bad(400, '未提供文件');
  if (file.size === 0) return bad(400, '文件为空');
  const mime = file.type || 'application/octet-stream';
  const isImage = IMAGE_MIME.has(mime);
  const isVideo = VIDEO_MIME.has(mime);
  if (!isImage && !isVideo) {
    return bad(415, '仅支持图片 / 视频类型');
  }
  const maxBytes = isVideo ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
  if (file.size > maxBytes) {
    return bad(413, `文件不能超过 ${Math.floor(maxBytes / 1024 / 1024)}MB`);
  }

  const kindRaw = form.get('kind');
  const kind =
    typeof kindRaw === 'string' && /^[a-z0-9_-]{1,32}$/i.test(kindRaw)
      ? kindRaw
      : isVideo
        ? 'video'
        : 'avatar';

  const ext = extFromMime(mime, file.name || '');
  const objectKey = substitutePath(cfg.pathTemplate, {
    ext,
    originalName: file.name || '',
    kind,
  });
  const uploadUrl = buildUploadUrl(cfg, objectKey);

  const aws = new AwsClient({
    accessKeyId: cfg.accessKeyId,
    secretAccessKey: cfg.secretAccessKey,
    region: cfg.region,
    service: 's3',
  });

  const body = await file.arrayBuffer();
  let res: Response;
  try {
    res = await aws.fetch(uploadUrl, {
      method: 'PUT',
      body,
      headers: {
        'Content-Type': mime,
        'Content-Length': String(body.byteLength),
        'x-amz-acl': 'public-read',
      },
    });
  } catch (e) {
    console.error('[upload] network error', e);
    return bad(502, '上传失败：无法连接到对象存储');
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    console.error('[upload] s3 responded', res.status, text.slice(0, 500));
    return bad(502, `对象存储返回错误（${res.status}）`);
  }

  const publicUrl = buildPublicUrl(cfg, uploadUrl, objectKey);
  return json({
    data: {
      url: publicUrl,
      key: objectKey,
      type: isVideo ? 'video' : 'image',
      mime,
      size: file.size,
    },
  });
}
