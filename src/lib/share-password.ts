export function buildShareUrl(token: string, password?: string | null): string {
  const base = `${window.location.origin}/s/${token}`;
  if (!password) return base;
  return `${base}?p=${encodeURIComponent(password)}`;
}
