// 通用分类（taxonomies）的 React 端访问层
//
// 这里只负责从后端 cache 里拿数据 + 提供合适的 fallback；
// 业务规则（哪些 key 算结构关系等）仍在 lib/relations.ts。

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { listTaxonomies } from '@/api/taxonomies';
import { iconFromName } from './icon-picker';
import { relationLabel } from './relations';
import type { Taxonomy, TaxonomyDomain } from '@/types';

// ────────────────────────────────────────────────────────
// 默认值（用于查询未加载完前的 fallback；和 migration 008 种子保持一致）
// ────────────────────────────────────────────────────────

function seed(
  domain: TaxonomyDomain,
  rows: Array<[string, string, string, string]>
): Taxonomy[] {
  return rows.map(([key, label, icon_name, color_hex], i) => ({
    id: -(i + 1),  // 负数表示客户端 fallback
    domain,
    key,
    label,
    icon_name,
    color_hex,
    order_index: i,
    is_default: true,
    is_anniversary: false,
    deleted_at: null,
    created_at: 0,
  }));
}

export const DEFAULT_EVENT_TYPE_TAXONOMIES: Taxonomy[] = seed('event_type', [
  ['birthday',  '生日', 'GiftOutlined',    '#dc2626'],
  ['gathering', '聚餐', 'CoffeeOutlined',  '#d97706'],
  ['travel',    '旅行', 'CompassOutlined', '#059669'],
  ['holiday',   '节日', 'FireOutlined',    '#7c3aed'],
  ['work',      '工作', 'LaptopOutlined',  '#2563eb'],
]);

export const DEFAULT_SOCIAL_RELATION_TAXONOMIES: Taxonomy[] = seed(
  'social_relation',
  [
    ['teacher',   '老师', 'BookOutlined', '#d97706'],
    ['friend',    '朋友', 'UserOutlined', '#6b7280'],
    ['neighbor',  '邻居', 'HomeOutlined', '#059669'],
    ['colleague', '同事', 'TeamOutlined', '#2563eb'],
  ]
);

const DEFAULTS: Record<TaxonomyDomain, Taxonomy[]> = {
  event_type: DEFAULT_EVENT_TYPE_TAXONOMIES,
  social_relation: DEFAULT_SOCIAL_RELATION_TAXONOMIES,
};

// ────────────────────────────────────────────────────────
// Hooks
// ────────────────────────────────────────────────────────

/** 当前 domain 的可见分类（未隐藏）。未加载完时回落到默认值。 */
export function useTaxonomies(domain: TaxonomyDomain): Taxonomy[] {
  const q = useQuery({
    queryKey: ['taxonomies', domain],
    queryFn: () => listTaxonomies(domain),
  });
  return q.data && q.data.length > 0 ? q.data : DEFAULTS[domain];
}

/**
 * key → Taxonomy 的查找 Map。**包含 hidden 项**，确保老数据
 * （比如 event_type='other'）仍能查到 label 显示。
 */
export function useTaxonomyMap(domain: TaxonomyDomain): Map<string, Taxonomy> {
  const q = useQuery({
    queryKey: ['taxonomies', domain, 'all'],
    queryFn: () => listTaxonomies(domain, { includeHidden: true }),
  });
  const list = q.data && q.data.length > 0 ? q.data : DEFAULTS[domain];
  return useMemo(() => new Map(list.map((t) => [t.key, t])), [list]);
}

export function useEventTypes() {
  return useTaxonomies('event_type');
}
export function useEventTypeMap() {
  return useTaxonomyMap('event_type');
}
export function useSocialRelations() {
  return useTaxonomies('social_relation');
}
export function useSocialRelationMap() {
  return useTaxonomyMap('social_relation');
}

// ────────────────────────────────────────────────────────
// 纯函数 helper：给定 map 查询字段，找不到时给保守默认
// ────────────────────────────────────────────────────────

export function taxLabel(
  map: Map<string, Taxonomy>,
  key: string | null | undefined
): string {
  if (!key) return '其他';
  return map.get(key)?.label ?? key;
}

export function taxColor(
  map: Map<string, Taxonomy>,
  key: string | null | undefined
): string {
  if (!key) return '#6b7280';
  return map.get(key)?.color_hex ?? '#6b7280';
}

export function taxIcon(
  map: Map<string, Taxonomy>,
  key: string | null | undefined
) {
  return iconFromName(map.get(key ?? '')?.icon_name);
}

/**
 * 关系标签查找：parent/spouse 走 lib/relations 的硬编码；
 * 其余 key 优先看 social_relation 分类（用户可改名），找不到再回落 RELATION_MAP。
 */
export function useRelationLabel(): (key: string) => string {
  const map = useSocialRelationMap();
  return (key: string) => {
    if (key === 'parent' || key === 'spouse') return relationLabel(key);
    return map.get(key)?.label ?? relationLabel(key);
  };
}
