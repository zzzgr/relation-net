// 校验 OSS 备份 key：必须以配置的前缀开头，不允许路径穿越。
// 避免 endpoint 被滥用成「下载/删除任意对象」。

export function validateBackupKey(
  key: unknown,
  prefix: string
): { ok: true; key: string } | { ok: false; error: string } {
  if (typeof key !== 'string' || key.length === 0) {
    return { ok: false, error: 'key 不合法' };
  }
  if (!key.startsWith(prefix)) {
    return { ok: false, error: 'key 不合法' };
  }
  if (key.includes('..') || key.includes('//')) {
    return { ok: false, error: 'key 不合法' };
  }
  return { ok: true, key };
}
