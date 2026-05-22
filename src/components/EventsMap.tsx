import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CloseOutlined,
  EditOutlined,
  EnvironmentOutlined,
  StarFilled,
} from '@ant-design/icons';
import { Button, Empty, Tag } from 'antd';
import { useNavigate } from 'react-router-dom';
import { loadAMap, useAMapConfigured } from '@/lib/amap';
import { useThemeMode } from '@/lib/theme';
import { formatEventDate } from '@/lib/events';
import { taxColor, taxLabel } from '@/lib/taxonomies';
import type { EventItem, Person, Taxonomy } from '@/types';

interface EventsMapProps {
  events: EventItem[];
  personById: Map<number, Person>;
  currentPersonId: number;
  eventTypes: Taxonomy[];
  eventTypeMap: Map<string, Taxonomy>;
  onEdit: (ev: EventItem) => void;
}

function personDisplayName(p: Person): string {
  return (
    p.real_name || p.dialect_title || p.standard_title || p.nickname || `#${p.id}`
  );
}

function fullDate(ev: EventItem): string {
  if (!ev.event_date) return '未标日期';
  const { year, monthDay } = formatEventDate(ev.event_date);
  if (year && monthDay) return `${year}-${monthDay.replace('/', '-')}`;
  if (year) return year;
  return ev.event_date;
}

function markerHtml(color: string, count: number): string {
  // 24px 圆点 + 白边 + 阴影；如果同一坐标多条事件，右上角小角标 ×N
  const badge =
    count > 1
      ? `<span style="
        position:absolute; top:-5px; right:-5px;
        min-width:16px; height:16px; padding:0 4px;
        border-radius:8px;
        background:#0a0a0a; color:#fff;
        font-size:10px; font-weight:600; line-height:16px;
        text-align:center;
        border:1.5px solid #fff;
      ">${count}</span>`
      : '';
  return `<div style="
    position:relative;
    width:20px; height:20px;
    border-radius:50%;
    background:${color};
    border:2px solid #fff;
    box-shadow:0 1px 4px rgba(0,0,0,0.25);
    cursor:pointer;
  ">${badge}</div>`;
}

