import type { Env } from '../../lib/http';
import { bad, json } from '../../lib/http';

export async function GET(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const personId = url.searchParams.get('person_id');

  if (personId) {
    const { results } = await env.DB.prepare(
      'SELECT * FROM person_addresses WHERE person_id = ? ORDER BY id ASC'
    )
      .bind(Number(personId))
      .all();
    return json({ data: results });
  }

  const { results } = await env.DB.prepare(
    `SELECT a.* FROM person_addresses a
       INNER JOIN persons p ON p.id = a.person_id
      WHERE p.deleted_at IS NULL
      ORDER BY a.person_id ASC, a.id ASC`
  ).all();
  return json({ data: results });
}

interface AddressInput {
  person_id?: number;
  address?: string;
  longitude?: number | null;
  latitude?: number | null;
  label?: string | null;
}

export async function POST(request: Request, env: Env): Promise<Response> {
  let body: AddressInput;
  try {
    body = (await request.json()) as AddressInput;
  } catch {
    return bad(400, 'Invalid JSON body');
  }
  if (!body.person_id || !body.address || !body.address.trim()) {
    return bad(400, 'person_id 和 address 必填');
  }

  const result = await env.DB.prepare(
    `INSERT INTO person_addresses (person_id, address, longitude, latitude, label)
     VALUES (?, ?, ?, ?, ?)
     RETURNING *`
  )
    .bind(
      body.person_id,
      body.address.trim(),
      body.longitude ?? null,
      body.latitude ?? null,
      body.label?.trim() || null
    )
    .first();
  return json({ data: result }, { status: 201 });
}
