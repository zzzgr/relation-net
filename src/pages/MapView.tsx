import { useQuery } from '@tanstack/react-query';
import {
  CloseOutlined,
  EditOutlined,
  EnvironmentOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import { Button, Skeleton, Tag, Tooltip } from 'antd';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { listPersons } from '@/api/persons';
import { listAddresses } from '@/api/addresses';
import { loadAMap, useAMapConfigured } from '@/lib/amap';
import { useThemeMode } from '@/lib/theme';
import { kinshipLabel } from '@/lib/relations';
import type { Kinship } from '@/lib/relations';
import type { Address, Person } from '@/types';

const KIN_STYLE: Record<Kinship, { color: string; bg: string }> = {
  blood: { color: 'var(--color-kin-blood)', bg: 'var(--color-kin-blood-soft)' },
  quasi: { color: 'var(--color-kin-quasi)', bg: 'var(--color-kin-quasi-soft)' },
  in_law: { color: 'var(--color-kin-in-law)', bg: 'var(--color-kin-in-law-soft)' },
  social: { color: 'var(--color-kin-social)', bg: 'var(--color-kin-social-soft)' },
};

function personDisplayName(p: Person): string {
  return (
    p.real_name || p.standard_title || p.dialect_title || p.nickname || `#${p.id}`
  );
}

interface MapPoint {
  address: Address;
  person: Person;
}

export default function MapView() {
  const navigate = useNavigate();
  const { resolved: themeResolved } = useThemeMode();
  const { configured: amapConfigured, loading: amapLoading } = useAMapConfigured();
  const personsQ = useQuery({ queryKey: ['persons'], queryFn: () => listPersons() });
  const addressesQ = useQuery({
    queryKey: ['addresses', 'all'],
    queryFn: () => listAddresses(),
  });

  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [hovered, setHovered] = useState<MapPoint | null>(null);
  const [pinned, setPinned] = useState<MapPoint | null>(null);

  const points = useMemo<MapPoint[]>(() => {
    if (!personsQ.data || !addressesQ.data) return [];
    const personMap = new Map<number, Person>();
    for (const p of personsQ.data) personMap.set(p.id, p);
    const list: MapPoint[] = [];
    for (const a of addressesQ.data) {
      if (a.longitude == null || a.latitude == null) continue;
      const person = personMap.get(a.person_id);
      if (!person) continue;
      list.push({ address: a, person });
    }
    return list;
  }, [personsQ.data, addressesQ.data]);

  const personAddrMap = useMemo(() => {
    const m = new Map<number, MapPoint[]>();
    for (const pt of points) {
      const list = m.get(pt.person.id);
      if (list) list.push(pt);
      else m.set(pt.person.id, [pt]);
    }
    for (const list of m.values()) {
      list.sort((a, b) => a.address.id - b.address.id);
    }
    return m;
  }, [points]);

  useEffect(() => {
    if (!containerRef.current || points.length === 0) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setLoadError(null);

    loadAMap()
      .then((AMapNs) => {
        if (cancelled || !containerRef.current) return;

        type AMapModule = {
          Map: new (el: HTMLElement, opts: Record<string, unknown>) => unknown;
          Marker: new (opts: Record<string, unknown>) => unknown;
          LngLat: new (lng: number, lat: number) => unknown;
        };
        const AM = AMapNs as unknown as AMapModule;

        const center: [number, number] = [
          points[0].address.longitude!,
          points[0].address.latitude!,
        ];
        const map = new AM.Map(containerRef.current, {
          center,
          zoom: 11,
          viewMode: '2D',
          mapStyle: themeResolved === 'dark' ? 'amap://styles/dark' : 'amap://styles/normal',
        }) as {
          add: (m: unknown) => void;
          setFitView: (markers: unknown[]) => void;
        };

        const isDark = themeResolved === 'dark';
        const markers: unknown[] = [];
        for (const pt of points) {
          const name = personDisplayName(pt.person);
          const siblings = personAddrMap.get(pt.person.id) ?? [];
          const idx = siblings.findIndex((s) => s.address.id === pt.address.id);
          const total = siblings.length;
          const addrTag = pt.address.label || `地址${idx + 1}`;
          const labelText = total > 1 ? `${name} · ${addrTag}` : (pt.address.label ? `${name} · ${pt.address.label}` : name);
          const badge = total > 1
            ? `<span style="
                display:inline-flex;align-items:center;justify-content:center;
                min-width:16px;height:16px;padding:0 4px;
                border-radius:8px;margin-left:4px;
                font-size:10px;font-weight:600;line-height:1;
                background:${isDark ? '#10b981' : '#059669'};color:#fff;
              ">${idx + 1}/${total}</span>`
            : '';
          const m = new AM.Marker({
            position: [pt.address.longitude!, pt.address.latitude!],
            title: labelText,
            label: {
              content: `<span style="
                display:inline-flex;align-items:center;
                padding:2px 8px;
                border-radius:10px;
                font-size:12px;
                font-weight:500;
                white-space:nowrap;
                background:${isDark ? 'rgba(20,20,20,0.88)' : 'rgba(255,255,255,0.92)'};
                color:${isDark ? '#e5e7eb' : '#0a0a0a'};
                border:1px solid ${isDark ? '#2a2a2a' : '#e5e7eb'};
                backdrop-filter:blur(4px);
                box-shadow:0 1px 4px rgba(0,0,0,${isDark ? '0.3' : '0.08'});
              ">${labelText}${badge}</span>`,
              direction: 'top',
              offset: [0, -4] as unknown as object,
            },
          }) as { on: (e: string, cb: () => void) => void };
          m.on('mouseover', () => setHovered(pt));
          m.on('mouseout', () => setHovered(null));
          m.on('click', () =>
            setPinned((cur) => (cur?.address.id === pt.address.id ? null : pt))
          );
          map.add(m);
          markers.push(m);
        }
        if (markers.length > 1) map.setFitView(markers);

        mapRef.current = map;
        setLoading(false);
      })
      .catch((e: Error) => {
        const msg = e.message === 'NO_AMAP_KEY' ? null : e.message || '高德地图加载失败';
        if (msg) setLoadError(msg);
        setLoading(false);
      });

    return () => {
      cancelled = true;
      if (mapRef.current) {
        try {
          (mapRef.current as { destroy?: () => void }).destroy?.();
        } catch { /* noop */ }
        mapRef.current = null;
      }
    };
  }, [points, themeResolved]);

  // Theme change: update map style in-place (more reliable on mobile than destroy/recreate)
  useEffect(() => {
    const map = mapRef.current as { setMapStyle?: (s: string) => void } | null;
    if (!map?.setMapStyle) return;
    map.setMapStyle(themeResolved === 'dark' ? 'amap://styles/dark' : 'amap://styles/normal');
  }, [themeResolved]);

  if (personsQ.isLoading || amapLoading) {
    return <Skeleton active style={{ minHeight: '60vh' }} paragraph={{ rows: 8 }} />;
  }

  if (!amapConfigured) {
    return (
      <div
        className="flex flex-col items-center gap-3 px-6 py-16 text-center"
        style={{
          background: 'var(--color-card)',
          border: '1px dashed var(--color-border-strong)',
          borderRadius: 12,
        }}
      >
        <EnvironmentOutlined style={{ fontSize: 32, color: 'var(--color-muted-fg)' }} />
        <h3 className="m-0 text-[18px] font-semibold">地图功能未启用</h3>
        <p className="m-0 max-w-xs text-[13px] text-[var(--color-muted-fg)]">
          需要先配置高德地图 Key 才能使用地图功能
        </p>
        <Button type="primary" onClick={() => navigate('/settings')}>
          前往设置
        </Button>
      </div>
    );
  }

  if (loadError) {
    return (
      <div
        className="flex flex-col items-center gap-3 px-6 py-16 text-center"
        style={{
          background: 'var(--color-card)',
          border: '1px dashed var(--color-border-strong)',
          borderRadius: 12,
        }}
      >
        <EnvironmentOutlined style={{ fontSize: 32, color: 'var(--color-danger)' }} />
        <h3 className="m-0 text-[18px] font-semibold">地图加载失败</h3>
        <p className="m-0 max-w-md text-[13px] text-[var(--color-muted-fg)]">
          {loadError}
          <br />
          可能 Key 已失效 / 域名未在高德控制台白名单 / 安全密钥不匹配。
        </p>
        <Button type="primary" onClick={() => navigate('/settings')}>
          前往设置重新验证
        </Button>
      </div>
    );
  }

  if (points.length === 0) {
    return (
      <div
        className="flex flex-col items-center gap-3 px-6 py-16 text-center"
        style={{
          background: 'var(--color-card)',
          border: '1px dashed var(--color-border-strong)',
          borderRadius: 12,
        }}
      >
        <TeamOutlined
          style={{ fontSize: 32, color: 'var(--color-muted-fg)' }}
        />
        <h3 className="m-0 text-[18px] font-semibold">还没有任何带坐标的人物</h3>
        <p className="m-0 max-w-md text-[13px] text-[var(--color-muted-fg)]">
          去人物表单的「地址 / 坐标」处点击地图拾取，再来看吧
        </p>
      </div>
    );
  }

  const shown = pinned ?? hovered;
  const isPinned = !!pinned;
  const shownKin = shown ? KIN_STYLE[shown.person.kinship] ?? KIN_STYLE.social : null;
  const shownSiblings = shown ? (personAddrMap.get(shown.person.id) ?? []) : [];

  const panTo = (pt: MapPoint) => {
    setPinned(pt);
    const map = mapRef.current as { panTo?: (pos: [number, number]) => void } | null;
    if (map?.panTo && pt.address.longitude != null && pt.address.latitude != null) {
      map.panTo([pt.address.longitude, pt.address.latitude]);
    }
  };

  return (
    <div className="flex flex-col gap-3 md:h-[calc(100dvh-9rem)]">
      <div className="flex items-center gap-3">
      </div>

      <div
        className="relative flex-1 overflow-hidden md:min-h-0"
        style={{
          background: 'var(--color-card)',
          border: '1px solid var(--color-border)',
          borderRadius: 12,
        }}
      >
        {loading && (
          <div
            className="absolute inset-0 z-10 flex items-center justify-center"
            style={{
              background: 'color-mix(in srgb, var(--color-background) 60%, transparent)',
              backdropFilter: 'blur(4px)',
            }}
          >
            <span className="text-[13px] text-[var(--color-muted-fg)]">
              加载地图…
            </span>
          </div>
        )}
        <div
          key={themeResolved}
          ref={containerRef}
          className="h-full min-h-[60vh] w-full md:min-h-0"
        />

        {shown && shownKin && (
          <div
            className="absolute right-3 top-3 z-20 w-72 md:right-4 md:top-4"
            style={{
              pointerEvents: isPinned ? 'auto' : 'none',
              background: 'color-mix(in srgb, var(--color-card) 96%, transparent)',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              border: '1px solid var(--color-border)',
              borderRadius: 10,
              padding: 14,
              boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
            }}
          >
            <header className="flex items-start gap-2">
              <h3 className="m-0 flex-1 text-[16px] font-semibold leading-tight">
                {personDisplayName(shown.person)}
              </h3>
              {isPinned && (
                <Button
                  size="small"
                  type="text"
                  icon={<CloseOutlined />}
                  onClick={() => setPinned(null)}
                  aria-label="关闭"
                />
              )}
            </header>

            <div className="mt-2 flex flex-col gap-1.5">
              {shown.person.real_name && <Row k="真实姓名" v={shown.person.real_name} />}
              {shown.person.dialect_title && <Row k="方言称谓" v={shown.person.dialect_title} />}
              {shown.person.standard_title && <Row k="标准称谓" v={shown.person.standard_title} />}
              {shown.person.nickname && <Row k="昵称" v={shown.person.nickname} />}
              <div className="pt-1">
                <Tag
                  style={{
                    color: shownKin.color,
                    background: shownKin.bg,
                    border: 'none',
                    margin: 0,
                  }}
                >
                  {kinshipLabel(shown.person.kinship)}
                </Tag>
              </div>

              {shownSiblings.length <= 1 ? (
                <p className="m-0 text-[12px] text-[var(--color-muted-fg)]">
                  {shown.address.address}
                </p>
              ) : (
                <div
                  className="mt-1 flex flex-col gap-1 rounded-md p-2"
                  style={{ background: 'var(--color-surface, var(--color-card))' }}
                >
                  <span className="text-[11px] font-medium text-[var(--color-muted-fg)]">
                    地址（{shownSiblings.length}）
                  </span>
                  {shownSiblings.map((sib, i) => {
                    const active = sib.address.id === shown.address.id;
                    return (
                      <button
                        key={sib.address.id}
                        type="button"
                        onClick={() => isPinned && panTo(sib)}
                        className="flex items-start gap-1.5 rounded px-1.5 py-1 text-left text-[12px] transition-colors"
                        style={{
                          background: active ? 'var(--color-accent-soft)' : 'transparent',
                          color: active ? 'var(--color-accent-strong)' : 'var(--color-muted-fg)',
                          fontWeight: active ? 500 : 400,
                          border: 'none',
                          cursor: isPinned ? 'pointer' : 'default',
                        }}
                      >
                        <EnvironmentOutlined style={{ marginTop: 2, fontSize: 11, flexShrink: 0 }} />
                        <span className="flex-1 leading-tight">
                          {sib.address.label && (
                            <span className="mr-1 font-medium text-[var(--color-foreground)]">
                              {sib.address.label}
                            </span>
                          )}
                          {!sib.address.label && `#${i + 1} `}
                          {sib.address.address}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}

              {shown.person.notes && (
                <Tooltip title={shown.person.notes}>
                  <p className="m-0 line-clamp-2 text-[12px] text-[var(--color-muted-fg)]">
                    备注：{shown.person.notes}
                  </p>
                </Tooltip>
              )}
              {isPinned && (
                <Button
                  type="primary"
                  size="small"
                  icon={<EditOutlined />}
                  onClick={() => navigate(`/persons/${shown.person.id}/edit`)}
                  style={{ marginTop: 8 }}
                >
                  编辑此人
                </Button>
              )}
            </div>
          </div>
        )}
      </div>

      <span className="text-[13px] text-[var(--color-muted-fg)]">
        共 {points.length} 个标记
      </span>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex gap-1 text-[12px]">
      <span className="text-[var(--color-muted-fg)]">{k}：</span>
      <span className="flex-1 text-[var(--color-foreground)]">{v}</span>
    </div>
  );
}
