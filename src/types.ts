// 前后端共享的核心类型

import type { Kinship } from './lib/relations';

export type Gender = 'male' | 'female' | 'unknown';
export type BirthCalendar = 'solar' | 'lunar' | 'both';

export interface Person {
  id: number;
  nickname: string | null;        // 已不再录入，旧数据保留展示
  standard_title: string | null;  // 已不再录入，旧数据保留展示
  dialect_title: string | null;
  real_name: string | null;
  gender: Gender;
  // 出生日期：支持精度。'1980' / '1980-05' / '1980-05-15' / null
  birth_date: string | null;
  birth_calendar: BirthCalendar;
  kinship: Kinship; // blood | quasi | in_law | social

  avatar_url: string | null;
  avatar_char: string | null;
  notes: string | null;

  deleted_at: number | null;

  created_at: number;
  updated_at: number;
}

export type PersonInput = Omit<Person, 'id' | 'created_at' | 'updated_at' | 'deleted_at'>;

export interface Relation {
  id: number;
  from_person_id: number;
  to_person_id: number;
  relation_type: string;
  birth_order: number | null;       // 仅在 parent 关系上有意义
  description: string | null;
  created_at: number;
}

export interface RelationInput {
  from_person_id: number;
  to_person_id: number;
  relation_type: string;
  birth_order?: number | null;
  description?: string | null;
}

export interface Phone {
  id: number;
  person_id: number;
  phone: string;
  note: string | null;
  created_at: number;
}

export interface PhoneInput {
  person_id: number;
  phone: string;
  note?: string | null;
}

export interface Address {
  id: number;
  person_id: number;
  address: string;
  longitude: number | null;
  latitude: number | null;
  label: string | null;
  created_at: number;
}

export interface AddressInput {
  person_id: number;
  address: string;
  longitude?: number | null;
  latitude?: number | null;
  label?: string | null;
}

// ────────────────────────────────────────────────────────
// 大事记 / 时光轴
// ────────────────────────────────────────────────────────

// event_type 是 taxonomies('event_type') 里的 key；这里用 string 因为允许自定义类型
export type EventType = string;

export interface EventMedia {
  type: 'image' | 'video';
  url: string;
  caption?: string;
}

export interface EventItem {
  id: number;
  title: string;
  body: string | null;
  // 'YYYY' | 'YYYY-MM' | 'YYYY-MM-DD' | null
  event_date: string | null;
  event_type: string;
  location: string | null;
  longitude: number | null;
  latitude: number | null;
  media: EventMedia[];
  person_ids: number[];
  subject_ids: number[];     // person_ids 子集；标记"主角"
  created_at: number;
  updated_at: number;
}

export interface EventInput {
  title: string;
  body?: string | null;
  event_date?: string | null;
  event_type: string;
  location?: string | null;
  longitude?: number | null;
  latitude?: number | null;
  media: EventMedia[];
  person_ids: number[];
  subject_ids: number[];
}

// ────────────────────────────────────────────────────────
// 通用分类系统
// ────────────────────────────────────────────────────────

export type TaxonomyDomain = 'event_type' | 'social_relation';

export interface Taxonomy {
  id: number;
  domain: TaxonomyDomain;
  key: string;
  label: string;
  icon_name: string | null;
  color_hex: string | null;
  order_index: number;
  is_default: boolean;
  is_anniversary: boolean;
  deleted_at: number | null;
  created_at: number;
}

export interface TaxonomyInput {
  domain: TaxonomyDomain;
  key?: string;       // 可选；后端不传会自动生成 custom_*
  label: string;
  icon_name?: string | null;
  color_hex?: string | null;
  order_index?: number;
}

export interface TaxonomyPatch {
  label: string;
  icon_name?: string | null;
  color_hex?: string | null;
  order_index?: number;
  is_anniversary?: boolean;
}

export interface Settings {
  // 用户显式标记的家族树根 person id 列表;持久化为 JSON 字符串(如 "[1, 11]")
  family_roots?: number[];
  // 应用标题；默认空（前端 fallback 为「人物关系网」）
  app_title?: string;
  amap_key?: string;
  amap_security_code?: string;
  // 上次成功验证时间（unix 秒）。验证通过后才能保存。
  amap_validated_at?: number;

  // 对象存储 (S3-compatible: AWS / Aliyun OSS / Tencent COS / 七牛 Kodo …)
  // URL 风格固定为 virtual-hosted（bucket.host/key），覆盖现代主流服务。
  s3_endpoint?: string;
  s3_region?: string;
  s3_bucket?: string;
  s3_access_key_id?: string;
  s3_secret_access_key?: string;
  // 可选：CDN/自定义域名前缀（带或不带斜杠都行）；空则按 endpoint 拼
  s3_public_base?: string;
  // 可选：对象 key 的模板，支持 {yyyy} {MM} {dd} {HH} {mm} {ss} {ts} {rand} {rand6} {rand4} {ext} {name}
  // 留空则用默认 avatars/{yyyy}{MM}{dd}/{ts}-{rand6}.{ext}
  s3_path_template?: string;
  s3_validated_at?: number;

  // 备份存储（独立的 S3 兼容桶 + 凭证）
  s3_backup_endpoint?: string;
  s3_backup_region?: string;
  s3_backup_bucket?: string;
  s3_backup_access_key_id?: string;
  s3_backup_secret_access_key?: string;
  // 对象 key 模板，留空走默认 backup/relation-net-backup-{...}.json
  s3_backup_path_template?: string;
  s3_backup_validated_at?: number;

  // 自动备份
  auto_backup_enabled?: boolean;
  last_auto_backup_at?: number;

  // 提醒天数（生日+纪念日面板的时间范围）
  reminder_days?: number;
}

