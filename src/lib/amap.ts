import AMapLoader from '@amap/amap-jsapi-loader';
import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { getSettings } from '@/api/settings';

type AMapNS = any;

let cached: Promise<AMapNS> | null = null;
let configuredKey: string | null = null;
let configuredSecurityCode: string | null = null;

export function setAMapConfig(key: string | undefined, securityCode: string | undefined) {
  const newKey = key || null;
  const newCode = securityCode || null;
  if (newKey !== configuredKey || newCode !== configuredSecurityCode) {
    configuredKey = newKey;
    configuredSecurityCode = newCode;
    cached = null;
    if (newCode && typeof window !== 'undefined') {
      window._AMapSecurityConfig = { securityJsCode: newCode };
    }
  }
}

export function getAMapKey(): string | null {
  return configuredKey;
}

export function isAMapConfigured(): boolean {
  return !!getAMapKey();
}

export function useAMapConfigured(): { configured: boolean; loading: boolean } {
  const isShareRoute =
    typeof window !== 'undefined' && window.location.pathname.startsWith('/s/');
  const settingsQ = useQuery({
    queryKey: ['settings'],
    queryFn: getSettings,
    enabled: !isShareRoute,
  });
  useEffect(() => {
    if (settingsQ.data) {
      setAMapConfig(settingsQ.data.amap_key, settingsQ.data.amap_security_code);
    }
  }, [settingsQ.data]);
  if (isShareRoute) {
    return { configured: !!getAMapKey(), loading: false };
  }
  return {
    configured: !!settingsQ.data?.amap_key,
    loading: settingsQ.isLoading,
  };
}

export function loadAMap(): Promise<AMapNS> {
  if (cached) return cached;

  const key = getAMapKey();
  if (!key) {
    return Promise.reject(new Error('NO_AMAP_KEY'));
  }

  cached = AMapLoader.load({
    key,
    version: '2.0',
    plugins: ['AMap.PlaceSearch', 'AMap.Geocoder', 'AMap.AutoComplete', 'AMap.Marker'],
  }) as Promise<AMapNS>;

  return cached;
}

declare global {
  interface Window {
    _AMapSecurityConfig?: { securityJsCode: string };
  }
}
