// 单人分享：服务端按可见字段集合做脱敏。
//
// 与前端无关 —— 一定要在响应里把字段处理好，不能依赖前端隐藏。

export type VisibleField =
  | 'real_name'
  | 'birth_date'
  | 'address'
  | 'notes'
  | 'phones'
  | 'events'
  | 'event_map';

export const ALL_VISIBLE_FIELDS: readonly VisibleField[] = [
  'real_name',
  'birth_date',
  'address',
  'notes',
  'phones',
  'events',
  'event_map',
] as const;

interface PersonRow {
  id: number;
  nickname: string | null;
  standard_title: string | null;
  dialect_title: string | null;
  real_name: string | null;
  gender: string;
  birth_date: string | null;
  kinship: string;
  avatar_url: string | null;
  notes: string | null;
  created_at: number;
  updated_at: number;
}

interface PhoneRow {
  id: number;
  person_id: number;
  phone: string;
  note: string | null;
  created_at: number;
}

export interface AddressRow {
  id: number;
  person_id: number;
  address: string;
  longitude: number | null;
  latitude: number | null;
  label: string | null;
  created_at: number;
}

interface EventMedia {
  type: string;
  url: string;
  caption: string | null;
}

export interface SharedPersonRef {
  id: number;
  name: string;
  avatar_url: string | null;
  avatar_char: string | null;
  gender: string;
}

export interface EventForShare {
  id: number;
  title: string;
  body: string | null;
  event_date: string | null;
  event_type: string;
  location: string | null;
  longitude: number | null;
  latitude: number | null;
  media: EventMedia[];
  is_subject: boolean;
  subjects: SharedPersonRef[];
  participants: SharedPersonRef[];
  created_at: number;
  updated_at: number;
}

/** 解析 DB 里的 JSON string；非法输入返回空数组（全部隐藏）。 */
export function parseVisibleFields(raw: string | null | undefined): VisibleField[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    if (!Array.isArray(v)) return [];
    const allowed = new Set<string>(ALL_VISIBLE_FIELDS);
    return v.filter((x): x is VisibleField => typeof x === 'string' && allowed.has(x));
  } catch {
    return [];
  }
}

/** 保留首字 + (len-1) 个 `*`；按 Unicode code point 统计长度，兼容中文。 */
export function maskName(s: string | null): string | null {
  if (!s) return null;
  const chars = Array.from(s);
  if (chars.length <= 1) return '*';
  return chars[0] + '*'.repeat(chars.length - 1);
}

/** 按可见字段集合脱敏。
 *  - real_name 不在集合里时所有姓名字段都打码（保留首字）。
 *  - 其余字段不在集合里时直接置空 / 空数组。 */
export function applyVisibility(
  person: PersonRow,
  phones: PhoneRow[],
  addresses: AddressRow[],
  events: EventForShare[],
  visible: ReadonlySet<VisibleField>
): { person: PersonRow; phones: PhoneRow[]; addresses: AddressRow[]; events: EventForShare[] } {
  const showRealName = visible.has('real_name');
  const showBirth = visible.has('birth_date');
  const showAddress = visible.has('address');
  const showNotes = visible.has('notes');
  const showPhones = visible.has('phones');
  const showEvents = visible.has('events');
  const showEventMap = visible.has('event_map');

  const maskedPerson: PersonRow = {
    ...person,
    real_name: showRealName ? person.real_name : maskName(person.real_name),
    nickname: showRealName ? person.nickname : maskName(person.nickname),
    standard_title: showRealName
      ? person.standard_title
      : maskName(person.standard_title),
    dialect_title: showRealName
      ? person.dialect_title
      : maskName(person.dialect_title),
    birth_date: showBirth ? person.birth_date : null,
    notes: showNotes ? person.notes : null,
  };

  return {
    person: maskedPerson,
    phones: showPhones ? phones.map((p) => ({ ...p })) : [],
    addresses: showAddress ? addresses.map((a) => ({ ...a })) : [],
    events: showEvents
      ? events.map((e) => ({
          ...e,
          longitude: showEventMap ? e.longitude : null,
          latitude: showEventMap ? e.latitude : null,
          media: e.media.map((m) => ({ ...m })),
        }))
      : [],
  };
}
