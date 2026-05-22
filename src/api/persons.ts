import { apiFetch } from './client';
import type { Person, PersonInput } from '../types';
import type { Kinship } from '../lib/relations';

export interface ListPersonsParams {
  q?: string;
  kinship?: Kinship;
  gender?: 'male' | 'female' | 'unknown';
  deleted?: boolean;
}

export async function listPersons(params: ListPersonsParams = {}): Promise<Person[]> {
  const sp = new URLSearchParams();
  if (params.q) sp.set('q', params.q);
  if (params.kinship) sp.set('kinship', params.kinship);
  if (params.gender) sp.set('gender', params.gender);
  if (params.deleted) sp.set('deleted', '1');
  const qs = sp.toString();
  const res = await apiFetch<{ data: Person[] }>(`/api/persons${qs ? '?' + qs : ''}`);
  return res.data;
}

export async function getPerson(id: number): Promise<Person> {
  const res = await apiFetch<{ data: Person }>(`/api/persons/${id}`);
  return res.data;
}

export async function createPerson(input: PersonInput): Promise<Person> {
  const res = await apiFetch<{ data: Person }>('/api/persons', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return res.data;
}

export async function updatePerson(id: number, input: PersonInput): Promise<Person> {
  const res = await apiFetch<{ data: Person }>(`/api/persons/${id}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  });
  return res.data;
}

export async function deletePerson(id: number): Promise<void> {
  await apiFetch(`/api/persons/${id}`, { method: 'DELETE' });
}

export async function restorePerson(id: number): Promise<void> {
  await apiFetch(`/api/persons/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ action: 'restore' }),
  });
}

export async function purgePerson(id: number): Promise<void> {
  await apiFetch(`/api/persons/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ action: 'purge' }),
  });
}
