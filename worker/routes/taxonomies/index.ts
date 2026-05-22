import type { Env } from '../../lib/http';
import { bad, json } from '../../lib/http';

const DOMAINS = new Set(['event_type', 'social_relation']);
const HEX_RE = /^#[0-9a-fA-F]{6}$/;
const KEY_RE = /^[a-z0-9_]{1,40}$/;

interface TaxonomyInput {
  domain?: string;
  key?: string;
  label?: string;
  icon_name?: string | null;
  color_hex?: string | null;
  order_index?: number;
}

interface TaxonomyRow {
  id: number;
  domain: string;
  key: string;
  label: string;
  icon_name: string | null;
  color_hex: string | null;
  order_index: number;
  is_default: number;
  is_anniversary: number;
  deleted_at: number | null;
  created_at: number;
}

function rowToResponse(row: TaxonomyRow) {
  return {
    id: row.id,
    domain: row.domain,
    key: row.key,
    label: row.label,
    icon_name: row.icon_name,
    color_hex: row.color_hex,
    order_index: row.order_index,
    is_default: row.is_default === 1,
    is_anniversary: row.is_anniversary === 1,
    deleted_at: row.deleted_at,
    created_at: row.created_at,
  };
}

export async function GET(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const domain = url.searchParams.get('domain');
  const includeHidden = url.searchParams.get('include_hidden') === '1';
  if (!domain || !DOMAINS.has(domain)) {
    return bad(400, 'Missing or invalid domain');
  }
  const sql = includeHidden
    ? 'SELECT * FROM taxonomies WHERE domain = ? ORDER BY order_index ASC, id ASC'
    : 'SELECT * FROM taxonomies WHERE domain = ? AND deleted_at IS NULL ORDER BY order_index ASC, id ASC';
  const { results } = await env.DB.prepare(sql)
    .bind(domain)
    .all<TaxonomyRow>();
  return json({ data: (results ?? []).map(rowToResponse) });
}

export async function POST(request: Request, env: Env): Promise<Response> {
  let body: TaxonomyInput;
  try {
    body = (await request.json()) as TaxonomyInput;
  } catch {
    return bad(400, 'Invalid JSON body');
  }

  const domain = body.domain ?? '';
  if (!DOMAINS.has(domain)) return bad(400, 'Invalid domain');

  const label = (body.label ?? '').trim();
  if (!label) return bad(400, '名称不能为空');
  if (label.length > 40) return bad(400, '名称过长');

  let key = (body.key ?? '').trim();
  if (!key) {
    const ts = Date.now().toString(36);
    const rand = Math.random().toString(36).slice(2, 6);
    key = `custom_${ts}${rand}`;
  } else if (!KEY_RE.test(key)) {
    return bad(400, 'key 只能用小写字母、数字、下划线，≤40 字符');
  }

  const iconName =
    typeof body.icon_name === 'string' && body.icon_name.trim()
      ? body.icon_name.trim().slice(0, 60)
      : null;
  const colorHex =
    typeof body.color_hex === 'string' && HEX_RE.test(body.color_hex)
      ? body.color_hex
      : null;

  let order = Number.isFinite(body.order_index)
    ? (body.order_index as number) | 0
    : -1;
  if (order < 0) {
    const max = await env.DB.prepare(
      'SELECT COALESCE(MAX(order_index), -1) AS max_idx FROM taxonomies WHERE domain = ?'
    )
      .bind(domain)
      .first<{ max_idx: number }>();
    order = (max?.max_idx ?? -1) + 1;
  }

  try {
    const inserted = await env.DB.prepare(
      `INSERT INTO taxonomies (domain, key, label, icon_name, color_hex, order_index, is_default)
       VALUES (?, ?, ?, ?, ?, ?, 0)
       RETURNING *`
    )
      .bind(domain, key, label, iconName, colorHex, order)
      .first<TaxonomyRow>();
    if (!inserted) return bad(500, '创建失败');
    return json({ data: rowToResponse(inserted) }, { status: 201 });
  } catch (e) {
    const msg = (e as Error).message ?? '';
    if (msg.includes('UNIQUE')) return bad(409, '同 key 已存在');
    return bad(500, msg || '创建失败');
  }
}
