// 单 Worker 入口：static assets 走 ASSETS 绑定，/api/* 进路由表。
//
// 路由表保留 functions/_middleware.ts 的中间件语义：
//   1) 非 /api/* → env.ASSETS.fetch (Workers Static Assets，配 SPA fallback)
//   2) PUBLIC 路径（login / logout）+ /api/shares/public/* → 跳过 session 校验
//   3) 其余 /api/* → 校验 HMAC-签名 session cookie

import { readSessionCookie, verifySessionToken } from './lib/auth';
import { bad, getSessionSecret } from './lib/http';
import type { Env as EnvBase } from './lib/http';

import * as authLogin from './routes/auth/login';
import * as authLogout from './routes/auth/logout';
import * as authChangePassword from './routes/auth/change-password';
import * as personsIndex from './routes/persons/index';
import * as personsId from './routes/persons/[id]';
import * as phonesIndex from './routes/phones/index';
import * as phonesId from './routes/phones/[id]';
import * as addressesIndex from './routes/addresses/index';
import * as addressesId from './routes/addresses/[id]';
import * as relationsIndex from './routes/relations/index';
import * as relationsId from './routes/relations/[id]';
import * as eventsIndex from './routes/events/index';
import * as eventsId from './routes/events/[id]';
import * as taxonomiesIndex from './routes/taxonomies/index';
import * as taxonomiesId from './routes/taxonomies/[id]';
import * as sharesIndex from './routes/shares/index';
import * as sharesId from './routes/shares/[id]';
import * as sharesPublic from './routes/shares/public/[token]';
import * as settingsIndex from './routes/settings/index';
import * as settingsTestAmap from './routes/settings/test-amap';
import * as settingsTestS3 from './routes/settings/test-s3';
import * as settingsTestS3Backup from './routes/settings/test-s3-backup';
import * as upload from './routes/upload';
import * as backupIndex from './routes/backup/index';
import * as backupRestore from './routes/backup/restore';
import * as backupAuto from './routes/backup/auto';
import * as backupOssList from './routes/backup/oss-list';
import * as backupOssObject from './routes/backup/oss-object';
import * as backupOssDelete from './routes/backup/oss-delete';
import * as backupRestoreFromOss from './routes/backup/restore-from-oss';
import * as publicAppTitle from './routes/public/app-title';

interface Env extends EnvBase {
  ASSETS: Fetcher;
}

type Handler = (
  request: Request,
  env: Env,
  params: Record<string, string>
) => Promise<Response>;

interface RouteEntry {
  method: string;
  pattern: URLPattern;
  handler: Handler;
}

function r(method: string, pathname: string, handler: Handler): RouteEntry {
  return { method, pattern: new URLPattern({ pathname }), handler };
}

