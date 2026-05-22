// 大事记 / 时光轴 — 纯工具函数
//
// 事件类型的 label / 图标 / 颜色已迁移到 taxonomies 系统，见 lib/taxonomies.ts。
// 这里只保留与日期解析相关的工具。

// 日期格式化：'YYYY' / 'YYYY-MM' / 'YYYY-MM-DD' → 显示
export function formatEventDate(s: string | null | undefined): {
  year: string | null;
  monthDay: string | null;  // '05/12' 或 '05' 或 null
} {
  if (!s) return { year: null, monthDay: null };
  const parts = s.split('-');
  const year = parts[0] || null;
  if (parts[1] && parts[2]) {
    return { year, monthDay: `${parts[1]}/${parts[2]}` };
  }
  if (parts[1]) {
    return { year, monthDay: parts[1] };
  }
  return { year, monthDay: null };
}
