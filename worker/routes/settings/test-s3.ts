import { AwsClient } from 'aws4fetch';
import type { Env } from '../../lib/http';
import { bad, json } from '../../lib/http';

interface TestBody {
  s3_endpoint?: string;
  s3_region?: string;
  s3_bucket?: string;
  s3_access_key_id?: string;
  s3_secret_access_key?: string;
  s3_public_base?: string;
}

function buildUrl(endpoint: string, bucket: string, key: string): string {
  const u = new URL(endpoint);
  return `${u.protocol}//${bucket}.${u.host}/${encodeURI(key)}`;
}

function buildPublicUrl(publicBase: string | undefined, uploadUrl: string, key: string): string {
  if (publicBase) {
    const base = publicBase.replace(/\/$/, '');
    return `${base}/${encodeURI(key)}`;
  }
  return uploadUrl;
}

export async function POST(request: Request, _env: Env): Promise<Response> {
  let body: TestBody;
  try {
    body = (await request.json()) as TestBody;
  } catch {
    return bad(400, 'Invalid JSON body');
  }

  let endpoint = (body.s3_endpoint || '').trim();
  const bucket = (body.s3_bucket || '').trim();
  const accessKeyId = (body.s3_access_key_id || '').trim();
  const secretAccessKey = (body.s3_secret_access_key || '').trim();
  const region = (body.s3_region || 'us-east-1').trim();
  const publicBase = (body.s3_public_base || '').trim() || undefined;

  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) {
    return bad(400, '请填写完整的 Endpoint / Bucket / AccessKey / Secret');
  }
  if (!/^https?:\/\//.test(endpoint)) endpoint = `https://${endpoint}`;
  endpoint = endpoint.replace(/\/$/, '');

  const aws = new AwsClient({ accessKeyId, secretAccessKey, region, service: 's3' });

  const rand = Array.from(crypto.getRandomValues(new Uint8Array(6)))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  const testKey = `_health_check/${Date.now()}-${rand}.txt`;
  const uploadUrl = buildUrl(endpoint, bucket, testKey);

  let putRes: Response;
  try {
    putRes = await aws.fetch(uploadUrl, {
      method: 'PUT',
      body: 'ok',
      headers: {
        'Content-Type': 'text/plain',
        'x-amz-acl': 'public-read',
      },
    });
  } catch (e) {
    console.error('[test-s3] put network error', e);
    return json({ ok: false, error: '无法连接到对象存储（请检查 Endpoint）' });
  }
  if (!putRes.ok) {
    const text = await putRes.text().catch(() => '');
    const shortText = text.slice(0, 200);
    let hint = `上传失败 (${putRes.status})`;
    if (putRes.status === 403) hint += '：凭证无效 / 没有写权限';
    else if (putRes.status === 404) hint += '：Bucket 不存在 / 或 Endpoint 配置不对';
    else if (putRes.status === 400) hint += '：请求被拒绝（检查 Region / Endpoint）';
    return json({ ok: false, error: hint, detail: shortText || undefined });
  }

  const publicUrl = buildPublicUrl(publicBase, uploadUrl, testKey);
  let publicOk = false;
  let publicStatus = 0;
  let publicSnippet = '';
  try {
    const getRes = await fetch(publicUrl, { method: 'GET' });
    publicStatus = getRes.status;
    if (getRes.ok) {
      publicOk = true;
    } else {
      const t = await getRes.text().catch(() => '');
      publicSnippet = t.slice(0, 200);
    }
  } catch (e) {
    console.warn('[test-s3] public check error', e);
  }

  try {
    await aws.fetch(uploadUrl, { method: 'DELETE' });
  } catch (e) {
    console.warn('[test-s3] delete error', e);
  }

  if (!publicOk) {
    const baseMsg = `上传通过，但匿名访问失败 (${publicStatus || 'error'})`;
    const hint = publicBase
      ? `「公开访问 URL 前缀」指向的地址不可匿名读取。请确认该域名已绑定到 Bucket 并已开启公共读。`
      : `Bucket 不是「公共读」。请到对象存储控制台把 Bucket 改为公共读，或配置一个可公开访问的 CDN 域名填入「公开访问 URL 前缀」。`;
    return json({
      ok: false,
      error: `${baseMsg}：${hint}`,
      detail: publicSnippet || undefined,
    });
  }

  return json({ ok: true });
}
