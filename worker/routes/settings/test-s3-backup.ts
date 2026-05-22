import { AwsClient } from 'aws4fetch';
import type { Env } from '../../lib/http';
import { bad, json } from '../../lib/http';
import {
  DEFAULT_BACKUP_PATH_TEMPLATE,
  computeStaticPrefix,
} from '../../lib/backupOss';
import { substitutePath } from '../../lib/pathTemplate';

interface TestBody {
  s3_backup_endpoint?: string;
  s3_backup_region?: string;
  s3_backup_bucket?: string;
  s3_backup_access_key_id?: string;
  s3_backup_secret_access_key?: string;
  s3_backup_path_template?: string;
}

function buildUrl(endpoint: string, bucket: string, key: string): string {
  const u = new URL(endpoint);
  return `${u.protocol}//${bucket}.${u.host}/${encodeURI(key)}`;
}

export async function POST(request: Request, _env: Env): Promise<Response> {
  let body: TestBody;
  try {
    body = (await request.json()) as TestBody;
  } catch {
    return bad(400, 'Invalid JSON body');
  }

  let endpoint = (body.s3_backup_endpoint || '').trim();
  const bucket = (body.s3_backup_bucket || '').trim();
  const accessKeyId = (body.s3_backup_access_key_id || '').trim();
  const secretAccessKey = (body.s3_backup_secret_access_key || '').trim();
  const region = (body.s3_backup_region || 'us-east-1').trim();
  const pathTemplate =
    (body.s3_backup_path_template || '').trim() || DEFAULT_BACKUP_PATH_TEMPLATE;

  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) {
    return bad(400, '请填写完整的 Endpoint / Bucket / AccessKey / Secret');
  }
  if (!/^https?:\/\//.test(endpoint)) endpoint = `https://${endpoint}`;
  endpoint = endpoint.replace(/\/$/, '');

  const aws = new AwsClient({
    accessKeyId,
    secretAccessKey,
    region,
    service: 's3',
  });

  const staticPrefix = computeStaticPrefix(pathTemplate);
  const rand = Array.from(crypto.getRandomValues(new Uint8Array(6)))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  const testKey = `${staticPrefix}_health_check-${Date.now()}-${rand}.txt`;
  const objectUrl = buildUrl(endpoint, bucket, testKey);

  let putRes: Response;
  try {
    putRes = await aws.fetch(objectUrl, {
      method: 'PUT',
      body: 'ok',
      headers: { 'Content-Type': 'text/plain' },
    });
  } catch (e) {
    console.error('[test-s3-backup] put network error', e);
    return json({ ok: false, error: '无法连接到对象存储（请检查 Endpoint）' });
  }
  if (!putRes.ok) {
    const text = await putRes.text().catch(() => '');
    const shortText = text.slice(0, 200);
    let hint = `上传失败 (${putRes.status})`;
    if (putRes.status === 403) hint += '：凭证无效 / 没有写权限';
    else if (putRes.status === 404)
      hint += '：Bucket 不存在 / 或 Endpoint 配置不对';
    else if (putRes.status === 400)
      hint += '：请求被拒绝（检查 Region / Endpoint）';
    return json({ ok: false, error: hint, detail: shortText || undefined });
  }

  let getOk = false;
  let getStatus = 0;
  let getSnippet = '';
  try {
    const getRes = await aws.fetch(objectUrl, { method: 'GET' });
    getStatus = getRes.status;
    if (getRes.ok) {
      const text = await getRes.text().catch(() => '');
      getOk = text === 'ok';
      if (!getOk) getSnippet = text.slice(0, 200);
    } else {
      const t = await getRes.text().catch(() => '');
      getSnippet = t.slice(0, 200);
    }
  } catch (e) {
    console.warn('[test-s3-backup] get error', e);
  }

  let listOk = false;
  let listStatus = 0;
  let listSnippet = '';
  try {
    const u = new URL(endpoint);
    const listUrl = `${u.protocol}//${bucket}.${u.host}/?list-type=2&prefix=${encodeURIComponent(staticPrefix)}&max-keys=1`;
    const listRes = await aws.fetch(listUrl, { method: 'GET' });
    listStatus = listRes.status;
    if (listRes.ok) {
      await listRes.text().catch(() => '');
      listOk = true;
    } else {
      const t = await listRes.text().catch(() => '');
      listSnippet = t.slice(0, 200);
    }
  } catch (e) {
    console.warn('[test-s3-backup] list error', e);
  }

  try {
    await aws.fetch(objectUrl, { method: 'DELETE' });
  } catch (e) {
    console.warn('[test-s3-backup] delete error', e);
  }

  if (!getOk) {
    return json({
      ok: false,
      error: `上传通过，但签名读取失败 (${getStatus || 'error'})：请确认 AccessKey 也有 GetObject 权限`,
      detail: getSnippet || undefined,
    });
  }

  if (!listOk) {
    return json({
      ok: false,
      error: `上传 + 读取通过，但列出 Bucket 失败 (${listStatus || 'error'})：请确认 AccessKey 有 ListBucket 权限`,
      detail: listSnippet || undefined,
    });
  }

  const sampleKey = substitutePath(pathTemplate, {
    ext: 'json',
    originalName: 'relation-net-backup',
    kind: 'backup',
  });
  return json({ ok: true, note: `示例 key：${sampleKey}` });
}
