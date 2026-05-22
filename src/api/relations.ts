import { apiFetch } from './client';
import type { Relation, RelationInput } from '../types';

export interface ListRelationsParams {
  from?: number;
  to?: number;
}

export async function listRelations(params: ListRelationsParams = {}): Promise<Relation[]> {
  const sp = new URLSearchParams();
  if (params.from) sp.set('from', String(params.from));
  if (params.to) sp.set('to', String(params.to));
  const qs = sp.toString();
  const res = await apiFetch<{ data: Relation[] }>(`/api/relations${qs ? '?' + qs : ''}`);
  return res.data;
}

export async function createRelation(input: RelationInput): Promise<Relation> {
  const res = await apiFetch<{ data: Relation }>('/api/relations', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return res.data;
}

export interface UpdateRelationInput {
  birth_order?: number | null;
  description?: string | null;
}

export async function updateRelation(
  id: number,
  input: UpdateRelationInput
): Promise<Relation> {
  const res = await apiFetch<{ data: Relation }>(`/api/relations/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
  return res.data;
}

export async function deleteRelation(id: number): Promise<void> {
  await apiFetch(`/api/relations/${id}`, { method: 'DELETE' });
}
