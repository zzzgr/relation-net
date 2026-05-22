// 图标 + 颜色挑选器数据
//
// 图标：直接用 @ant-design/icons 全量 Outlined 系列（≈447 个），
// 用名字 substring 搜索过滤；保持纯前端注册，无外部依赖。
// 颜色：12 色板覆盖主流场景。

import type { ComponentType, CSSProperties } from 'react';
import * as AntIcons from '@ant-design/icons';
import { StarOutlined } from '@ant-design/icons';

type IconLike = ComponentType<{ style?: CSSProperties; className?: string }>;

export interface PickableIcon {
  name: string;
  Icon: IconLike;
  hint: string;  // 给搜索 / tooltip 用；小写以便匹配
}

// 把 AntIcons.* 里所有以 "Outlined" 结尾的导出都收进来，按名字字母序。
// 跳过 Filled / TwoTone / 函数式辅助导出（createFromIconfontCN 等）。
function buildIconCatalog(): PickableIcon[] {
  const out: PickableIcon[] = [];
  for (const [name, value] of Object.entries(AntIcons)) {
    if (!name.endsWith('Outlined')) continue;
    // AntIcons 还导出了一些非组件项；判断一下是否像一个组件
    if (typeof value !== 'object' && typeof value !== 'function') continue;
    out.push({
      name,
      Icon: value as IconLike,
      hint: name.replace(/Outlined$/, '').toLowerCase(),
    });
  }
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

export const PICKABLE_ICONS: PickableIcon[] = buildIconCatalog();

export const ICON_MAP: Record<string, IconLike> = Object.fromEntries(
  PICKABLE_ICONS.map((p) => [p.name, p.Icon])
);

export function iconFromName(name: string | null | undefined): IconLike {
  if (!name) return StarOutlined;
  return ICON_MAP[name] ?? StarOutlined;
}

// 12 色板，覆盖大部分场景
export const PICKABLE_COLORS: string[] = [
  '#dc2626', // red
  '#d97706', // amber
  '#ca8a04', // yellow
  '#65a30d', // lime
  '#059669', // emerald
  '#0d9488', // teal
  '#0284c7', // sky
  '#2563eb', // blue
  '#7c3aed', // violet
  '#c026d3', // fuchsia
  '#db2777', // pink
  '#6b7280', // gray
];
