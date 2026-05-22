import { apiFetch } from './client';
import type { Settings } from '../types';

interface RawSettings {
  family_roots?: string;
  app_title?: string;
  amap_key?: string;
  amap_security_code?: string;
  amap_validated_at?: string;
  s3_endpoint?: string;
  s3_region?: string;
  s3_bucket?: string;
  s3_access_key_id?: string;
  s3_secret_access_key?: string;
  s3_public_base?: string;
  s3_path_template?: string;
  s3_validated_at?: string;
  s3_backup_endpoint?: string;
  s3_backup_region?: string;
  s3_backup_bucket?: string;
  s3_backup_access_key_id?: string;
  s3_backup_secret_access_key?: string;
  s3_backup_path_template?: string;
  s3_backup_validated_at?: string;
  auto_backup_enabled?: string;
  last_auto_backup_at?: string;
  reminder_days?: string;
}

function parseFamilyRoots(raw: string | undefined): number[] | undefined {
  if (!raw) return undefined;
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr
      .map((x) => Number(x))
      .filter((n) => Number.isFinite(n) && n > 0);
  } catch {
    return [];
  }
}

function parseTs(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

export async function getSettings(): Promise<Settings> {
  const res = await apiFetch<{ data: RawSettings }>('/api/settings');
  return {
    family_roots: parseFamilyRoots(res.data?.family_roots),
    app_title: res.data?.app_title || undefined,
    amap_key: res.data?.amap_key || undefined,
    amap_security_code: res.data?.amap_security_code || undefined,
    amap_validated_at: parseTs(res.data?.amap_validated_at),
    s3_endpoint: res.data?.s3_endpoint || undefined,
    s3_region: res.data?.s3_region || undefined,
    s3_bucket: res.data?.s3_bucket || undefined,
    s3_access_key_id: res.data?.s3_access_key_id || undefined,
    s3_secret_access_key: res.data?.s3_secret_access_key || undefined,
    s3_public_base: res.data?.s3_public_base || undefined,
    s3_path_template: res.data?.s3_path_template || undefined,
    s3_validated_at: parseTs(res.data?.s3_validated_at),
    s3_backup_endpoint: res.data?.s3_backup_endpoint || undefined,
    s3_backup_region: res.data?.s3_backup_region || undefined,
    s3_backup_bucket: res.data?.s3_backup_bucket || undefined,
    s3_backup_access_key_id: res.data?.s3_backup_access_key_id || undefined,
    s3_backup_secret_access_key:
      res.data?.s3_backup_secret_access_key || undefined,
    s3_backup_path_template: res.data?.s3_backup_path_template || undefined,
    s3_backup_validated_at: parseTs(res.data?.s3_backup_validated_at),
    auto_backup_enabled: res.data?.auto_backup_enabled === '1',
    last_auto_backup_at: parseTs(res.data?.last_auto_backup_at),
    reminder_days: parseTs(res.data?.reminder_days),
  };
}

export async function updateSettings(
  input: Record<string, string | null>
): Promise<void> {
  await apiFetch('/api/settings', {
    method: 'PUT',
    body: JSON.stringify(input),
  });
}

/** 公开端点：未登录也能拿。仅用于登录页等需要标题但拿不到 session 的场景。 */
export async function getPublicAppTitle(): Promise<string | null> {
  try {
    const res = await fetch('/api/public/app-title');
    if (!res.ok) return null;
    const body = (await res.json()) as { data?: { app_title: string | null } };
    return body.data?.app_title ?? null;
  } catch {
    return null;
  }
}

export async function setFamilyRoots(roots: number[]): Promise<void> {
  await updateSettings({
    family_roots: JSON.stringify(Array.from(new Set(roots))),
  });
}

export interface TestResult {
  ok: boolean;
  error?: string;
  note?: string;
  detail?: string;
}

export async function testAmap(input: {
  key: string;
  security_code?: string;
}): Promise<TestResult> {
  return apiFetch<TestResult>('/api/settings/test-amap', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function testS3(input: {
  s3_endpoint: string;
  s3_region?: string;
  s3_bucket: string;
  s3_access_key_id: string;
  s3_secret_access_key: string;
  s3_public_base?: string;
}): Promise<TestResult> {
  return apiFetch<TestResult>('/api/settings/test-s3', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function testS3Backup(input: {
  s3_backup_endpoint: string;
  s3_backup_region?: string;
  s3_backup_bucket: string;
  s3_backup_access_key_id: string;
  s3_backup_secret_access_key: string;
  s3_backup_path_template?: string;
}): Promise<TestResult> {
  return apiFetch<TestResult>('/api/settings/test-s3-backup', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

