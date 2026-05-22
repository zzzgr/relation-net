// 对象存储路径模板占位符替换（与 src/lib/pathTemplate.ts 保持一致）
//
// Pages Functions 无法跨目录 import src/，所以这里独立一份。

export interface PathTemplateInput {
  ext?: string;
  originalName?: string;
  date?: Date;
  kind?: string;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function randomHex(byteLen: number): string {
  const bytes = new Uint8Array(byteLen);
  crypto.getRandomValues(bytes);
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += bytes[i].toString(16).padStart(2, '0');
  return s;
}

function sanitizeName(name: string | undefined): string {
  if (!name) return '';
  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  return stem
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

export function substitutePath(template: string, opts: PathTemplateInput = {}): string {
  const date = opts.date ?? new Date();
  const yyyy = String(date.getFullYear());
  const MM = pad2(date.getMonth() + 1);
  const dd = pad2(date.getDate());
  const HH = pad2(date.getHours());
  const mm = pad2(date.getMinutes());
  const ss = pad2(date.getSeconds());
  const ts = String(date.getTime());
  const rand12 = randomHex(6);
  const rand6 = randomHex(3);
  const rand4 = randomHex(2);
  const ext = opts.ext || 'bin';
  const name = sanitizeName(opts.originalName) || 'file';
  const kind = (opts.kind || 'avatar').replace(/[^a-zA-Z0-9_-]/g, '');

  return template
    .replace(/\{yyyy\}/g, yyyy)
    .replace(/\{yy\}/g, yyyy.slice(-2))
    .replace(/\{MM\}/g, MM)
    .replace(/\{M\}/g, String(date.getMonth() + 1))
    .replace(/\{dd\}/g, dd)
    .replace(/\{d\}/g, String(date.getDate()))
    .replace(/\{HH\}/g, HH)
    .replace(/\{mm\}/g, mm)
    .replace(/\{ss\}/g, ss)
    .replace(/\{ts\}/g, ts)
    .replace(/\{rand6\}/g, rand6)
    .replace(/\{rand4\}/g, rand4)
    .replace(/\{rand\}/g, rand12)
    .replace(/\{kind\}/g, kind || 'media')
    .replace(/\{ext\}/g, ext)
    .replace(/\{name\}/g, name)
    .replace(/^\/+/, '')
    .replace(/\/{2,}/g, '/');
}

export const DEFAULT_S3_PATH_TEMPLATE = '{kind}/{yyyy}{MM}{dd}/{ts}-{rand6}.{ext}';
