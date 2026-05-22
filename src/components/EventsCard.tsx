import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Button,
  Card,
  Dropdown,
  Empty,
  Image,
  Segmented,
  Select,
  Skeleton,
  Tag,
} from 'antd';
import {
  AlignLeftOutlined,
  ClockCircleOutlined,
  EnvironmentOutlined,
  MoreOutlined,
  PlayCircleOutlined,
  PlusOutlined,
  StarFilled,
  TeamOutlined,
  UserOutlined,
} from '@ant-design/icons';
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { deleteEvent, listEvents } from '@/api/events';
import { listPersons } from '@/api/persons';
import { formatEventDate } from '@/lib/events';
import { taxColor, taxIcon, taxLabel, useEventTypeMap, useEventTypes } from '@/lib/taxonomies';
import { getModal, toast } from '@/lib/message';
import type { EventItem, Person, Taxonomy } from '@/types';
import { EventFormDrawer } from './EventFormDrawer';
import { EventsMap } from './EventsMap';
import { SafeImage, SafeVideo } from './SafeMedia';

const PAGE_SIZE = 20;

function personDisplayName(p: Person): string {
  return (
    p.real_name || p.dialect_title || p.standard_title || p.nickname || `#${p.id}`
  );
}

interface Props {
  personId: number;
}

