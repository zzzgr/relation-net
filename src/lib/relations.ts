// 关系类型常量与档位（kinship tier）
//
// 简化模型：族谱骨架只用 parent + spouse。
//   - parent  : from=父母, to=子女；可附 birth_order（1=长, 2=次, ...）
//   - spouse  : 配偶（双向，前端只展示一次）
//   - 社会关系：friend / mentor / colleague / neighbor / other
//
// 兄弟、堂表、叔伯姑舅姨、侄外甥、祖辈孙辈、姻亲（公婆/岳父母/女婿/儿媳…）
// 全部由 parent + spouse 派生，不再作为独立 relation_type 存储。

export type Kinship = 'blood' | 'quasi' | 'in_law' | 'social';

export interface KinshipDef {
  key: Kinship;
  label: string;
  color: string;
  description: string;
}

export const KINSHIPS: KinshipDef[] = [
  {
    key: 'blood',
    label: '血亲',
    color: '#3370ff',
    description: '同血缘的亲属（父母、子女、祖辈孙辈、叔伯姑舅姨等）',
  },
  {
    key: 'quasi',
    label: '拟血亲',
    color: '#f59e0b',
    description: '通过法律或事实形成、视同血亲的关系（继父母 / 继子女 / 养父母 / 养子女）',
  },
  {
    key: 'in_law',
    label: '姻亲',
    color: '#dc2626',
    description: '通过婚姻产生的关系（配偶、公婆、岳父母 等）',
  },
  {
    key: 'social',
    label: '社会',
    color: '#6b7280',
    description: '非家庭关系（朋友、同事、邻居、师长等）',
  },
];

export const KINSHIP_MAP: Record<Kinship, KinshipDef> = Object.fromEntries(
  KINSHIPS.map((k) => [k.key, k])
) as Record<Kinship, KinshipDef>;

export function kinshipLabel(k: Kinship | string | undefined | null): string {
  if (!k) return '社会';
  return KINSHIP_MAP[k as Kinship]?.label ?? k;
}

export function kinshipColor(k: Kinship | string | undefined | null): string {
  if (!k) return '#6b7280';
  return KINSHIP_MAP[k as Kinship]?.color ?? '#6b7280';
}

export function kinshipTagColor(
  k: Kinship | string | undefined | null
): 'blue' | 'orange' | 'red' | 'grey' {
  switch (k) {
    case 'blood':
      return 'blue';
    case 'quasi':
      return 'orange';
    case 'in_law':
      return 'red';
    default:
      return 'grey';
  }
}

// ────────────────────────────────────────────────────────
// 关系类型
// ────────────────────────────────────────────────────────

export type RelationType =
  | 'parent'
  | 'spouse'
  | 'teacher'
  | 'friend'
  | 'neighbor'
  | 'colleague'
  | 'other';

export interface RelationTypeDef {
  key: RelationType;
  label: string;
  tier: Kinship;
  /**
   * 代数偏移：from → to 的代数差。
   * parent : -1（to 比 from 小一辈）
   * 其余  : 0
   */
  generationDelta: number;
}

export const RELATION_TYPES: RelationTypeDef[] = [
  { key: 'parent',    label: '父母→子女', tier: 'blood',  generationDelta: -1 },
  { key: 'spouse',    label: '配偶',       tier: 'in_law', generationDelta:  0 },
  { key: 'teacher',   label: '老师',       tier: 'social', generationDelta:  1 },
  { key: 'friend',    label: '朋友',       tier: 'social', generationDelta:  0 },
  { key: 'neighbor',  label: '邻居',       tier: 'social', generationDelta:  0 },
  { key: 'colleague', label: '同事',       tier: 'social', generationDelta:  0 },
  { key: 'other',     label: '其他',       tier: 'social', generationDelta:  0 },
];

export const RELATION_MAP: Record<string, RelationTypeDef> = Object.fromEntries(
  RELATION_TYPES.map((r) => [r.key, r])
);

export function relationLabel(key: string): string {
  return RELATION_MAP[key]?.label ?? key;
}

export function relationTier(key: string): Kinship {
  return RELATION_MAP[key]?.tier ?? 'social';
}

export function relationColor(key: string): string {
  return kinshipColor(relationTier(key));
}

export function relationGenerationDelta(key: string): number {
  return RELATION_MAP[key]?.generationDelta ?? 0;
}

// ────────────────────────────────────────────────────────
// 结构性判定
// ────────────────────────────────────────────────────────

export function isParentRelation(key: string): boolean {
  return key === 'parent';
}
export function isSpouseRelation(key: string): boolean {
  return key === 'spouse';
}
export function isStructuralRelation(key: string): boolean {
  return isParentRelation(key) || isSpouseRelation(key);
}

// ────────────────────────────────────────────────────────
// birth_order → 中文长幼标签
// ────────────────────────────────────────────────────────

const ORDER_PREFIX = ['长', '次', '三', '四', '五', '六', '七', '八', '九', '十'];

/** birth_order=1, gender=male → "长子"；birth_order=3, female → "三女"；未知性别 → "长子女" 兜底 */
export function birthOrderLabel(
  order: number | null | undefined,
  childGender: 'male' | 'female' | 'unknown' | null | undefined
): string | null {
  if (!order || order < 1) return null;
  const prefix = order <= ORDER_PREFIX.length ? ORDER_PREFIX[order - 1] : `${order}`;
  const suffix =
    childGender === 'male' ? '子' : childGender === 'female' ? '女' : '子女';
  return `${prefix}${suffix}`;
}

/** parent 边在两个视角下的展示标签 */
export function parentEdgeLabel(
  perspective: 'from' | 'to',
  childGender: 'male' | 'female' | 'unknown' | null | undefined,
  parentGender: 'male' | 'female' | 'unknown' | null | undefined,
  birthOrder: number | null | undefined
): string {
  if (perspective === 'from') {
    // 我看 to：to 是我的子女
    return birthOrderLabel(birthOrder, childGender) ??
      (childGender === 'male' ? '儿子' : childGender === 'female' ? '女儿' : '子女');
  }
  // 我看 from：from 是我的父母
  return parentGender === 'male'
    ? '父亲'
    : parentGender === 'female'
      ? '母亲'
      : '父母';
}
