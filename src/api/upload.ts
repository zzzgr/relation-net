import { ApiError } from './client';

export interface UploadResult {
  url: string;
  key: string;
  type?: 'image' | 'video';
  mime?: string;
  size?: number;
}

export async function uploadImage(
  file: File,
  kind?: string
): Promise<UploadResult> {
  const form = new FormData();
  form.append('file', file);
  if (kind) form.append('kind', kind);
  const res = await fetch('/api/upload', {
    method: 'POST',
    body: form,
    credentials: 'include',
  });

  if (!res.ok) {
    let msg = '';
    try {
      const body = (await res.json()) as { error?: string };
      if (body?.error) msg = body.error;
    } catch { /* not json */ }
    if (!msg) {
      if (res.status >= 500) msg = '服务器开小差了，请稍后再试';
      else if (res.status === 401) msg = '请先登录';
      else if (res.status === 413) msg = '文件过大';
      else if (res.status === 415) msg = '不支持的文件类型';
      else msg = `上传失败（${res.status}）`;
    }
    throw new ApiError(res.status, msg);
  }

  const body = (await res.json()) as { data: UploadResult };
  return body.data;
}
