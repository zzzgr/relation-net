// HMAC-SHA256 签名 cookie。WebCrypto 实现，可在 Workers 边缘运行。

import { SESSION_TTL_MS } from './http';

interface SessionPayload {
  // 这是个共享密码方案，没有用户名/ID
  iat: number; // issued at (ms)
  exp: number; // expires at (ms)
}

function b64urlEncode(bytes: Uint8Array): string {
  let str = '';
  for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(s: string): Uint8Array {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hmac(secret: string, data: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return new Uint8Array(sig);
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export async function createSessionToken(secret: string): Promise<string> {
  const now = Date.now();
  const payload: SessionPayload = { iat: now, exp: now + SESSION_TTL_MS };
  const payloadB64 = b64urlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const sig = await hmac(secret, payloadB64);
  return `${payloadB64}.${b64urlEncode(sig)}`;
}

export async function verifySessionToken(token: string, secret: string): Promise<boolean> {
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const [payloadB64, sigB64] = parts;
  const expected = await hmac(secret, payloadB64);
  const got = b64urlDecode(sigB64);
  if (!timingSafeEqual(expected, got)) return false;
  try {
    const payload = JSON.parse(new TextDecoder().decode(b64urlDecode(payloadB64))) as SessionPayload;
    if (payload.exp < Date.now()) return false;
    return true;
  } catch {
    return false;
  }
}

export function readSessionCookie(request: Request): string | null {
  const cookie = request.headers.get('cookie') || '';
  for (const part of cookie.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === 'session') return decodeURIComponent(v.join('='));
  }
  return null;
}

export function buildSessionCookieHeader(token: string): string {
  // httpOnly + sameSite=lax 够用；生产环境 Pages 默认 https，无需手动 Secure
  const maxAge = Math.floor(SESSION_TTL_MS / 1000);
  return `session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`;
}

export function buildClearSessionCookieHeader(): string {
  return 'session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0';
}

// ────────────────────────────────────────────────────────
// 密码哈希:PBKDF2-SHA256 + 随机盐,16 字节盐 + 32 字节哈希,均以 hex 存
// 用于把"修改密码"后的新密码持久化到 settings 表(原 APP_PASSWORD
// 环境变量是只读的,只能作为首次启动 bootstrap 的回退)。
// ────────────────────────────────────────────────────────

const PBKDF2_ITERATIONS = 100_000;
const PBKDF2_HASH_BYTES = 32;
const PBKDF2_SALT_BYTES = 16;

function bytesToHex(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i].toString(16).padStart(2, '0');
  }
  return out;
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.trim();
  if (clean.length % 2 !== 0) throw new Error('Invalid hex');
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

async function pbkdf2(password: string, salt: Uint8Array): Promise<Uint8Array> {
  const baseKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      // WebCrypto 期望 BufferSource;Uint8Array 在所有 runtime 都被接受,但 TS 类型挑剔
      salt: salt as unknown as BufferSource,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    baseKey,
    PBKDF2_HASH_BYTES * 8
  );
  return new Uint8Array(bits);
}

export async function hashPassword(password: string): Promise<{ salt: string; hash: string }> {
  const salt = crypto.getRandomValues(new Uint8Array(PBKDF2_SALT_BYTES));
  const hash = await pbkdf2(password, salt);
  return { salt: bytesToHex(salt), hash: bytesToHex(hash) };
}

export async function verifyPassword(
  password: string,
  saltHex: string,
  hashHex: string
): Promise<boolean> {
  try {
    const salt = hexToBytes(saltHex);
    const expected = hexToBytes(hashHex);
    const got = await pbkdf2(password, salt);
    return timingSafeEqual(expected, got);
  } catch {
    return false;
  }
}
