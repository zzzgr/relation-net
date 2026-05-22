import type { Env } from '../../lib/http';
import { bad, json } from '../../lib/http';

interface TestBody {
  key?: string;
  security_code?: string;
}

interface AmapRestResp {
  status?: string;
  info?: string;
  infocode?: string;
}

const KEY_OK_BUT_PLATFORM_MISMATCH = new Set([
  'USERKEY_PLAT_NOMATCH',
  'INVALID_USER_SCODE',
  'NOT_SUPPORT_HTTPS',
]);

export async function POST(request: Request, _env: Env): Promise<Response> {
  let body: TestBody;
  try {
    body = (await request.json()) as TestBody;
  } catch {
    return bad(400, 'Invalid JSON body');
  }

  const key = (body.key || '').trim();
  if (!key) return bad(400, '请输入 Key');

  const url = `https://restapi.amap.com/v3/ip?key=${encodeURIComponent(key)}`;
  let data: AmapRestResp;
  try {
    const res = await fetch(url, { method: 'GET' });
    data = (await res.json()) as AmapRestResp;
  } catch (e) {
    console.error('[test-amap] fetch failed', e);
    return json({ ok: false, error: '无法连接到高德服务器，请稍后再试' });
  }

  if (data.status === '1') {
    return json({ ok: true });
  }
  const info = (data.info || '').toUpperCase();
  if (KEY_OK_BUT_PLATFORM_MISMATCH.has(info)) {
    return json({ ok: true, note: '已识别 Key（未启用 REST，但 JS API 可用）' });
  }
  if (info.includes('INVALID_USER_KEY') || data.infocode === '10001') {
    return json({ ok: false, error: 'Key 无效（INVALID_USER_KEY）' });
  }
  return json({ ok: false, error: data.info || '验证失败' });
}
