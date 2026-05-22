// 只读小地图 ── 用于分享页/详情页等场景,只展示一个坐标点。
//
// 与 AMapPicker 的区别:
//   - 不绑定 onChange,标记不可拖拽(避免误改)
//   - 但地图本体支持拖动平移 + 双击/滚轮缩放,体验接近完整地图
//   - 加载失败 / amap 未配置时静默回退到"在高德地图打开"按钮
//   - 右下角小按钮 ↗ 跳到 uri.amap.com,移动端可直接唤起高德 App

import { EnvironmentOutlined, FullscreenOutlined } from '@ant-design/icons';
import { useEffect, useRef, useState } from 'react';
import { loadAMap, useAMapConfigured } from '@/lib/amap';
import { useThemeMode } from '@/lib/theme';

/* eslint-disable @typescript-eslint/no-explicit-any */

interface Props {
  longitude: number;
  latitude: number;
  /** 显示在角标里的位置文本,可选 */
  label?: string | null;
  /** 高度,默认 180 */
  height?: number;
}

function openInAmap(lng: number, lat: number, name: string | null | undefined) {
  const url = `https://uri.amap.com/marker?position=${lng},${lat}${
    name ? `&name=${encodeURIComponent(name)}` : ''
  }&coordinate=gaode&callnative=1`;
  window.open(url, '_blank', 'noopener,noreferrer');
}

export function MiniMapView({ longitude, latitude, label, height = 180 }: Props) {
  const { resolved: themeResolved } = useThemeMode();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { configured } = useAMapConfigured();

  useEffect(() => {
    if (!configured) {
      setError('NO_AMAP_KEY');
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);

    loadAMap()
      .then((AMap: any) => {
        if (cancelled || !containerRef.current) return;
        const center: [number, number] = [longitude, latitude];
        const map = new AMap.Map(containerRef.current, {
          center,
          zoom: 15,
          viewMode: '2D',
          mapStyle:
            themeResolved === 'dark'
              ? 'amap://styles/dark'
              : 'amap://styles/normal',
          // 完整交互:拖动平移 + 双击/滚轮缩放;但 marker 本身不可拖拽
          dragEnable: true,
          zoomEnable: true,
          doubleClickZoom: true,
          scrollWheel: true,
          touchZoom: true,
          keyboardEnable: false,
        });
        mapInstanceRef.current = map;
        const marker = new AMap.Marker({
          position: center,
          draggable: false,
        });
        map.add(marker);
        setLoading(false);
      })
      .catch((e: Error) => {
        if (cancelled) return;
        setError(e.message || 'load failed');
        setLoading(false);
      });

    return () => {
      cancelled = true;
      const m = mapInstanceRef.current;
      if (m) {
        try {
          m.destroy?.();
        } catch {
          /* noop */
        }
        mapInstanceRef.current = null;
      }
    };
  }, [configured, longitude, latitude, themeResolved]);

  // amap 未配置 → 静默回退为一行链接
  if (!configured || error === 'NO_AMAP_KEY') {
    return (
      <button
        type="button"
        onClick={() => openInAmap(longitude, latitude, label)}
        className="inline-flex items-center gap-1 text-[12px]"
        style={{
          color: 'var(--color-accent-strong)',
          background: 'transparent',
          border: 'none',
          padding: 0,
          cursor: 'pointer',
        }}
      >
        <EnvironmentOutlined />
        在高德地图打开
      </button>
    );
  }

  return (
    <div
      className="relative overflow-hidden"
      style={{
        height,
        border: '1px solid var(--color-border)',
        borderRadius: 8,
        background: 'var(--color-card)',
      }}
    >
      {loading && (
        <div
          className="absolute inset-0 z-10 grid place-items-center text-[12px]"
          style={{
            background:
              'color-mix(in srgb, var(--color-background) 60%, transparent)',
            color: 'var(--color-muted-fg)',
          }}
        >
          加载地图…
        </div>
      )}
      {error && error !== 'NO_AMAP_KEY' && (
        <div
          className="absolute inset-0 z-10 grid place-items-center p-3 text-center text-[12px]"
          style={{ color: 'var(--color-muted-fg)' }}
        >
          地图加载失败 ── 点击右上角在高德地图中查看
        </div>
      )}
      <div key={themeResolved} ref={containerRef} className="h-full w-full" />
      {/* 右上角:在高德 App / 网页中打开(更适合复杂查询) */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          openInAmap(longitude, latitude, label);
        }}
        title="在高德地图中打开"
        aria-label="在高德地图中打开"
        className="absolute right-2 top-2 z-20 inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] transition-colors"
        style={{
          background: 'var(--color-card)',
          color: 'var(--color-foreground)',
          border: '1px solid var(--color-border)',
          boxShadow: '0 1px 4px rgba(0,0,0,0.15)',
          cursor: 'pointer',
        }}
      >
        <FullscreenOutlined />
        在高德打开
      </button>
    </div>
  );
}

export default MiniMapView;

