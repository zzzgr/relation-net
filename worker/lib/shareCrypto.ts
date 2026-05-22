// 分享密码的可逆加密：AES-GCM + 应用级密钥，密钥首次使用时随机生成并写入 settings。
// 这样分享管理页可以解出明文密码，方便复制带密码的 URL。

import type { Env } from './http';

const SETTING_KEY = 'share_encryption_key';
const KEY_BYTES = 32;
const IV_BYTES = 12;

const keyCache = new WeakMap<Env, Promise<CryptoKey>>();

function bytesToHex(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i++) out += bytes[i].toString(16).padStart(2, '0');
  return out;
}

function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) throw new Error('Invalid hex');
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function bytesToB64(bytes: Uint8Array): string {
  let str = '';
  for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
  return btoa(str);
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function loadOrCreateKey(env: Env): Promise<CryptoKey> {
  const existing = await env.DB.prepare('SELECT value FROM settings WHERE key = ?')
    .bind(SETTING_KEY)
    .first<{ value: string }>();

  let hex = existing?.value?.trim();
  if (!hex) {
    const fresh = crypto.getRandomValues(new Uint8Array(KEY_BYTES));
    hex = bytesToHex(fresh);
    // INSERT OR IGNORE 处理并发首次创建：若另一请求已写入,我们再读一次取它的值
    await env.DB.prepare(
      'INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)'
    )
      .bind(SETTING_KEY, hex)
      .run();
    const reread = await env.DB.prepare('SELECT value FROM settings WHERE key = ?')
      .bind(SETTING_KEY)
      .first<{ value: string }>();
    hex = (reread?.value ?? hex).trim();
  }

  const raw = hexToBytes(hex);
  if (raw.length !== KEY_BYTES) throw new Error('Corrupt share encryption key');
  return crypto.subtle.importKey(
    'raw',
    raw as unknown as BufferSource,
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt']
  );
}

function getKey(env: Env): Promise<CryptoKey> {
  let p = keyCache.get(env);
  if (!p) {
    p = loadOrCreateKey(env).catch((e) => {
      keyCache.delete(env);
      throw e;
    });
    keyCache.set(env, p);
  }
  return p;
}

export async function encryptSharePassword(env: Env, plaintext: string): Promise<string> {
  const key = await getKey(env);
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const cipher = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as unknown as BufferSource },
    key,
    new TextEncoder().encode(plaintext)
  );
  const cipherBytes = new Uint8Array(cipher);
  const combined = new Uint8Array(iv.length + cipherBytes.length);
  combined.set(iv, 0);
  combined.set(cipherBytes, iv.length);
  return bytesToB64(combined);
}

export async function decryptSharePassword(env: Env, encoded: string): Promise<string> {
  const key = await getKey(env);
  const combined = b64ToBytes(encoded);
  if (combined.length <= IV_BYTES) throw new Error('Invalid ciphertext');
  const iv = combined.slice(0, IV_BYTES);
  const cipher = combined.slice(IV_BYTES);
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv as unknown as BufferSource },
    key,
    cipher as unknown as BufferSource
  );
  return new TextDecoder().decode(plain);
}
