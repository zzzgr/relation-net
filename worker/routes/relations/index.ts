import type { Env } from '../../lib/http';
import { bad, json } from '../../lib/http';

export async function GET(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');

  const wheres: string[] = [];
  const binds: unknown[] = [];
  if (from) {
    wheres.push('from_person_id = ?');
    binds.push(Number(from));
  }
  if (to) {
    wheres.push('to_person_id = ?');
    binds.push(Number(to));
  }
  const whereSql = wheres.length ? ` WHERE ${wheres.join(' AND ')}` : '';
  const sql = `SELECT * FROM relations${whereSql} ORDER BY id DESC`;

  const stmt = binds.length ? env.DB.prepare(sql).bind(...binds) : env.DB.prepare(sql);
  const { results } = await stmt.all();
  return json({ data: results });
}

interface RelationInput {
  from_person_id: number;
  to_person_id: number;
  relation_type: string;
  birth_order?: number | null;
  description?: string | null;
}

const STRUCTURAL_TYPES = new Set(['parent', 'spouse']);
const RELATION_KEY_RE = /^[a-z0-9_]{1,40}$/;

export async function POST(request: Request, env: Env): Promise<Response> {
  let body: RelationInput;
  try {
    body = (await request.json()) as RelationInput;
  } catch {
    return bad(400, 'Invalid JSON body');
  }

  if (!body.from_person_id || !body.to_person_id || !body.relation_type) {
    return bad(400, 'from_person_id, to_person_id, relation_type 必填');
  }
  if (body.from_person_id === body.to_person_id) {
    return bad(400, '不允许自己指向自己');
  }
  if (
    !STRUCTURAL_TYPES.has(body.relation_type) &&
    !RELATION_KEY_RE.test(body.relation_type)
  ) {
    return bad(400, `不支持的关系类型：${body.relation_type}`);
  }

  const birthOrder =
    body.relation_type === 'parent' &&
    typeof body.birth_order === 'number' &&
    Number.isFinite(body.birth_order) &&
    body.birth_order > 0
      ? Math.floor(body.birth_order)
      : null;

  try {
    const result = await env.DB.prepare(
      `INSERT INTO relations (from_person_id, to_person_id, relation_type, birth_order, description)
       VALUES (?, ?, ?, ?, ?)
       RETURNING *`
    )
      .bind(
        body.from_person_id,
        body.to_person_id,
        body.relation_type,
        birthOrder,
        body.description ?? null
      )
      .first();
    return json({ data: result }, { status: 201 });
  } catch (e) {
    return bad(409, (e as Error).message ?? '关系已存在或参数无效');
  }
}
