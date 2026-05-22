import type { Env } from '../../lib/http';
import { bad, json } from '../../lib/http';

export async function GET(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const personId = url.searchParams.get('person_id');
  if (!personId) return bad(400, 'person_id 必填');

  const { results } = await env.DB.prepare(
    'SELECT * FROM person_phones WHERE person_id = ? ORDER BY id ASC'
  )
    .bind(Number(personId))
    .all();
  return json({ data: results });
}

interface PhoneInput {
  person_id?: number;
  phone?: string;
  note?: string | null;
}

export async function POST(request: Request, env: Env): Promise<Response> {
  let body: PhoneInput;
  try {
    body = (await request.json()) as PhoneInput;
  } catch {
    return bad(400, 'Invalid JSON body');
  }
  if (!body.person_id || !body.phone || !body.phone.trim()) {
    return bad(400, 'person_id 和 phone 必填');
  }

  const result = await env.DB.prepare(
    `INSERT INTO person_phones (person_id, phone, note)
     VALUES (?, ?, ?)
     RETURNING *`
  )
    .bind(body.person_id, body.phone.trim(), body.note?.trim() || null)
    .first();
  return json({ data: result }, { status: 201 });
}
