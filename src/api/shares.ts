import { apiFetch } from './client';
import type { Address, EventItem, Person, Phone, Relation } from '../types';

/** share 公开端点回传的事件类型迷你视图(够用即可,不含 id/order 等)。 */
export interface ShareEventTypeTaxonomy {
  key: string;
  label: string;
  icon_name: string | null;
  color_hex: string | null;
}

export type ShareMode = 'tree' | 'person';

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

export const VISIBLE_FIELD_LABEL: Record<VisibleField, string> = {
  real_name: '真实姓名',
  birth_date: '生日',
  address: '地址 / 坐标',
  notes: '备注',
  phones: '电话',
  events: '大事记',
  event_map: '事件地图',
};

export interface Share {
  id: number;
  token: string;
  root_person_id: number;
  title: string | null;
  created_at: number;
  expires_at: number | null;
  mode: ShareMode;
  /** 仍由 DB 返回，仅用于老数据；新代码用 visible_fields */
  hide_sensitive: number;
  /** DB 里是 JSON 字符串；apiFetch 透传后由调用方按需 parse */
  visible_fields: string | VisibleField[];
  /** 后端 AES 解密后回传的明文密码；解密失败时为 null */
  password: string | null;
  /** 分享指向的人物若被软删/回收，这里是 deleted_at 时间戳；正常时为 null */
  root_deleted_at: number | null;
}

/** 把 DB 返回的 visible_fields（可能是 JSON string）规范成数组。 */
export function parseShareVisibleFields(
  raw: Share['visible_fields'] | null | undefined
): VisibleField[] {
  if (Array.isArray(raw)) return raw;
  if (typeof raw !== 'string' || !raw) return [];
  try {
    const v = JSON.parse(raw);
    if (!Array.isArray(v)) return [];
    const allowed = new Set<string>(ALL_VISIBLE_FIELDS);
    return v.filter((x): x is VisibleField => typeof x === 'string' && allowed.has(x));
  } catch {
    return [];
  }
}

export interface TreeShareData {
  mode: 'tree';
  title: string | null;
  root_person_id: number;
  persons: Person[];
  relations: Relation[];
}

export interface SharedPersonRef {
  id: number;
  name: string;
  avatar_url: string | null;
  avatar_char: string | null;
  gender: string;
}

/** 分享页用的事件子集：person_ids / subject_ids 不返回（只渲染单人视图）。
 *  is_subject 表示当前分享主角在该事件里的角色是否为 subject。
 *  subjects/participants 由后端按 event_persons.role 拆分回填，姓名已选好优先级。 */
export type ShareEvent = Omit<EventItem, 'person_ids' | 'subject_ids'> & {
  is_subject: boolean;
  subjects: SharedPersonRef[];
  participants: SharedPersonRef[];
};

export interface PersonShareData {
  mode: 'person';
  title: string | null;
  root_person_id: number;
  visible_fields: VisibleField[];
  person: Person;
  phones: Phone[];
  addresses: Address[];
  events: ShareEvent[];
  /** 当前应用的事件类型分类(已过滤 deleted_at);用于把 event_type key 渲染成 label/icon/color */
  event_type_taxonomies?: ShareEventTypeTaxonomy[];
  /** 高德 web JS key,可选 ── 用于事件小地图。配合 securityJsCode + Referer 白名单使用。 */
  amap_key?: string | null;
  amap_security_code?: string | null;
}

export type ShareData = TreeShareData | PersonShareData;

export async function listShares(): Promise<Share[]> {
  const res = await apiFetch<{ data: Share[] }>('/api/shares');
  return res.data;
}

export async function createShare(input: {
  root_person_id: number;
  title?: string;
  password: string;
  expires_days?: number;
  mode?: ShareMode;
  visible_fields?: VisibleField[];
}): Promise<Share> {
  const res = await apiFetch<{ data: Share }>('/api/shares', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return res.data;
}

export async function updateShare(
  id: number,
  input: {
    password?: string;
    title?: string | null;
    expires_days?: number | null;
    visible_fields?: VisibleField[];
  }
): Promise<Share> {
  const res = await apiFetch<{ data: Share }>(`/api/shares/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
  return res.data;
}

export async function deleteShare(id: number): Promise<void> {
  await apiFetch(`/api/shares/${id}`, { method: 'DELETE' });
}

export async function accessShare(token: string, password: string): Promise<ShareData> {
  const res = await fetch(`/api/shares/public/${token}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  if (!res.ok) {
    let msg = '访问失败';
    try {
      const body = (await res.json()) as { error?: string };
      if (body?.error) msg = body.error;
    } catch { /* ignore */ }
    throw new Error(msg);
  }
  const data = (await res.json()) as { data: ShareData };
  // 兼容：极旧响应可能没有 mode 字段
  if (!data.data.mode) (data.data as { mode: ShareMode }).mode = 'tree';
  // 兼容：部署窗口期内 person 分享可能未返回 events / visible_fields
  if (data.data.mode === 'person') {
    if (!Array.isArray(data.data.events)) data.data.events = [];
    if (!Array.isArray(data.data.visible_fields)) data.data.visible_fields = [];
    if (!Array.isArray(data.data.event_type_taxonomies))
      data.data.event_type_taxonomies = [];
  }
  return data.data;
}