export function EventsMap({
  events,
  personById,
  currentPersonId,
  eventTypes,
  eventTypeMap,
  onEdit,
}: EventsMapProps) {
  const navigate = useNavigate();
  const { resolved: themeResolved } = useThemeMode();
  const { configured: amapConfigured } = useAMapConfigured();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<unknown>(null);
  const [mapLoading, setMapLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<EventItem | null>(null);

  // 同坐标多事件聚合（4 位小数 ≈ 11m 精度）
  const groups = useMemo(() => {
    const m = new Map<string, EventItem[]>();
    for (const e of events) {
      if (e.longitude == null || e.latitude == null) continue;
      const key = `${e.longitude.toFixed(4)},${e.latitude.toFixed(4)}`;
      const arr = m.get(key) ?? [];
      arr.push(e);
      m.set(key, arr);
    }
    // 每组按日期倒序（最新的事件作代表）
    for (const arr of m.values()) {
      arr.sort((a, b) =>
        (b.event_date ?? '').localeCompare(a.event_date ?? '')
      );
    }
    return m;
  }, [events]);

  const points = useMemo(
    () => Array.from(groups.entries()),
    [groups]
  );

  useEffect(() => {
    if (!containerRef.current) return;
    if (!amapConfigured) {
      setMapLoading(false);
      return;
    }
    if (points.length === 0) {
      setMapLoading(false);
      return;
    }

    let cancelled = false;
    setMapLoading(true);
    setLoadError(null);

    loadAMap()
      .then((AMapNs) => {
        if (cancelled || !containerRef.current) return;
        type AMapModule = {
          Map: new (el: HTMLElement, opts: Record<string, unknown>) => unknown;
          Marker: new (opts: Record<string, unknown>) => unknown;
          Pixel: new (x: number, y: number) => unknown;
        };
        const AM = AMapNs as unknown as AMapModule;

        const first = points[0][1][0];
        const center: [number, number] = [first.longitude!, first.latitude!];
        const map = new AM.Map(containerRef.current, {
          center,
          zoom: 11,
          viewMode: '2D',
          mapStyle:
            themeResolved === 'dark'
              ? 'amap://styles/dark'
              : 'amap://styles/normal',
        }) as {
          add: (m: unknown) => void;
          setFitView: (markers: unknown[]) => void;
          destroy?: () => void;
        };

        const markers: unknown[] = [];
        for (const [, group] of points) {
          const rep = group[0]; // 该组代表事件
          const color = taxColor(eventTypeMap, rep.event_type);
          const m = new AM.Marker({
            position: [rep.longitude!, rep.latitude!],
            content: markerHtml(color, group.length),
            offset: new AM.Pixel(-10, -10),
            anchor: 'center',
            cursor: 'pointer',
          }) as { on: (e: string, cb: () => void) => void };
          m.on('click', () => setSelected(rep));
          map.add(m);
          markers.push(m);
        }
        if (markers.length > 1) {
          map.setFitView(markers);
        }

        mapRef.current = map;
        setMapLoading(false);
      })
      .catch((e: Error) => {
        if (cancelled) return;
        if (e.message !== 'NO_AMAP_KEY') {
          setLoadError(e.message || '地图加载失败');
        }
        setMapLoading(false);
      });

    return () => {
      cancelled = true;
      if (mapRef.current) {
        try {
          (mapRef.current as { destroy?: () => void }).destroy?.();
        } catch {
          /* noop */
        }
        mapRef.current = null;
      }
    };
  }, [points, themeResolved, eventTypeMap]);

  // 主题切换：原地更新样式
  useEffect(() => {
    const map = mapRef.current as { setMapStyle?: (s: string) => void } | null;
    if (!map?.setMapStyle) return;
    map.setMapStyle(
      themeResolved === 'dark' ? 'amap://styles/dark' : 'amap://styles/normal'
    );
  }, [themeResolved]);

  // 选中事件如果被外部数据删除，自动清掉
  useEffect(() => {
    if (!selected) return;
    if (!events.some((e) => e.id === selected.id)) setSelected(null);
  }, [events, selected]);

  if (!amapConfigured) {
    return (
      <div
        className="flex flex-col items-center gap-3 px-6 py-10 text-center"
        style={{
          background: 'var(--color-surface)',
          border: '1px dashed var(--color-border)',
          borderRadius: 8,
        }}
      >
        <EnvironmentOutlined
          style={{ fontSize: 28, color: 'var(--color-muted-fg)' }}
        />
        <h3 className="m-0 text-[15px] font-semibold">地图未启用</h3>
        <p className="m-0 max-w-xs text-[12px] text-[var(--color-muted-fg)]">
          需要先配置高德地图 Key
        </p>
        <Button size="small" type="primary" onClick={() => navigate('/settings')}>
          前往设置
        </Button>
      </div>
    );
  }

  if (loadError) {
    return (
      <div
        className="flex flex-col items-center gap-3 px-6 py-10 text-center"
        style={{
          background: 'var(--color-surface)',
          border: '1px dashed var(--color-border)',
          borderRadius: 8,
        }}
      >
        <EnvironmentOutlined
          style={{ fontSize: 28, color: 'var(--color-danger)' }}
        />
        <h3 className="m-0 text-[15px] font-semibold">地图加载失败</h3>
        <p className="m-0 max-w-md text-[12px] text-[var(--color-muted-fg)]">
          {loadError}
        </p>
      </div>
    );
  }

  if (events.length > 0 && points.length === 0) {
    return (
      <Empty
        description={
          <span className="text-[13px] text-[var(--color-muted-fg)]">
            还没有带坐标的事件 · 编辑事件时点位置选 POI 拾取
          </span>
        }
        imageStyle={{ height: 56, opacity: 0.6 }}
      />
    );
  }

  if (events.length === 0) {
    return (
      <Empty
        description="暂无大事记"
        imageStyle={{ height: 56, opacity: 0.6 }}
      />
    );
  }

  const totalEventsOnMap = points.reduce((sum, [, g]) => sum + g.length, 0);
  const selectedGroup = selected
    ? groups.get(`${selected.longitude!.toFixed(4)},${selected.latitude!.toFixed(4)}`) ?? [selected]
    : [];
  const selectedIndex = selected
    ? Math.max(0, selectedGroup.findIndex((e) => e.id === selected.id))
    : 0;
  const hasSiblings = selectedGroup.length > 1;

  return (
    <div className="flex flex-col gap-2">
      <div
        className="relative overflow-hidden"
        style={{
          height: 'min(60vh, 480px)',
          minHeight: 320,
          border: '1px solid var(--color-border)',
          borderRadius: 8,
          background: 'var(--color-surface)',
        }}
      >
        {mapLoading && (
          <div
            className="absolute inset-0 z-10 flex items-center justify-center"
            style={{
              background:
                'color-mix(in srgb, var(--color-background) 60%, transparent)',
              backdropFilter: 'blur(4px)',
            }}
          >
            <span className="text-[12px] text-[var(--color-muted-fg)]">
              加载地图…
            </span>
          </div>
        )}
        <div
          key={themeResolved}
          ref={containerRef}
          className="h-full w-full"
        />

        {selected && (
          <div
            className="absolute right-2 top-2 z-20 w-[260px] md:right-3 md:top-3 md:w-[300px]"
            style={{
              background:
                'color-mix(in srgb, var(--color-card) 96%, transparent)',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              border: '1px solid var(--color-border)',
              borderRadius: 8,
              padding: 12,
              boxShadow: '0 4px 14px rgba(0,0,0,0.12)',
            }}
          >
            <header className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <h4 className="m-0 text-[14px] font-semibold leading-snug">
                  {selected.title}
                </h4>
                {(() => {
                  const viewerIsSubject =
                    selected.subject_ids.length === 0 ||
                    selected.subject_ids.includes(currentPersonId);
                  if (viewerIsSubject) return null;
                  const names = selected.subject_ids
                    .filter((id) => id !== currentPersonId)
                    .map((id) => {
                      const p = personById.get(id);
                      return p ? personDisplayName(p) : `#${id}`;
                    });
                  if (names.length === 0) return null;
                  return (
                    <div
                      className="mt-0.5 flex items-center gap-1 text-[11px]"
                      style={{ color: 'var(--color-muted-fg)' }}
                    >
                      <StarFilled
                        style={{
                          fontSize: 9,
                          color: 'var(--color-accent-strong)',
                        }}
                      />
                      <span>{names.join('、')} 的事件</span>
                    </div>
                  );
                })()}
              </div>
              <Button
                size="small"
                type="text"
                icon={<CloseOutlined />}
                onClick={() => setSelected(null)}
                aria-label="关闭"
              />
            </header>

            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {(() => {
                const c = taxColor(eventTypeMap, selected.event_type);
                return (
                  <Tag
                    bordered={false}
                    style={{
                      marginRight: 0,
                      background: `color-mix(in srgb, ${c} 14%, transparent)`,
                      color: c,
                    }}
                  >
                    {taxLabel(eventTypeMap, selected.event_type)}
                  </Tag>
                );
              })()}
              <span className="text-[12px] text-[var(--color-muted-fg)]">
                {fullDate(selected)}
              </span>
            </div>

            {selected.location && (
              <p
                className="m-0 mt-2 text-[12px]"
                style={{ color: 'var(--color-muted-fg)' }}
              >
                <EnvironmentOutlined /> {selected.location}
              </p>
            )}

            {selected.person_ids.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {selected.person_ids.slice(0, 5).map((pid) => {
                  const p = personById.get(pid);
                  const label = p ? personDisplayName(p) : `#${pid}`;
                  const isCurrent = pid === currentPersonId;
                  const isSubject = selected.subject_ids.includes(pid);
                  return (
                    <Tag
                      key={pid}
                      bordered={false}
                      style={{
                        fontSize: 11,
                        margin: 0,
                        background: isCurrent
                          ? 'var(--color-accent-soft)'
                          : 'var(--color-hairline)',
                        color: isCurrent
                          ? 'var(--color-accent-strong)'
                          : 'var(--color-foreground)',
                      }}
                    >
                      {isSubject && (
                        <StarFilled
                          style={{
                            marginRight: 3,
                            fontSize: 9,
                            color: 'var(--color-accent-strong)',
                          }}
                        />
                      )}
                      {label}
                    </Tag>
                  );
                })}
                {selected.person_ids.length > 5 && (
                  <span className="text-[11px] text-[var(--color-muted-fg)]">
                    +{selected.person_ids.length - 5}
                  </span>
                )}
              </div>
            )}

            {selected.body && (
              <p
                className="m-0 mt-2 line-clamp-3 text-[12px]"
                style={{ color: 'var(--color-foreground)', lineHeight: 1.55 }}
              >
                {selected.body}
              </p>
            )}

            {selected.media.length > 0 && (
              <p
                className="m-0 mt-1.5 text-[11px]"
                style={{ color: 'var(--color-muted-fg)' }}
              >
                {selected.media.length} 个媒体附件
              </p>
            )}

            {hasSiblings && (
              <div className="mt-2 flex items-center gap-1.5">
                <Button
                  size="small"
                  type="text"
                  disabled={selectedIndex <= 0}
                  onClick={() =>
                    setSelected(selectedGroup[selectedIndex - 1] ?? selected)
                  }
                >
                  ←
                </Button>
                <span className="text-[11px] text-[var(--color-muted-fg)]">
                  此处 {selectedIndex + 1} / {selectedGroup.length}
                </span>
                <Button
                  size="small"
                  type="text"
                  disabled={selectedIndex >= selectedGroup.length - 1}
                  onClick={() =>
                    setSelected(selectedGroup[selectedIndex + 1] ?? selected)
                  }
                >
                  →
                </Button>
              </div>
            )}

            <Button
              type="primary"
              size="small"
              icon={<EditOutlined />}
              onClick={() => onEdit(selected)}
              style={{ marginTop: 10, width: '100%' }}
            >
              编辑
            </Button>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <span className="text-[12px] text-[var(--color-muted-fg)]">
          地图上共 {totalEventsOnMap} 条事件 · {points.length} 个位置
        </span>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {eventTypes.map((t) => (
            <span
              key={t.key}
              className="inline-flex items-center gap-1 text-[11px]"
              style={{ color: 'var(--color-muted-fg)' }}
            >
              <span
                style={{
                  display: 'inline-block',
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: t.color_hex ?? '#6b7280',
                }}
              />
              {t.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
