// 公共分享 — 单人资料卡视图
//
// 渲染只读的人物资料：头像 + 标题 + 基本信息卡 + 电话 + 备注 + 大事记。
// 数据已经在后端按 visible_fields 处理过；前端只是显示器。

import { Button, Card, Image, Tag } from 'antd';
import {
  ClockCircleOutlined,
  EnvironmentOutlined,
  IdcardOutlined,
  PhoneOutlined,
  TeamOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { useMemo, useState } from 'react';

import { PersonAvatar } from '@/components/PersonAvatar';
import { SafeImage, SafeVideo } from '@/components/SafeMedia';
import { MiniMapView } from '@/components/MiniMapView';
import {
  type ShareEvent,
  type ShareEventTypeTaxonomy,
  type VisibleField,
} from '@/api/shares';
import { formatEventDate } from '@/lib/events';
import { iconFromName } from '@/lib/icon-picker';
import type { Address, Person, Phone } from '@/types';

const GENDER_LABEL: Record<string, string> = {
  male: '男',
  female: '女',
  unknown: '未填',
};

interface EventTypeView {
  label: string;
  color: string;
  Icon: ReturnType<typeof iconFromName>;
}

function displayName(p: Person): string {
  return p.real_name || p.standard_title || p.dialect_title || p.nickname || '匿名';
}

function subtitle(p: Person): string | null {
  if (p.real_name) return p.standard_title || p.dialect_title || p.nickname || null;
  return null;
}

export interface PersonProfileViewProps {
  person: Person;
  phones: Phone[];
  addresses: Address[];
  events: ShareEvent[];
  visibleFields: VisibleField[];
  eventTypeTaxonomies?: ShareEventTypeTaxonomy[];
}

export function PersonProfileView({
  person,
  phones,
  addresses,
  events,
  visibleFields,
  eventTypeTaxonomies = [],
}: PersonProfileViewProps) {
  const visible = useMemo(() => new Set(visibleFields), [visibleFields]);
  const [subjectOnly, setSubjectOnly] = useState(false);

  const hasNonSubjectEvents = useMemo(
    () => events.some((e) => !e.is_subject),
    [events],
  );
  const filteredEvents = useMemo(
    () => (subjectOnly ? events.filter((e) => e.is_subject) : events),
    [events, subjectOnly],
  );

  // event_type key → 展示信息(label / color / icon)
  const eventTypeMap = useMemo(() => {
    const map = new Map<string, EventTypeView>();
    for (const t of eventTypeTaxonomies) {
      map.set(t.key, {
        label: t.label,
        color: t.color_hex ?? '#6b7280',
        Icon: iconFromName(t.icon_name),
      });
    }
    return map;
  }, [eventTypeTaxonomies]);

  const resolveEventType = (key: string): EventTypeView => {
    return (
      eventTypeMap.get(key) ?? {
        label: key,
        color: '#6b7280',
        Icon: iconFromName(null),
      }
    );
  };

  const groupedEvents = useMemo(() => {
    if (!visible.has('events')) return [];
    const map = new Map<string, ShareEvent[]>();
    for (const e of filteredEvents) {
      const y = e.event_date ? e.event_date.slice(0, 4) : '未注明年份';
      const arr = map.get(y) ?? [];
      arr.push(e);
      map.set(y, arr);
    }
    return Array.from(map.entries()).sort((a, b) => {
      if (a[0] === '未注明年份') return 1;
      if (b[0] === '未注明年份') return -1;
      return b[0].localeCompare(a[0]);
    });
  }, [filteredEvents, visible]);

  return (
    <div className="mx-auto flex w-full max-w-[640px] flex-col gap-3 px-4 py-5">
      <Card
        style={{ border: '1px solid var(--color-border)', borderRadius: 12 }}
        styles={{ body: { padding: 20 } }}
      >
        <div className="flex items-center gap-4">
          <PersonAvatar person={person} size={72} />
          <div className="flex min-w-0 flex-col gap-1">
            <div className="text-[18px] font-semibold leading-tight text-[var(--color-foreground)]">
              {displayName(person)}
            </div>
            {subtitle(person) && (
              <div className="text-[13px] text-[var(--color-muted-fg)]">
                {subtitle(person)}
              </div>
            )}
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <Tag bordered={false}>{GENDER_LABEL[person.gender] ?? '未填'}</Tag>
              {person.birth_date && (
                <Tag bordered={false} icon={<IdcardOutlined />}>
                  {person.birth_date}
                </Tag>
              )}
            </div>
          </div>
        </div>
      </Card>

      {addresses.length > 0 && (
        <Card
          title={
            <span className="inline-flex items-center gap-2 text-[14px]">
              <EnvironmentOutlined />
              地址
              {addresses.length > 1 && (
                <span className="text-[12px] font-normal text-[var(--color-muted-fg)]">
                  共 {addresses.length} 个
                </span>
              )}
            </span>
          }
          style={{ border: '1px solid var(--color-border)', borderRadius: 12 }}
          styles={{
            header: { borderBottom: '1px solid var(--color-border)' },
            body: { padding: 16 },
          }}
        >
          <div className="flex flex-col gap-3">
            {addresses.map((a) => {
              const hasCoord = a.longitude != null && a.latitude != null;
              return (
                <div
                  key={a.id}
                  className="flex flex-col gap-2 px-3 py-3"
                  style={{
                    background: 'var(--color-surface)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 10,
                  }}
                >
                  <div className="flex items-center gap-2 text-[13px]">
                    {a.label && (
                      <Tag
                        bordered={false}
                        style={{
                          margin: 0,
                          flexShrink: 0,
                          background: 'var(--color-accent-soft)',
                          color: 'var(--color-accent-strong)',
                          fontWeight: 500,
                        }}
                      >
                        {a.label}
                      </Tag>
                    )}
                    <div className="min-w-0 flex-1 text-[var(--color-foreground)]">
                      {a.address}
                    </div>
                  </div>
                  {hasCoord && (
                    <MiniMapView
                      longitude={a.longitude!}
                      latitude={a.latitude!}
                      label={a.label || a.address}
                      height={180}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {person.notes && (
        <Card
          title={
            <span className="inline-flex items-center gap-2 text-[14px]">
              <IdcardOutlined />
              备注
            </span>
          }
          style={{ border: '1px solid var(--color-border)', borderRadius: 12 }}
          styles={{
            header: { borderBottom: '1px solid var(--color-border)' },
            body: { padding: 16 },
          }}
        >
          <p
            className="m-0 text-[13px] text-[var(--color-foreground)]"
            style={{ whiteSpace: 'pre-wrap' }}
          >
            {person.notes}
          </p>
        </Card>
      )}

      {phones.length > 0 && (
        <Card
          title={
            <span className="inline-flex items-center gap-2 text-[14px]">
              <PhoneOutlined />
              联系方式
            </span>
          }
          style={{ border: '1px solid var(--color-border)', borderRadius: 12 }}
          styles={{
            header: { borderBottom: '1px solid var(--color-border)' },
            body: { padding: 16 },
          }}
        >
          <ul className="m-0 flex flex-col gap-2 p-0 text-[13px]" style={{ listStyle: 'none' }}>
            {phones.map((p) => (
              <li
                key={p.id}
                className="flex flex-wrap items-baseline gap-x-3 gap-y-1"
              >
                <a
                  href={`tel:${p.phone}`}
                  className="font-medium tabular-nums"
                  style={{ color: 'var(--color-accent-strong)' }}
                >
                  {p.phone}
                </a>
                {p.note && (
                  <span className="text-[12px] text-[var(--color-muted-fg)]">
                    {p.note}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {visible.has('events') && events.length > 0 && (
        <Card
          title={
            <span className="inline-flex items-center gap-2 text-[14px]">
              <ClockCircleOutlined />
              大事记
              <span className="text-[12px] font-normal text-[var(--color-muted-fg)]">
                共 {filteredEvents.length} 条
              </span>
            </span>
          }
          extra={
            hasNonSubjectEvents ? (
              <Button
                size="small"
                type={subjectOnly ? 'primary' : 'default'}
                icon={<UserOutlined />}
                onClick={() => setSubjectOnly((v) => !v)}
              >
                只看本人
              </Button>
            ) : null
          }
          style={{ border: '1px solid var(--color-border)', borderRadius: 12 }}
          styles={{
            header: { borderBottom: '1px solid var(--color-border)' },
            body: { padding: '8px 16px 16px' },
          }}
        >
          {groupedEvents.length > 0 ? (
            groupedEvents.map(([year, list]) => (
              <YearSection
                key={year}
                year={year}
                events={list}
                showMap={visible.has('event_map')}
                resolveEventType={resolveEventType}
              />
            ))
          ) : (
            <div className="py-6 text-center text-[13px] text-[var(--color-muted-fg)]">
              没有作为主角的事件
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

function YearSection({
  year,
  events,
  showMap,
  resolveEventType,
}: {
  year: string;
  events: ShareEvent[];
  showMap: boolean;
  resolveEventType: (key: string) => EventTypeView;
}) {
  return (
    <section className="flex flex-col gap-0 pt-3 first:pt-0">
      <header className="flex items-center gap-2 pb-1">
        <span
          className="text-[12px] font-semibold tabular-nums"
          style={{ color: 'var(--color-muted-fg)' }}
        >
          {year}
        </span>
        <span
          aria-hidden
          className="flex-1"
          style={{ height: 1, background: 'var(--color-border)' }}
        />
      </header>
      <ul className="m-0 flex list-none flex-col gap-0 p-0">
        {events.map((e) => (
          <EventRow
            key={e.id}
            event={e}
            showMap={showMap}
            typeView={resolveEventType(e.event_type)}
          />
        ))}
      </ul>
    </section>
  );
}

function EventRow({
  event,
  showMap,
  typeView,
}: {
  event: ShareEvent;
  showMap: boolean;
  typeView: EventTypeView;
}) {
  const { monthDay } = formatEventDate(event.event_date);
  const [expandParticipants, setExpandParticipants] = useState(false);
  const PARTICIPANT_FOLD_THRESHOLD = 3;
  const participantsCollapsed =
    event.participants.length > PARTICIPANT_FOLD_THRESHOLD && !expandParticipants;
  const visibleParticipants = participantsCollapsed
    ? event.participants.slice(0, PARTICIPANT_FOLD_THRESHOLD)
    : event.participants;
  const { Icon: TypeIcon, color: typeColor, label: typeLabel } = typeView;

  const imageUrls = useMemo(
    () => event.media.filter((m) => m.type === 'image').map((m) => m.url),
    [event.media]
  );
  const [preview, setPreview] = useState<{ visible: boolean; current: number }>(
    { visible: false, current: 0 }
  );
  const imageIndexOf = (mediaIdx: number): number => {
    let n = -1;
    for (let i = 0; i <= mediaIdx && i < event.media.length; i++) {
      if (event.media[i].type === 'image') n += 1;
    }
    return event.media[mediaIdx]?.type === 'image' ? n : -1;
  };

  return (
    <li className="flex gap-3">
      {/* 时间轴日期列 */}
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
            background: 'var(--color-border)',
          }}
        />
      </div>

      {/* 内容卡 */}
      <div
        className="my-2 min-w-0 flex-1"
        style={{
          border: '1px solid var(--color-border)',
          borderRadius: 8,
          padding: '12px 14px',
          background: 'var(--color-card, var(--color-background))',
        }}
      >
        <div className="flex flex-wrap items-center gap-2">
          <TypeIcon
            style={{
              fontSize: 14,
              color: typeColor,
              flex: '0 0 auto',
            }}
          />
          <span
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: 'var(--color-foreground)',
            }}
          >
            {event.title}
          </span>
          <Tag
            bordered={false}
            style={{
              marginInlineEnd: 0,
              background: `color-mix(in srgb, ${typeColor} 14%, transparent)`,
              color: typeColor,
            }}
          >
            {typeLabel}
          </Tag>
        </div>

        {event.subjects.length > 0 && !(event.subjects.length === 1 && event.is_subject) && (
          <div
            className="mt-1.5 text-[12px]"
            style={{ color: 'var(--color-foreground)' }}
          >
            <UserOutlined style={{ color: 'var(--color-muted-fg)', marginRight: 4 }} />
            <span style={{ color: 'var(--color-muted-fg)' }}>主角：</span>
            <span style={{ fontWeight: 600 }}>
              {event.subjects.map((s) => s.name).join('、')}
            </span>
          </div>
        )}

        {event.location && (
          <div
            className="mt-1.5 flex items-center gap-1 text-[12px]"
            style={{ color: 'var(--color-muted-fg)' }}
          >
            <EnvironmentOutlined />
            <span>{event.location}</span>
          </div>
        )}

        {event.location && event.longitude != null && event.latitude != null && showMap && (
          <div className="mt-2">
            <MiniMapView
              longitude={event.longitude}
              latitude={event.latitude}
              label={event.location}
            />
          </div>
        )}

        {event.body && (
          <p
            className="m-0 mt-2 text-[13px]"
            style={{
              color: 'var(--color-foreground)',
              whiteSpace: 'pre-wrap',
            }}
          >
            {event.body}
          </p>
        )}

        {event.media.length > 0 && (
          <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
            {event.media.map((m, i) =>
              m.type === 'video' ? (
                <SafeVideo
                  key={i}
                  src={m.url}
                  controls
                  muted
                  preload="metadata"
                  style={{
                    width: '100%',
                    aspectRatio: '1 / 1',
                    objectFit: 'cover',
                    borderRadius: 6,
                    background: '#000',
                  }}
                />
              ) : (
                <button
                  key={i}
                  type="button"
                  onClick={() => {
                    const idx = imageIndexOf(i);
                    if (idx >= 0) setPreview({ visible: true, current: idx });
                  }}
                  style={{ padding: 0, border: 'none', background: 'none', cursor: 'zoom-in' }}
                >
                  <SafeImage
                    src={m.url}
                    alt={m.caption ?? event.title}
                    style={{
                      width: '100%',
                      aspectRatio: '1 / 1',
                      objectFit: 'cover',
                      borderRadius: 6,
                    }}
                  />
                </button>
              )
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
        )}

        {event.participants.length > 0 && (
          <div
            className="mt-1 flex items-start text-[12px]"
            style={{ color: 'var(--color-muted-fg)' }}
          >
            <span style={{ flexShrink: 0 }}>
              <TeamOutlined style={{ marginRight: 4 }} />
              参与：
            </span>
            <div className="min-w-0 flex-1">
              {visibleParticipants.map((p) => p.name).join('、')}
              {participantsCollapsed && (
                <>
                  {' 等 '}
                  <button
                    type="button"
                    onClick={() => setExpandParticipants(true)}
                    className="cursor-pointer border-0 bg-transparent p-0 underline"
                    style={{ color: 'var(--color-accent-strong)' }}
                  >
                    {event.participants.length} 人
                  </button>
                </>
              )}
              {!participantsCollapsed && event.participants.length > PARTICIPANT_FOLD_THRESHOLD && (
                <>
                  {' '}
                  <button
                    type="button"
                    onClick={() => setExpandParticipants(false)}
                    className="cursor-pointer border-0 bg-transparent p-0 underline"
                    style={{ color: 'var(--color-accent-strong)' }}
                  >
                    收起
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </li>
  );
}

export default PersonProfileView;
