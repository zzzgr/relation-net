import { apiFetch } from './client';
import type { Phone, PhoneInput } from '../types';

export async function listPhones(personId: number): Promise<Phone[]> {
  const res = await apiFetch<{ data: Phone[] }>(`/api/phones?person_id=${personId}`);
  return res.data;
}

export async function createPhone(input: PhoneInput): Promise<Phone> {
  const res = await apiFetch<{ data: Phone }>('/api/phones', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return res.data;
}

export async function updatePhone(
  id: number,
  patch: { phone: string; note?: string | null }
): Promise<Phone> {
  const res = await apiFetch<{ data: Phone }>(`/api/phones/${id}`, {
    method: 'PUT',
    body: JSON.stringify(patch),
  });
  return res.data;
}

export async function deletePhone(id: number): Promise<void> {
  await apiFetch(`/api/phones/${id}`, { method: 'DELETE' });
}
