import { apiFetch } from './client';
import type { Taxonomy, TaxonomyDomain, TaxonomyInput, TaxonomyPatch } from '../types';

export async function listTaxonomies(
  domain: TaxonomyDomain,
  opts: { includeHidden?: boolean } = {}
): Promise<Taxonomy[]> {
  const sp = new URLSearchParams();
  sp.set('domain', domain);
  if (opts.includeHidden) sp.set('include_hidden', '1');
  const res = await apiFetch<{ data: Taxonomy[] }>(
    `/api/taxonomies?${sp.toString()}`
  );
  return res.data;
}

export async function createTaxonomy(input: TaxonomyInput): Promise<Taxonomy> {
  const res = await apiFetch<{ data: Taxonomy }>('/api/taxonomies', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return res.data;
}

export async function updateTaxonomy(
  id: number,
  patch: TaxonomyPatch
): Promise<Taxonomy> {
  const res = await apiFetch<{ data: Taxonomy }>(`/api/taxonomies/${id}`, {
    method: 'PUT',
    body: JSON.stringify(patch),
  });
  return res.data;
}

export async function deleteTaxonomy(id: number): Promise<void> {
  await apiFetch(`/api/taxonomies/${id}`, { method: 'DELETE' });
}

export async function hideTaxonomy(id: number): Promise<void> {
  await apiFetch(`/api/taxonomies/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ action: 'hide' }),
  });
}

export async function showTaxonomy(id: number): Promise<void> {
  await apiFetch(`/api/taxonomies/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ action: 'show' }),
  });
}

export async function purgeTaxonomy(id: number): Promise<void> {
  await apiFetch(`/api/taxonomies/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ action: 'purge' }),
  });
}
