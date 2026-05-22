import type { Env } from '../../lib/http';
import { bad, json } from '../../lib/http';

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

interface TaxonomyInput {
  label?: string;
  icon_name?: string | null;
  color_hex?: string | null;
  order_index?: number;
  is_anniversary?: boolean;
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

export async function PUT(request: Request, env: Env, params: Record<string, string>): Promise<Response> {
  const id = Number(params.id);
  if (!Number.isFinite(id)) return bad(400, 'Invalid id');

  let body: TaxonomyInput;
  try {
    body = (await request.json()) as TaxonomyInput;
  } catch {
    return bad(400, 'Invalid JSON body');
  }

  const label = (body.label ?? '').trim();
  if (!label) return bad(400, '名称不能为空');
  if (label.length > 40) return bad(400, '名称过长');
  const iconName =
    typeof body.icon_name === 'string' && body.icon_name.trim()
      ? body.icon_name.trim().slice(0, 60)
      : null;
  const colorHex =
    typeof body.color_hex === 'string' && HEX_RE.test(body.color_hex)
      ? body.color_hex
      : null;
  const orderIndex = Number.isFinite(body.order_index)
    ? (body.order_index as number) | 0
    : null;
  const isAnniversary = typeof body.is_anniversary === 'boolean'
    ? (body.is_anniversary ? 1 : 0)
    : null;

  const sets = ['label = ?', 'icon_name = ?', 'color_hex = ?'];
  const binds: unknown[] = [label, iconName, colorHex];
  if (orderIndex != null) { sets.push('order_index = ?'); binds.push(orderIndex); }
  if (isAnniversary != null) { sets.push('is_anniversary = ?'); binds.push(isAnniversary); }
  binds.push(id);

  const sql = `UPDATE taxonomies SET ${sets.join(', ')} WHERE id = ? RETURNING *`;
  const updated = await env.DB.prepare(sql)
    .bind(...binds)
    .first<TaxonomyRow>();
  if (!updated) return bad(404, '分类不存在');
  return json({ data: rowToResponse(updated) });
}

export async function DELETE(_request: Request, env: Env, params: Record<string, string>): Promise<Response> {
  const id = Number(params.id);
  if (!Number.isFinite(id)) return bad(400, 'Invalid id');
  const row = await env.DB.prepare('SELECT is_default FROM taxonomies WHERE id = ? AND deleted_at IS NULL')
    .bind(id)
    .first<{ is_default: number }>();
  if (!row) return bad(404, '分类不存在');
  if (row.is_default === 1) {
    return bad(400, '默认分类不能删除，只能隐藏');
  }
  await env.DB.prepare('UPDATE taxonomies SET deleted_at = unixepoch() WHERE id = ?').bind(id).run();
  return json({ ok: true });
}

export async function PATCH(request: Request, env: Env, params: Record<string, string>): Promise<Response> {
  const id = Number(params.id);
  if (!Number.isFinite(id)) return bad(400, 'Invalid id');

  let body: { action?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return bad(400, 'Invalid JSON body');
  }

  if (body.action === 'hide') {
    await env.DB.prepare('UPDATE taxonomies SET deleted_at = unixepoch() WHERE id = ?').bind(id).run();
    return json({ ok: true });
  }
  if (body.action === 'show') {
    await env.DB.prepare('UPDATE taxonomies SET deleted_at = NULL WHERE id = ?').bind(id).run();
    return json({ ok: true });
  }
  if (body.action === 'purge') {
    const row = await env.DB.prepare('SELECT is_default, deleted_at FROM taxonomies WHERE id = ?')
      .bind(id)
      .first<{ is_default: number; deleted_at: number | null }>();
    if (!row) return bad(404, '分类不存在');
    if (row.is_default === 1) return bad(400, '默认分类不能彻底删除，只能隐藏');
    if (!row.deleted_at) return bad(400, '请先把分类放进回收站');
    await env.DB.prepare('DELETE FROM taxonomies WHERE id = ?').bind(id).run();
    return json({ ok: true });
  }
  return bad(400, 'Unknown action');
}
