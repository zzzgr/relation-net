import { apiFetch } from './client';
import type { EventItem, EventInput } from '../types';

export interface ListEventsParams {
  offset?: number;
  limit?: number;
  event_type?: string;  // 类型筛选；不传则全部
  subject_only?: boolean;
}

export interface ListEventsResult {
  data: EventItem[];
  hasMore: boolean;
}

export async function listEvents(
  personId?: number,
  params: ListEventsParams = {}
): Promise<ListEventsResult> {
  const sp = new URLSearchParams();
  if (personId != null) sp.set('person_id', String(personId));
  if (params.offset != null) sp.set('offset', String(params.offset));
  if (params.limit != null) sp.set('limit', String(params.limit));
  if (params.event_type) sp.set('event_type', params.event_type);
  if (params.subject_only) sp.set('subject_only', '1');
  return apiFetch<ListEventsResult>(`/api/events?${sp.toString()}`);
}

export async function getEvent(id: number): Promise<EventItem> {
  const res = await apiFetch<{ data: EventItem }>(`/api/events/${id}`);
  return res.data;
}

export async function createEvent(input: EventInput): Promise<EventItem> {
  const res = await apiFetch<{ data: EventItem }>('/api/events', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return res.data;
}

export async function updateEvent(
  id: number,
  input: EventInput
): Promise<EventItem> {
  const res = await apiFetch<{ data: EventItem }>(`/api/events/${id}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  });
  return res.data;
}

export async function deleteEvent(id: number): Promise<void> {
  await apiFetch(`/api/events/${id}`, { method: 'DELETE' });
}

export async function restoreEvent(id: number): Promise<void> {
  await apiFetch(`/api/events/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ action: 'restore' }),
  });
}

export async function purgeEvent(id: number): Promise<void> {
  await apiFetch(`/api/events/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ action: 'purge' }),
  });
}