const ROUTES: RouteEntry[] = [
  r('POST', '/api/auth/login', authLogin.POST),
  r('POST', '/api/auth/logout', authLogout.POST),
  r('POST', '/api/auth/change-password', authChangePassword.POST),

  r('GET', '/api/persons', personsIndex.GET),
  r('POST', '/api/persons', personsIndex.POST),
  r('GET', '/api/persons/:id', personsId.GET),
  r('PUT', '/api/persons/:id', personsId.PUT),
  r('DELETE', '/api/persons/:id', personsId.DELETE),
  r('PATCH', '/api/persons/:id', personsId.PATCH),

  r('GET', '/api/phones', phonesIndex.GET),
  r('POST', '/api/phones', phonesIndex.POST),
  r('PUT', '/api/phones/:id', phonesId.PUT),
  r('DELETE', '/api/phones/:id', phonesId.DELETE),

  r('GET', '/api/addresses', addressesIndex.GET),
  r('POST', '/api/addresses', addressesIndex.POST),
  r('PUT', '/api/addresses/:id', addressesId.PUT),
  r('DELETE', '/api/addresses/:id', addressesId.DELETE),

  r('GET', '/api/relations', relationsIndex.GET),
  r('POST', '/api/relations', relationsIndex.POST),
  r('DELETE', '/api/relations/:id', relationsId.DELETE),
  r('PATCH', '/api/relations/:id', relationsId.PATCH),

  r('GET', '/api/events', eventsIndex.GET),
  r('POST', '/api/events', eventsIndex.POST),
  r('GET', '/api/events/:id', eventsId.GET),
  r('PUT', '/api/events/:id', eventsId.PUT),
  r('DELETE', '/api/events/:id', eventsId.DELETE),
  r('PATCH', '/api/events/:id', eventsId.PATCH),

  r('GET', '/api/taxonomies', taxonomiesIndex.GET),
  r('POST', '/api/taxonomies', taxonomiesIndex.POST),
  r('PUT', '/api/taxonomies/:id', taxonomiesId.PUT),
  r('DELETE', '/api/taxonomies/:id', taxonomiesId.DELETE),
  r('PATCH', '/api/taxonomies/:id', taxonomiesId.PATCH),

  r('GET', '/api/shares', sharesIndex.GET),
  r('POST', '/api/shares', sharesIndex.POST),
  r('DELETE', '/api/shares/:id', sharesId.DELETE),
  r('PATCH', '/api/shares/:id', sharesId.PATCH),
  r('POST', '/api/shares/public/:token', sharesPublic.POST),

  r('GET', '/api/settings', settingsIndex.GET),
  r('PUT', '/api/settings', settingsIndex.PUT),
  r('POST', '/api/settings/test-amap', settingsTestAmap.POST),
  r('POST', '/api/settings/test-s3', settingsTestS3.POST),
  r('POST', '/api/settings/test-s3-backup', settingsTestS3Backup.POST),

  r('POST', '/api/upload', upload.POST),

  r('GET', '/api/backup', backupIndex.GET),
  r('POST', '/api/backup/restore', backupRestore.POST),
  r('POST', '/api/backup/auto', backupAuto.POST),
  r('GET', '/api/backup/oss-list', backupOssList.GET),
  r('GET', '/api/backup/oss-object', backupOssObject.GET),
  r('POST', '/api/backup/oss-delete', backupOssDelete.POST),
  r('POST', '/api/backup/restore-from-oss', backupRestoreFromOss.POST),

  r('GET', '/api/public/app-title', publicAppTitle.GET),
];

const PUBLIC_API_PATHS = new Set([
  '/api/auth/login',
  '/api/auth/logout',
  '/api/public/app-title',
]);
const PUBLIC_API_PREFIX = '/api/shares/public/';

function isPublicApi(pathname: string): boolean {
  return PUBLIC_API_PATHS.has(pathname) || pathname.startsWith(PUBLIC_API_PREFIX);
}

export default {
  async fetch(
    request: Request,
    env: Env,
    _ctx: ExecutionContext
  ): Promise<Response> {
    const url = new URL(request.url);

    // 静态资源 / SPA：交给 ASSETS 绑定（含 SPA 回退 index.html）
    if (!url.pathname.startsWith('/api/')) {
      return env.ASSETS.fetch(request);
    }

    try {
      if (!isPublicApi(url.pathname)) {
        const token = readSessionCookie(request);
        if (!token) return bad(401, '请先登录');
        const ok = await verifySessionToken(token, await getSessionSecret(env));
        if (!ok) return bad(401, '登录已失效，请重新登录');
      }

      for (const route of ROUTES) {
        if (route.method !== request.method) continue;
        const match = route.pattern.exec(url);
        if (!match) continue;
        const params = (match.pathname.groups ?? {}) as Record<string, string>;
        return await route.handler(request, env, params);
      }

      return bad(404, 'Not Found');
    } catch (e) {
      console.error('[api] unhandled error:', url.pathname, e);
      return bad(500, '服务器开小差了，请稍后再试');
    }
  },
} satisfies ExportedHandler<Env>;
