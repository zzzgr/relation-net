import type { Env } from '../../lib/http';
import { bad, json } from '../../lib/http';

interface AddressInput {
  address?: string;
  longitude?: number | null;
  latitude?: number | null;
  label?: string | null;
}

export async function PUT(request: Request, env: Env, params: Record<string, string>): Promise<Response> {
  const id = Number(params.id);
  if (!Number.isFinite(id)) return bad(400, 'Invalid id');

  let body: AddressInput;
  try {
    body = (await request.json()) as AddressInput;
  } catch {
    return bad(400, 'Invalid JSON body');
  }
  if (!body.address || !body.address.trim()) {
    return bad(400, 'address 必填');
  }

  const result = await env.DB.prepare(
    `UPDATE person_addresses
        SET address = ?, longitude = ?, latitude = ?, label = ?
      WHERE id = ?
      RETURNING *`
  )
    .bind(
      body.address.trim(),
      body.longitude ?? null,
      body.latitude ?? null,
      body.label?.trim() || null,
      id
    )
    .first();
  if (!result) return bad(404, 'Address not found');
  return json({ data: result });
}

export async function DELETE(_request: Request, env: Env, params: Record<string, string>): Promise<Response> {
  const id = Number(params.id);
  if (!Number.isFinite(id)) return bad(400, 'Invalid id');
  await env.DB.prepare('DELETE FROM person_addresses WHERE id = ?').bind(id).run();
  return json({ ok: true });
}
