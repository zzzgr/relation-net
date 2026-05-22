import { apiFetch } from './client';
import type { Address, AddressInput } from '../types';

export async function listAddresses(personId?: number): Promise<Address[]> {
  const qs = personId != null ? `?person_id=${personId}` : '';
  const res = await apiFetch<{ data: Address[] }>(`/api/addresses${qs}`);
  return res.data;
}

export async function createAddress(input: AddressInput): Promise<Address> {
  const res = await apiFetch<{ data: Address }>('/api/addresses', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return res.data;
}

export async function updateAddress(
  id: number,
  patch: {
    address: string;
    longitude?: number | null;
    latitude?: number | null;
    label?: string | null;
  }
): Promise<Address> {
  const res = await apiFetch<{ data: Address }>(`/api/addresses/${id}`, {
    method: 'PUT',
    body: JSON.stringify(patch),
  });
  return res.data;
}

export async function deleteAddress(id: number): Promise<void> {
  await apiFetch(`/api/addresses/${id}`, { method: 'DELETE' });
}
