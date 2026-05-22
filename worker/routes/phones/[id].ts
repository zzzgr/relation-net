import type { Env } from '../../lib/http';
import { bad, json } from '../../lib/http';

interface PhoneInput {
  phone?: string;
  note?: string | null;
}

export async function PUT(request: Request, env: Env, params: Record<string, string>): Promise<Response> {
  const id = Number(params.id);
  if (!Number.isFinite(id)) return bad(400, 'Invalid id');

  let body: PhoneInput;
  try {
    body = (await request.json()) as PhoneInput;
  } catch {
    return bad(400, 'Invalid JSON body');
  }
  if (!body.phone || !body.phone.trim()) {
    return bad(400, 'phone 必填');
  }

  const result = await env.DB.prepare(
    `UPDATE person_phones SET phone = ?, note = ? WHERE id = ? RETURNING *`
  )
    .bind(body.phone.trim(), body.note?.trim() || null, id)
    .first();
  if (!result) return bad(404, 'Phone not found');
  return json({ data: result });
}

export async function DELETE(_request: Request, env: Env, params: Record<string, string>): Promise<Response> {
  const id = Number(params.id);
  if (!Number.isFinite(id)) return bad(400, 'Invalid id');
  await env.DB.prepare('DELETE FROM person_phones WHERE id = ?').bind(id).run();
  return json({ ok: true });
}
