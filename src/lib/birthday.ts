import { Solar, Lunar, LunarYear } from 'lunar-javascript';
import type { Person } from '@/types';

export interface UpcomingBirthday {
  person: Person;
  days: number;
  type: 'solar' | 'lunar';
  label: string;
}

function parseBirthDate(bd: string | null): { year: number; month: number; day: number } | null {
  if (!bd) return null;
  const parts = bd.split('-').map(Number);
  if (parts.length >= 3 && parts[0] > 0 && parts[1] > 0 && parts[2] > 0) {
    return { year: parts[0], month: parts[1], day: parts[2] };
  }
  return null;
}

function daysBetween(from: Date, to: Date): number {
  return Math.ceil((to.getTime() - from.getTime()) / 86400000);
}

function nextSolarBirthday(month: number, day: number, today: Date): number {
  const thisYear = today.getFullYear();
  let next = new Date(thisYear, month - 1, day);
  if (next.getTime() < today.getTime() - 86400000) {
    next = new Date(thisYear + 1, month - 1, day);
  }
  return daysBetween(today, next);
}

function nextLunarBirthdays(
  lunarMonth: number,
  lunarDay: number,
  today: Date
): { days: number; isLeap: boolean; solarMonth: number; solarDay: number }[] {
  const results: { days: number; isLeap: boolean; solarMonth: number; solarDay: number }[] = [];
  const thisYear = today.getFullYear();

  for (const year of [thisYear, thisYear + 1]) {
    try {
      const lunar = Lunar.fromYmd(year, lunarMonth, lunarDay);
      const solar = lunar.getSolar();
      const solarDate = new Date(solar.getYear(), solar.getMonth() - 1, solar.getDay());
      const d = daysBetween(today, solarDate);
      if (d >= 0) results.push({ days: d, isLeap: false, solarMonth: solar.getMonth(), solarDay: solar.getDay() });
    } catch { /* date doesn't exist this year */ }

    const leapMonth = LunarYear.fromYear(year).getLeapMonth();
    if (leapMonth === lunarMonth) {
      try {
        const lunar = Lunar.fromYmd(year, -lunarMonth, lunarDay);
        const solar = lunar.getSolar();
        const solarDate = new Date(solar.getYear(), solar.getMonth() - 1, solar.getDay());
        const d = daysBetween(today, solarDate);
        if (d >= 0) results.push({ days: d, isLeap: true, solarMonth: solar.getMonth(), solarDay: solar.getDay() });
      } catch { /* leap month day doesn't exist */ }
    }
  }

  return results;
}

export function getUpcomingBirthdays(persons: Person[], withinDays = 30): UpcomingBirthday[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const results: UpcomingBirthday[] = [];

  for (const p of persons) {
    const bd = parseBirthDate(p.birth_date);
    if (!bd) continue;
    const cal = p.birth_calendar ?? 'solar';

    if (cal === 'solar' || cal === 'both') {
      const solarDays = nextSolarBirthday(bd.month, bd.day, today);
      if (solarDays <= withinDays) {
        results.push({
          person: p,
          days: solarDays,
          type: 'solar',
          label: `${bd.month}月${bd.day}日`,
        });
      }
    }

    if (cal === 'lunar' || cal === 'both') {
      try {
        const solar = Solar.fromYmd(bd.year, bd.month, bd.day);
        const lunar = solar.getLunar();
        const lm = lunar.getMonth();
        const ld = lunar.getDay();

        const lunarResults = nextLunarBirthdays(Math.abs(lm), ld, today);
        for (const lr of lunarResults) {
          if (lr.days <= withinDays) {
            results.push({
              person: p,
              days: lr.days,
              type: 'lunar',
              label: `农历${lr.isLeap ? '闰' : ''}${Math.abs(lm)}月${ld}日（${lr.solarMonth}月${lr.solarDay}日）`,
            });
          }
        }
      } catch { /* conversion failed, skip lunar */ }
    }
  }

  results.sort((a, b) => a.days - b.days);
  return results;
}
