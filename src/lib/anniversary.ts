import type { EventItem, Person, Taxonomy } from '@/types';

export interface UpcomingAnniversary {
  event: EventItem;
  days: number;
  years: number;
  label: string;
  subjects: Person[];
}

export function getUpcomingAnniversaries(
  events: EventItem[],
  taxonomies: Taxonomy[],
  persons: Person[],
  withinDays = 60
): UpcomingAnniversary[] {
  const anniversaryTypes = new Set(
    taxonomies
      .filter((t) => t.domain === 'event_type' && t.is_anniversary)
      .map((t) => t.key)
  );
  if (anniversaryTypes.size === 0) return [];

  const personById = new Map(persons.map((p) => [p.id, p]));
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const thisYear = today.getFullYear();
  const results: UpcomingAnniversary[] = [];

  for (const ev of events) {
    if (!anniversaryTypes.has(ev.event_type)) continue;
    if (!ev.event_date) continue;

    const parts = ev.event_date.split('-').map(Number);
    if (parts.length < 3 || !parts[1] || !parts[2]) continue;
    const [eventYear, month, day] = parts;
    if (!eventYear || eventYear >= thisYear) continue;

    let next = new Date(thisYear, month - 1, day);
    if (next.getTime() < today.getTime() - 86400000) {
      next = new Date(thisYear + 1, month - 1, day);
    }
    const d = Math.ceil((next.getTime() - today.getTime()) / 86400000);
    if (d > withinDays) continue;

    const subjectIds = ev.subject_ids?.length ? ev.subject_ids : ev.person_ids;
    const subjects = (subjectIds ?? [])
      .map((id) => personById.get(id))
      .filter((p): p is Person => !!p);

    const years = next.getFullYear() - eventYear;
    results.push({
      event: ev,
      days: d,
      years,
      label: `第${years}周年`,
      subjects,
    });
  }

  results.sort((a, b) => a.days - b.days);
  return results;
}
