import type { Env } from '../../lib/http';
import { bad, json } from '../../lib/http';

export async function DELETE(_request: Request, env: Env, params: Record<string, string>): Promise<Response> {
  const id = Number(params.id);
  if (!Number.isFinite(id)) return bad(400, 'Invalid id');
  await env.DB.prepare('DELETE FROM relations WHERE id = ?').bind(id).run();
  return json({ ok: true });
}

interface PatchBody {
  birth_order?: number | null;
  description?: string | null;
}

export async function PATCH(request: Request, env: Env, params: Record<string, string>): Promise<Response> {
  const id = Number(params.id);
  if (!Number.isFinite(id)) return bad(400, 'Invalid id');

  let body: PatchBody;
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    return bad(400, 'Invalid JSON body');
  }

  const sets: string[] = [];
  const binds: unknown[] = [];
  if ('birth_order' in body) {
    const v = body.birth_order;
    const normalized =
      typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : null;
    sets.push('birth_order = ?');
    binds.push(normalized);
  }
  if ('description' in body) {
    sets.push('description = ?');
    binds.push(body.description ?? null);
  }
  if (sets.length === 0) return bad(400, '无可更新字段');

  binds.push(id);
  const result = await env.DB.prepare(
    `UPDATE relations SET ${sets.join(', ')} WHERE id = ? RETURNING *`
  )
    .bind(...binds)
    .first();
  if (!result) return bad(404, '关系不存在');
  return json({ data: result });
}