export function EventsCard({ personId }: Props) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const sentinelTopRef = useRef<HTMLDivElement | null>(null);
  const sentinelBottomRef = useRef<HTMLDivElement | null>(null);

  const [enabled, setEnabled] = useState(false);
  const [typeFilter, setTypeFilter] = useState<string | undefined>(undefined);
  const [subjectOnly, setSubjectOnly] = useState(false);
  const [viewMode, setViewMode] = useState<'timeline' | 'map'>('timeline');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<EventItem | null>(null);

  // 用于解析每条事件的人物 chips
  const personsQ = useQuery({
    queryKey: ['persons'],
    queryFn: () => listPersons(),
    enabled,
  });
  const personById = useMemo(
    () => new Map((personsQ.data ?? []).map((p) => [p.id, p])),
    [personsQ.data]
  );

  const eventTypes = useEventTypes();
  const eventTypeMap = useEventTypeMap();

  const eventsQ = useInfiniteQuery({
    queryKey: ['events', personId, typeFilter ?? null, subjectOnly],
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      listEvents(personId, {
        offset: pageParam,
        limit: PAGE_SIZE,
        event_type: typeFilter,
        subject_only: subjectOnly,
      }),
    getNextPageParam: (last, all) =>
      last.hasMore ? all.length * PAGE_SIZE : undefined,
    enabled,
  });

  // 地图视图独立查询：一次拉满（含无坐标的也拉，组件内自己过滤）
  const eventsMapQ = useQuery({
    queryKey: ['events', personId, 'map', typeFilter ?? null, subjectOnly],
    queryFn: () =>
      listEvents(personId, {
        limit: 500,
        event_type: typeFilter,
        subject_only: subjectOnly,
      }),
    enabled: enabled && viewMode === 'map',
  });

  // 顶部 sentinel：进入视口才启用查询
  useEffect(() => {
    if (enabled) return;
    const el = sentinelTopRef.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') {
      setEnabled(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setEnabled(true);
          io.disconnect();
        }
      },
      { rootMargin: '120px' }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [enabled]);

  // 底部 sentinel：进入视口触发下一页
  useEffect(() => {
    if (!enabled) return;
    const el = sentinelBottomRef.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(
      (entries) => {
        if (
          entries.some((e) => e.isIntersecting) &&
          eventsQ.hasNextPage &&
          !eventsQ.isFetchingNextPage
        ) {
          void eventsQ.fetchNextPage();
        }
      },
      { rootMargin: '160px' }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [enabled, eventsQ.hasNextPage, eventsQ.isFetchingNextPage, eventsQ]);

  const delMut = useMutation({
    mutationFn: deleteEvent,
    onSuccess: () => {
      toast.success('已删除');
      qc.invalidateQueries({ queryKey: ['events', personId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleDelete = (ev: EventItem) => {
    getModal()?.confirm({
      title: <span>确认删除事件 <b>{ev.title}</b>？</span>,
      content: '已上传的图片/视频文件不会一起清理。',
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: () => delMut.mutate(ev.id),
    });
  };

  const events = useMemo(
    () => eventsQ.data?.pages.flatMap((p) => p.data) ?? [],
    [eventsQ.data]
  );

  // 客户端按年份分组（数据已按 event_date DESC 排序）
  const grouped = useMemo(() => {
    const out: Array<{ year: string; items: EventItem[] }> = [];
    let cur: { year: string; items: EventItem[] } | null = null;
    for (const ev of events) {
      const y = ev.event_date?.slice(0, 4) || '未知时间';
      if (!cur || cur.year !== y) {
        cur = { year: y, items: [] };
        out.push(cur);
      }
      cur.items.push(ev);
    }
    return out;
  }, [events]);

  return (
    <Card
      title="大事记"
      extra={
        <div className="flex items-center gap-2">
          <Select
            size="small"
            value={typeFilter}
            onChange={(v) => setTypeFilter(v)}
            placeholder="全部类型"
            allowClear
            style={{ minWidth: 110 }}
            options={eventTypes.map((t) => ({
              value: t.key,
              label: t.label,
            }))}
          />
          <Button
            type="primary"
            size="small"
            icon={<PlusOutlined />}
            onClick={() => {
              setEditingEvent(null);
              setDrawerOpen(true);
            }}
          >
            新增事件
          </Button>
        </div>
      }
      style={{ border: '1px solid var(--color-border)', borderRadius: 10 }}
    >
      {/* 顶部 sentinel：纯触发用，不占视觉空间 */}
      <div ref={sentinelTopRef} />

      {/* 视图切换 + 只看我的 */}
      <div className="mb-3 flex items-center gap-2">
        <Segmented
          size="small"
          value={viewMode}
          onChange={(v) => setViewMode(v as 'timeline' | 'map')}
          options={[
            {
              value: 'timeline',
              label: (
                <span className="inline-flex items-center gap-1">
                  <ClockCircleOutlined />
                  时间轴
                </span>
              ),
            },
            {
              value: 'map',
              label: (
                <span className="inline-flex items-center gap-1">
                  <EnvironmentOutlined />
                  地图
                </span>
              ),
            },
          ]}
        />
        <Button
          size="small"
          type={subjectOnly ? 'primary' : 'default'}
          icon={<UserOutlined />}
          onClick={() => setSubjectOnly((v) => !v)}
          title={subjectOnly ? '当前只看主角是我的事件' : '点击只看我的事件'}
        >
          只看我的
        </Button>
      </div>

      {viewMode === 'map' ? (
        !enabled || eventsMapQ.isLoading ? (
          <div className="py-10 text-center text-[13px] text-[var(--color-muted-fg)]">
            加载地图数据…
          </div>
        ) : eventsMapQ.isError ? (
          <div className="py-6 text-center text-[13px] text-[var(--color-muted-fg)]">
            加载失败：{(eventsMapQ.error as Error).message}
          </div>
        ) : (
          <EventsMap
            events={eventsMapQ.data?.data ?? []}
            personById={personById}
            currentPersonId={personId}
            eventTypes={eventTypes}
            eventTypeMap={eventTypeMap}
            onEdit={(ev) => {
              setEditingEvent(ev);
              setDrawerOpen(true);
            }}
          />
        )
      ) : !enabled || eventsQ.isLoading ? (
        <TimelineSkeleton count={3} />
      ) : eventsQ.isError ? (
        <div className="py-6 text-center text-[13px] text-[var(--color-muted-fg)]">
          加载失败：{(eventsQ.error as Error).message}
        </div>
      ) : events.length === 0 ? (
        <Empty
          description="暂无大事记"
          imageStyle={{ height: 56, opacity: 0.6 }}
        />
      ) : (
        <div className="flex flex-col">
          {grouped.map((g) => (
            <YearSection key={g.year} year={g.year}>
              {g.items.map((ev) => (
                <EventRow
                  key={ev.id}
                  event={ev}
                  personById={personById}
                  currentPersonId={personId}
                  eventTypeMap={eventTypeMap}
                  onEdit={() => {
                    setEditingEvent(ev);
                    setDrawerOpen(true);
                  }}
                  onDelete={() => handleDelete(ev)}
                  onPersonClick={(id) => {
                    if (id !== personId) navigate(`/persons/${id}/edit`);
                  }}
                />
              ))}
            </YearSection>
          ))}
        </div>
      )}

      {/* 翻页骨架（仅时间轴模式） */}
      {viewMode === 'timeline' && enabled && eventsQ.isFetchingNextPage && (
        <div className="mt-2">
          <TimelineSkeleton count={2} />
        </div>
      )}

      {/* 底部 sentinel（仅时间轴模式有意义） */}
      {viewMode === 'timeline' && (
        <div ref={sentinelBottomRef} style={{ height: 1 }} />
      )}

      <EventFormDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        personId={personId}
        event={editingEvent}
      />
    </Card>
  );
}

// ────────────────────────────────────────────────────────
// 年份分组
// ────────────────────────────────────────────────────────

function YearSection({
  year,
  children,
}: {
  year: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col">
      <div
        className="flex items-center gap-3 py-2"
        style={{ color: 'var(--color-muted-fg)' }}
      >
        <span style={{ fontSize: 13, fontWeight: 600 }}>{year}</span>
        <div
          style={{
            flex: 1,
            height: 1,
            background: 'var(--color-hairline, var(--color-border))',
          }}
        />
      </div>
      <div className="flex flex-col gap-3">{children}</div>
    </div>
  );
}

// ────────────────────────────────────────────────────────
// 事件单行
// ────────────────────────────────────────────────────────

interface EventRowProps {
  event: EventItem;
  personById: Map<number, Person>;
  currentPersonId: number;
  eventTypeMap: Map<string, Taxonomy>;
  onEdit: () => void;
  onDelete: () => void;
  onPersonClick: (id: number) => void;
}

function EventRow({
  event: ev,
  personById,
  currentPersonId,
  eventTypeMap,
  onEdit,
  onDelete,
  onPersonClick,
}: EventRowProps) {
  const { monthDay } = formatEventDate(ev.event_date);
  const TypeIcon = taxIcon(eventTypeMap, ev.event_type);
  const typeColor = taxColor(eventTypeMap, ev.event_type);
  const typeLabel = taxLabel(eventTypeMap, ev.event_type);

  // 当前查看者是否是主角；老数据 subject_ids 为空时按"全员主角"处理 → 不打副标
  const viewerIsSubject =
    ev.subject_ids.length === 0 || ev.subject_ids.includes(currentPersonId);
  const subjectNames = ev.subject_ids
    .filter((id) => id !== currentPersonId)
    .map((id) => {
      const p = personById.get(id);
      return p ? personDisplayName(p) : `#${id}`;
    });
  const subjectSubtitle = !viewerIsSubject && subjectNames.length > 0
    ? `${subjectNames.join('、')} 的事件`
    : null;

  return (
    <div className="flex gap-3">
      {/* 日期列 */}
      <div
        className="flex flex-col items-center pt-3"
        style={{ width: 44, flex: '0 0 44px' }}
      >
        <span
          style={{
            fontSize: monthDay && monthDay.length >= 5 ? 12 : 13,
            fontWeight: 600,
            fontVariantNumeric: 'tabular-nums',
            color: 'var(--color-foreground)',
            whiteSpace: 'nowrap',
          }}
        >
          {monthDay ?? '·'}
        </span>
        <div
          style={{
            marginTop: 6,
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: 'var(--color-accent, #10b981)',
          }}
        />
        <div
          style={{
            flex: 1,
            width: 1,
            marginTop: 6,
            background: 'var(--color-hairline, var(--color-border))',
          }}
        />
      </div>

      {/* 内容卡 */}
      <div
        className="flex-1"
        style={{
          border: '1px solid var(--color-border)',
          borderRadius: 8,
          padding: '12px 14px',
          background: 'var(--color-background, #fff)',
        }}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <TypeIcon
                style={{
                  fontSize: 14,
                  color: typeColor,
                  flex: '0 0 auto',
                }}
              />
              <span style={{ fontSize: 14, fontWeight: 600 }}>{ev.title}</span>
              <Tag
                bordered={false}
                style={{
                  marginRight: 0,
                  background: `color-mix(in srgb, ${typeColor} 14%, transparent)`,
                  color: typeColor,
                }}
              >
                {typeLabel}
              </Tag>
            </div>
            {subjectSubtitle && (
              <div
                className="mt-0.5 flex items-center gap-1 text-[12px]"
                style={{ color: 'var(--color-muted-fg)' }}
              >
                <StarFilled
                  style={{
                    fontSize: 10,
                    color: 'var(--color-accent-strong)',
                  }}
                />
                <span>{subjectSubtitle}</span>
              </div>
            )}
          </div>
          <Dropdown
            trigger={['click']}
            menu={{
              items: [
                { key: 'edit', label: viewerIsSubject ? '编辑' : '编辑（仅部分字段）' },
                ...(viewerIsSubject
                  ? [{ key: 'delete', label: '删除', danger: true }]
                  : []),
              ],
              onClick: ({ key }) => {
                if (key === 'edit') onEdit();
                else if (key === 'delete') onDelete();
              },
            }}
          >
            <Button
              type="text"
              size="small"
              icon={<MoreOutlined />}
              aria-label="更多操作"
            />
          </Dropdown>
        </div>

        {/* 人物 chips */}
        {ev.person_ids.length > 0 && (
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <TeamOutlined
              style={{
                fontSize: 12,
                color: 'var(--color-muted-fg)',
                flex: '0 0 auto',
              }}
            />
            {ev.person_ids.map((pid) => {
              const p = personById.get(pid);
              const label = p ? personDisplayName(p) : `#${pid}`;
              const isCurrent = pid === currentPersonId;
              const isSubject = ev.subject_ids.includes(pid);
              return (
              <Tag
                key={pid}
                bordered={false}
                onClick={() => onPersonClick(pid)}
                style={{
                  cursor: isCurrent ? 'default' : 'pointer',
                  background: isCurrent
                    ? 'var(--color-accent-soft)'
                    : 'var(--color-hairline)',
                  color: isCurrent
                    ? 'var(--color-accent-strong)'
                    : 'var(--color-foreground)',
                  fontSize: 12,
                }}
              >
                  {isSubject && (
                    <StarFilled
                      style={{
                        marginRight: 3,
                        fontSize: 10,
                        color: 'var(--color-accent-strong)',
                      }}
                    />
                  )}
                  {label}
                </Tag>
              );
            })}
          </div>
        )}

        {/* 位置 */}
        {ev.location && (
          <div
            className="mt-1.5 flex items-center gap-1 text-[12px]"
            style={{ color: 'var(--color-muted-fg)' }}
          >
            <EnvironmentOutlined />
            <span>{ev.location}</span>
          </div>
        )}

        {/* 正文 */}
        {ev.body && <EventBody text={ev.body} />}

        {/* 媒体 */}
        {ev.media.length > 0 && <MediaGrid media={ev.media} />}
      </div>
    </div>
  );
}

function EventBody({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = text.length > 200 || text.split('\n').length > 6;
  return (
    <div className="mt-2 flex gap-1.5">
      <AlignLeftOutlined
        style={{
          fontSize: 12,
          color: 'var(--color-muted-fg)',
          marginTop: 5,
          flex: '0 0 auto',
        }}
      />
      <div className="min-w-0 flex-1">
        <p
          className="m-0 whitespace-pre-wrap"
          style={{
            fontSize: 13,
            lineHeight: 1.65,
            color: 'var(--color-foreground)',
            display: isLong && !expanded ? '-webkit-box' : 'block',
            WebkitLineClamp: isLong && !expanded ? 6 : undefined,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {text}
        </p>
        {isLong && (
          <Button
            type="link"
            size="small"
            style={{ padding: 0, height: 'auto', fontSize: 12 }}
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? '收起' : '展开'}
          </Button>
        )}
      </div>
    </div>
  );
}

function MediaGrid({ media }: { media: EventItem['media'] }) {
  const MAX_VISIBLE = 8;
  const overflowing = media.length > MAX_VISIBLE;
  const visibleCount = overflowing ? MAX_VISIBLE - 1 : media.length;
  const overflowCount = media.length - visibleCount;

  const imageUrls = useMemo(
    () => media.filter((m) => m.type === 'image').map((m) => m.url),
    [media]
  );

  const [preview, setPreview] = useState<{ visible: boolean; current: number }>(
    { visible: false, current: 0 }
  );

  // 给定 media 索引，返回它在 image-only 列表中的索引；视频返回 -1
  const imageIndexOf = (mediaIdx: number): number => {
    let n = -1;
    for (let i = 0; i <= mediaIdx && i < media.length; i++) {
      if (media[i].type === 'image') n += 1;
    }
    return media[mediaIdx]?.type === 'image' ? n : -1;
  };

  const firstHiddenImageIdx = (() => {
    for (let i = visibleCount; i < media.length; i++) {
      if (media[i].type === 'image') return imageIndexOf(i);
    }
    return -1;
  })();

  const openImageAt = (idx: number) => {
    if (idx < 0) return;
    setPreview({ visible: true, current: idx });
  };

  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {media.slice(0, visibleCount).map((m, i) =>
        m.type === 'image' ? (
          <ImageTile
            key={`${m.url}-${i}`}
            url={m.url}
            onClick={() => openImageAt(imageIndexOf(i))}
          />
        ) : (
          <VideoTile key={`${m.url}-${i}`} url={m.url} />
        )
      )}
      {overflowing && (
        <OverflowTile
          count={overflowCount}
          onClick={() => openImageAt(firstHiddenImageIdx)}
          clickable={firstHiddenImageIdx >= 0}
        />
      )}
      {imageUrls.length > 0 && (
        <Image.PreviewGroup
          items={imageUrls}
          preview={{
            visible: preview.visible,
            current: preview.current,
            onVisibleChange: (v) =>
              setPreview((p) => ({ ...p, visible: v })),
            onChange: (c) => setPreview((p) => ({ ...p, current: c })),
          }}
        />
      )}
    </div>
  );
}

const TILE_SIZE = 88;
const tileStyle: React.CSSProperties = {
  width: TILE_SIZE,
  height: TILE_SIZE,
  border: '1px solid var(--color-border)',
  borderRadius: 6,
  overflow: 'hidden',
  background: '#f5f5f5',
  flex: '0 0 auto',
};

function ImageTile({ url, onClick }: { url: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ ...tileStyle, padding: 0, cursor: 'zoom-in' }}
    >
      <SafeImage
        src={url}
        alt=""
        loading="lazy"
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
      />
    </button>
  );
}

function VideoTile({ url }: { url: string }) {
  const [playing, setPlaying] = useState(false);
  if (playing) {
    return (
      <div style={tileStyle}>
        <SafeVideo
          src={url}
          controls
          autoPlay
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={() => setPlaying(true)}
      style={{
        ...tileStyle,
        padding: 0,
        cursor: 'pointer',
        position: 'relative',
      }}
    >
      <SafeVideo
        src={url}
        preload="metadata"
        muted
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
      />
      <div
        className="pointer-events-none absolute inset-0 grid place-items-center"
        style={{ color: 'white', textShadow: '0 0 6px rgba(0,0,0,0.6)' }}
      >
        <PlayCircleOutlined style={{ fontSize: 24 }} />
      </div>
    </button>
  );
}

function OverflowTile({
  count,
  onClick,
  clickable,
}: {
  count: number;
  onClick: () => void;
  clickable: boolean;
}) {
  return (
    <button
      type="button"
      onClick={clickable ? onClick : undefined}
      disabled={!clickable}
      style={{
        ...tileStyle,
        background: 'var(--color-hairline)',
        cursor: clickable ? 'zoom-in' : 'default',
        display: 'grid',
        placeItems: 'center',
        color: 'var(--color-muted-fg)',
        fontSize: 14,
        fontWeight: 500,
      }}
    >
      +{count} 张
    </button>
  );
}

// ────────────────────────────────────────────────────────
// 骨架
// ────────────────────────────────────────────────────────

function TimelineSkeleton({ count }: { count: number }) {
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex gap-3">
          <div style={{ width: 44, flex: '0 0 44px' }}>
            <Skeleton.Button
              active
              size="small"
              shape="round"
              style={{ width: 36, height: 14 }}
            />
          </div>
          <div
            className="flex-1"
            style={{
              border: '1px solid var(--color-border)',
              borderRadius: 8,
              padding: '12px 14px',
            }}
          >
            <Skeleton
              active
              title={{ width: '40%' }}
              paragraph={{ rows: 2, width: ['90%', '60%'] }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
