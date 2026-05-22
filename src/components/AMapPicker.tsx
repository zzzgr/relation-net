import {
  DownOutlined,
  EnvironmentOutlined,
} from '@ant-design/icons';
import { Alert, AutoComplete, Button } from 'antd';
import { useEffect, useRef, useState, useCallback } from 'react';
import { loadAMap, useAMapConfigured } from '@/lib/amap';
import { toast } from '@/lib/message';
import { useThemeMode } from '@/lib/theme';

/* eslint-disable @typescript-eslint/no-explicit-any */

interface Props {
  longitude: number | null;
  latitude: number | null;
  onChange: (lng: number, lat: number, address?: string) => void;
  /** When true, the map is shown (controlled externally) */
  forceOpen?: boolean;
  /** Notify parent when picking state changes */
  onPickingChange?: (picking: boolean) => void;
}

interface Tip {
  id: string;
  name: string;
  district?: string;
  address?: string;
  location?: { lng: number; lat: number };
}

export default function AMapPicker({ longitude, latitude, onChange, forceOpen, onPickingChange }: Props) {
  const { resolved: themeResolved } = useThemeMode();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const autoCompleteRef = useRef<any>(null);
  const geocoderRef = useRef<any>(null);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [keyword, setKeyword] = useState('');
  const [tips, setTips] = useState<Tip[]>([]);
  const [picking, setPicking] = useState(false);

  const mapVisible = open || forceOpen;

  const { configured } = useAMapConfigured();

  const startPicking = useCallback(() => {
    setPicking(true);
    setOpen(true);
    onPickingChange?.(true);
  }, [onPickingChange]);

  const stopPicking = useCallback(() => {
    setPicking(false);
    onPickingChange?.(false);
  }, [onPickingChange]);

  useEffect(() => {
    if (!mapVisible) return;
    if (!configured) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    loadAMap()
      .then((AMap: any) => {
        if (cancelled || !containerRef.current) return;
        const initialCenter: [number, number] =
          longitude && latitude
            ? [longitude, latitude]
            : [116.397428, 39.90923];

        const map = new AMap.Map(containerRef.current, {
          center: initialCenter,
          zoom: longitude && latitude ? 15 : 12,
          viewMode: '2D',
          mapStyle: themeResolved === 'dark' ? 'amap://styles/dark' : 'amap://styles/normal',
        });
        mapInstanceRef.current = map;

        if (longitude && latitude) {
          const marker = new AMap.Marker({
            position: initialCenter,
            draggable: true,
          });
          marker.on('dragend', (ev: any) => {
            onChangeRef.current(ev.lnglat.getLng(), ev.lnglat.getLat());
          });
          map.add(marker);
          markerRef.current = marker;
        }

        const geocoder = new AMap.Geocoder({});
        geocoderRef.current = geocoder;
        autoCompleteRef.current = new AMap.AutoComplete({ city: '全国' });

        const reverseGeocode = (lng: number, lat: number) => {
          geocoder.getAddress([lng, lat], (status: string, result: any) => {
            if (status === 'complete' && result?.regeocode?.formattedAddress) {
              onChangeRef.current(lng, lat, result.regeocode.formattedAddress);
              stopPicking();
            } else {
              onChangeRef.current(lng, lat);
              stopPicking();
            }
          });
        };

        map.on('click', (ev: any) => {
          const lng = ev.lnglat.getLng();
          const lat = ev.lnglat.getLat();
          if (markerRef.current) {
            markerRef.current.setPosition([lng, lat]);
          } else {
            const m = new AMap.Marker({
              position: [lng, lat],
              draggable: true,
            });
            m.on('dragend', (e2: any) => {
              onChangeRef.current(e2.lnglat.getLng(), e2.lnglat.getLat());
            });
            map.add(m);
            markerRef.current = m;
          }
          reverseGeocode(lng, lat);
        });

        setLoading(false);
      })
      .catch((e: Error) => {
        if (cancelled) return;
        setError(e.message === 'NO_AMAP_KEY' ? '尚未配置高德 Key' : e.message);
        setLoading(false);
      });

    return () => {
      cancelled = true;
      if (mapInstanceRef.current) {
        try {
          mapInstanceRef.current.destroy?.();
        } catch { /* noop */ }
        mapInstanceRef.current = null;
        markerRef.current = null;
        autoCompleteRef.current = null;
        geocoderRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapVisible, themeResolved]);

  // Theme change: update map style in-place (more reliable on mobile than destroy/recreate)
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !mapVisible) return;
    if (typeof map.setMapStyle === 'function') {
      map.setMapStyle(themeResolved === 'dark' ? 'amap://styles/dark' : 'amap://styles/normal');
    }
  }, [themeResolved, mapVisible]);

  useEffect(() => {
    if (!mapVisible || !mapInstanceRef.current) return;
    if (longitude && latitude) {
      const map = mapInstanceRef.current;
      if (markerRef.current) {
        markerRef.current.setPosition([longitude, latitude]);
      } else {
        const AMapNs = (window as any).AMap;
        if (AMapNs?.Marker) {
          const m = new AMapNs.Marker({ position: [longitude, latitude], draggable: true });
          m.on('dragend', (e2: any) => {
            onChangeRef.current(e2.lnglat.getLng(), e2.lnglat.getLat());
          });
          map.add(m);
          markerRef.current = m;
        }
      }
      map.setCenter?.([longitude, latitude]);
      map.setZoom?.(15);
    }
  }, [mapVisible, longitude, latitude]);

  const extractLngLat = (loc: any): { lng: number; lat: number } | null => {
    if (!loc) return null;
    if (typeof loc === 'string') return null;
    if (typeof loc.lng === 'number' && typeof loc.lat === 'number') {
      return { lng: loc.lng, lat: loc.lat };
    }
    if (typeof loc.getLng === 'function' && typeof loc.getLat === 'function') {
      const lng = loc.getLng();
      const lat = loc.getLat();
      if (typeof lng === 'number' && typeof lat === 'number')
        return { lng, lat };
    }
    return null;
  };

  const runSearch = (kw: string) => {
    setKeyword(kw);
    if (!autoCompleteRef.current || !kw.trim()) {
      setTips([]);
      return;
    }
    autoCompleteRef.current.search(kw, (status: string, result: any) => {
      if (status === 'complete' && Array.isArray(result?.tips)) {
        const list: Tip[] = [];
        result.tips.forEach((t: any, idx: number) => {
          const ll = extractLngLat(t.location);
          if (!ll) return;
          list.push({
            id: `${t.adcode || ''}-${idx}-${t.name}`,
            name: t.name,
            district: t.district,
            address: t.address,
            location: ll,
          });
        });
        setTips(list);
      } else {
        setTips([]);
      }
    });
  };

  const handleSelect = (tip: Tip) => {
    const map = mapInstanceRef.current;
    if (!tip.location || !map) return;
    const { lng, lat } = tip.location;
    const center: [number, number] = [lng, lat];

    try {
      if (typeof map.setZoom === 'function') map.setZoom(17);
      if (typeof map.panTo === 'function') map.panTo(center);
      else if (typeof map.setCenter === 'function') map.setCenter(center);
    } catch {
      map.setCenter?.(center);
    }

    const AMapNs = (window as any).AMap;
    if (
      markerRef.current &&
      typeof markerRef.current.setPosition === 'function'
    ) {
      markerRef.current.setPosition(center);
    } else if (AMapNs?.Marker) {
      const m = new AMapNs.Marker({ position: center, draggable: true });
      m.on('dragend', (e2: any) => {
        onChangeRef.current(e2.lnglat.getLng(), e2.lnglat.getLat());
      });
      map.add(m);
      markerRef.current = m;
    }

    const addr = [tip.district, tip.address, tip.name]
      .filter(Boolean)
      .join(' ');
    onChangeRef.current(lng, lat, addr || tip.name);

    setKeyword(tip.name);
    setTips([]);
    stopPicking();
    toast.info(`已定位到 ${tip.name}，可拖拽红点微调或手动修改地址`);
  };

  if (!configured) {
    return (
      <Alert
        type="info"
        showIcon
        icon={<EnvironmentOutlined />}
        message="地图拾取需要先配置高德 Key"
        description={
          <span className="text-[13px]">
            请前往「设置」页面配置高德地图 Key 和安全密钥后即可使用。
          </span>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {!picking && !forceOpen && (
        <Button
          size="small"
          icon={<EnvironmentOutlined />}
          onClick={startPicking}
        >
          拾取坐标
        </Button>
      )}

      {picking && !mapVisible && (
        <Button
          size="small"
          icon={<EnvironmentOutlined />}
          onClick={() => setOpen(true)}
        >
          打开地图拾取
        </Button>
      )}

      {mapVisible && (
        <>
          {picking && (
            <AutoComplete
              value={keyword}
              onChange={runSearch}
              onSelect={(_v, option) => {
                const tip = tips.find((t) => t.id === option.key);
                if (tip) handleSelect(tip);
              }}
              options={tips.map((tip) => ({
                key: tip.id,
                value: `${tip.name}__${tip.id}`,
                label: (
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[13px] font-medium text-[var(--color-foreground)]">
                      {tip.name}
                    </span>
                    <span className="line-clamp-1 text-[11px] text-[var(--color-muted-fg)]">
                      {[tip.district, tip.address].filter(Boolean).join(' · ') || '—'}
                    </span>
                  </div>
                ),
              }))}
              style={{ width: '100%' }}
              placeholder="搜索地址 / 村名 / 学校 / 兴趣点"
              popupMatchSelectWidth
              allowClear
              autoFocus
            />
          )}

          <div
            className="relative h-[320px] overflow-hidden"
            style={{
              background: 'var(--color-card)',
              border: '1px solid var(--color-border)',
              borderRadius: 10,
            }}
          >
            {loading && (
              <div
                className="absolute inset-0 z-10 flex items-center justify-center"
                style={{ background: 'color-mix(in srgb, var(--color-background) 60%, transparent)' }}
              >
                <span className="text-[13px] text-[var(--color-muted-fg)]">加载地图…</span>
              </div>
            )}
            {error && (
              <div
                className="absolute inset-0 z-10 flex items-center justify-center p-6 text-center text-[13px]"
                style={{ background: 'color-mix(in srgb, var(--color-background) 85%, transparent)', color: 'var(--color-danger)' }}
              >
                地图加载失败：{error}
              </div>
            )}
            <div key={themeResolved} ref={containerRef} className="h-full w-full" />
          </div>

          <div className="flex items-center gap-2">
            {picking && (
              <p className="m-0 flex-1 text-[12px] text-[var(--color-muted-fg)]">
                搜索地名选择 POI，或直接点击地图 / 拖拽红点微调
              </p>
            )}
            <Button
              size="small"
              type="text"
              onClick={() => {
                setOpen(false);
                stopPicking();
              }}
            >
              收起地图
              <DownOutlined style={{ fontSize: 10, marginLeft: 4, transform: 'rotate(180deg)' }} />
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
