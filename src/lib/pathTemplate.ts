// 对象存储路径模板占位符替换
//
// 支持的占位符：
//   {yyyy} 4 位年  {yy} 2 位年
//   {MM}   2 位月  {M}  1-2 位月
//   {dd}   2 位日  {d}  1-2 位日
//   {HH}   2 位时  {mm} 2 位分  {ss} 2 位秒
//   {ts}   unix 毫秒
//   {rand} 12 位十六进制随机
//   {rand6} 6 位  {rand4} 4 位
//   {ext}  文件扩展名（不含点）
//   {name} 原始文件名（去掉扩展名，已清洗）
//
// 未识别的占位符保持原样。前导斜杠会被去掉。

export interface PathTemplateInput {
  ext?: string;
  originalName?: string;
  date?: Date;
  randomBytes?: (n: number) => Uint8Array;
  kind?: string;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function defaultRandomBytes(n: number): Uint8Array {
  const out = new Uint8Array(n);
  crypto.getRandomValues(out);
  return out;
}

function toHex(bytes: Uint8Array): string {
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
  const randFn = opts.randomBytes ?? defaultRandomBytes;

  const yyyy = String(date.getFullYear());
  const MM = pad2(date.getMonth() + 1);
  const dd = pad2(date.getDate());
  const HH = pad2(date.getHours());
  const mm = pad2(date.getMinutes());
  const ss = pad2(date.getSeconds());
  const ts = String(date.getTime());
  const rand12 = toHex(randFn(6));
  const rand6 = toHex(randFn(3));
  const rand4 = toHex(randFn(2));
  const ext = opts.ext || 'bin';
  const name = sanitizeName(opts.originalName) || 'file';
  const kind = (opts.kind || 'avatar').replace(/[^a-zA-Z0-9_-]/g, '');

  // 先替换更长的，避免 {rand} 被局部匹配掉 {rand4}/{rand6}（实际正则带 } 是安全的，但仍按长度排序更直观）
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
