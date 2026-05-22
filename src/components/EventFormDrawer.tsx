import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Button,
  Drawer,
  Form,
  Input,
  InputNumber,
  Select,
  Tag,
} from 'antd';
import {
  DeleteOutlined,
  LoadingOutlined,
  PlayCircleOutlined,
  PlusOutlined,
  StarFilled,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import AMapPicker from '@/components/AMapPicker';
import { TaxonomyEditModal } from '@/components/TaxonomyEditModal';
import { SafeImage, SafeVideo } from '@/components/SafeMedia';
import { listPersons } from '@/api/persons';
import { getSettings } from '@/api/settings';
import { uploadImage } from '@/api/upload';
import { createEvent, updateEvent } from '@/api/events';
import { iconFromName } from '@/lib/icon-picker';
import { useEventTypes } from '@/lib/taxonomies';
import { toast } from '@/lib/message';
import type {
  EventInput,
  EventItem,
  EventMedia,
  Person,
  Taxonomy,
} from '@/types';

const { TextArea } = Input;

function personDisplayName(p: Person): string {
  return (
    p.real_name || p.dialect_title || p.standard_title || p.nickname || `#${p.id}`
  );
}

function daysInMonth(y: number | null, m: number | null): number {
  if (!y || !m) return 31;
  return new Date(y, m, 0).getDate();
}

function parseDate(s: string | null | undefined): {
  y: number | null;
  m: number | null;
  d: number | null;
} {
  if (!s) return { y: null, m: null, d: null };
  const p = s.split('-');
  return {
    y: p[0] ? Number(p[0]) : null,
    m: p[1] ? Number(p[1]) : null,
    d: p[2] ? Number(p[2]) : null,
  };
}

function buildDate(
  y: number | null,
  m: number | null,
  d: number | null
): string | null {
  if (!y || !Number.isFinite(y)) return null;
  let s = String(y);
  if (m && Number.isFinite(m)) {
    s += `-${String(m).padStart(2, '0')}`;
    if (d && Number.isFinite(d)) {
      s += `-${String(d).padStart(2, '0')}`;
    }
  }
  return s;
}

interface Props {
  open: boolean;
  onClose: () => void;
  personId: number;
  event?: EventItem | null;
}

export function EventFormDrawer({ open, onClose, personId, event }: Props) {
  const isEdit = !!event;
  const qc = useQueryClient();

  // viewerIsSubject: 当前从 personId 这个视角是不是有权改"主角/参与人"字段
  // 新建时 = true（创建者全权）；编辑时 = 事件无主角 OR personId 在主角里
  const viewerIsSubject =
    !isEdit ||
    !event ||
    event.subject_ids.length === 0 ||
    event.subject_ids.includes(personId);

  const [title, setTitle] = useState('');
  const [eventType, setEventType] = useState<string>('birthday');
  const [year, setYear] = useState<number | null>(null);
  const [month, setMonth] = useState<number | null>(null);
  const [day, setDay] = useState<number | null>(null);
  const [location, setLocation] = useState('');
  const [longitude, setLongitude] = useState<number | null>(null);
  const [latitude, setLatitude] = useState<number | null>(null);
  const [showCoordInput, setShowCoordInput] = useState(false);
  const [isPicking, setIsPicking] = useState(false);
  const [body, setBody] = useState('');
  const [personIds, setPersonIds] = useState<number[]>([personId]);
  const [subjectIds, setSubjectIds] = useState<number[]>([personId]);
  const [media, setMedia] = useState<EventMedia[]>([]);
  const [uploadingCount, setUploadingCount] = useState(0);
  const [quickAddTypeOpen, setQuickAddTypeOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    if (event) {
      setTitle(event.title);
      setEventType(event.event_type);
      const { y, m, d } = parseDate(event.event_date);
      setYear(y);
      setMonth(m);
      setDay(d);
      setLocation(event.location ?? '');
      setLongitude(event.longitude);
      setLatitude(event.latitude);
      setShowCoordInput(false);
      setIsPicking(false);
      setBody(event.body ?? '');
      const ids = event.person_ids.includes(personId)
        ? event.person_ids
        : [personId, ...event.person_ids];
      setPersonIds(ids);
      // 直接采用后端返回的 subject_ids（可为空，表示"无主角"）
      setSubjectIds(event.subject_ids.filter((id) => ids.includes(id)));
      setMedia(event.media);
    } else {
      setTitle('');
      // 新建事件时默认取分类列表第一项；尚未加载时回落 'birthday'（默认 seed 第一项）
      setEventType(eventTypes[0]?.key ?? 'birthday');
      setYear(null);
      setMonth(null);
      setDay(null);
      setLocation('');
      setLongitude(null);
      setLatitude(null);
      setShowCoordInput(false);
      setIsPicking(false);
      setBody('');
      setPersonIds([personId]);
      setSubjectIds([personId]);
      setMedia([]);
    }
    // 故意不把 eventTypes 加进 deps：避免分类刷新时重置整张表单
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, event, personId]);

  const personsQ = useQuery({
    queryKey: ['persons'],
    queryFn: () => listPersons(),
    enabled: open,
  });

  const eventTypes = useEventTypes();

  const settingsQ = useQuery({
    queryKey: ['settings'],
    queryFn: getSettings,
    enabled: open,
  });
  const s3Ready = !!(
    settingsQ.data?.s3_endpoint &&
    settingsQ.data?.s3_bucket &&
    settingsQ.data?.s3_access_key_id &&
    settingsQ.data?.s3_secret_access_key
  );

  const personOptions = useMemo(
    () =>
      (personsQ.data ?? []).map((p) => ({
        value: p.id,
        label: personDisplayName(p),
      })),
    [personsQ.data]
  );

  const saveMut = useMutation({
    mutationFn: (input: EventInput) =>
      isEdit ? updateEvent(event!.id, input) : createEvent(input),
    onSuccess: () => {
      toast.success(isEdit ? '已更新' : '已添加');
      qc.invalidateQueries({ queryKey: ['events'] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const canSave = title.trim().length > 0 && personIds.length > 0;

  const handleSave = () => {
    if (!canSave) {
      toast.warning(!title.trim() ? '标题不能为空' : '至少选择一个人物');
      return;
    }
    if (uploadingCount > 0) {
      toast.warning('媒体还在上传，请稍候');
      return;
    }
    saveMut.mutate({
      title: title.trim(),
      body: body.trim() || null,
      event_date: buildDate(year, month, day),
      event_type: eventType,
      location: location.trim() || null,
      longitude,
      latitude,
      media,
      person_ids: personIds,
      subject_ids: subjectIds,
    });
  };

  const doUpload = async (files: FileList | File[]) => {
    if (!s3Ready) {
      toast.error('请先在「设置 → 存储」中完成公共文件存储配置');
      return;
    }
    const arr = Array.from(files);
    for (const file of arr) {
      const isImg = file.type.startsWith('image/');
      const isVid = file.type.startsWith('video/');
      if (!isImg && !isVid) {
        toast.error(`跳过 ${file.name}：仅支持图片/视频`);
        continue;
      }
      setUploadingCount((n) => n + 1);
      try {
        const res = await uploadImage(file, 'event');
        const type: 'image' | 'video' = res.type ?? (isVid ? 'video' : 'image');
        setMedia((prev) => [...prev, { type, url: res.url }]);
      } catch (e: unknown) {
        toast.error(`上传失败：${(e as Error).message}`);
      } finally {
        setUploadingCount((n) => n - 1);
      }
    }
  };

  const maxDay = daysInMonth(year, month);

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={isEdit ? '编辑事件' : '新增事件'}
      width={520}
      destroyOnClose
      maskClosable={!saveMut.isPending}
      extra={
        <div className="flex items-center gap-2">
          <Button onClick={onClose}>取消</Button>
          <Button
            type="primary"
            loading={saveMut.isPending}
            disabled={!canSave}
            onClick={handleSave}
          >
            保存
          </Button>
        </div>
      }
      styles={{ body: { paddingTop: 8 } }}
    >
      <div className="flex flex-col gap-4">
        <Field label="标题" required>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="如：妈妈生日聚餐 / 西湖春游"
            maxLength={120}
          />
        </Field>

        <Field label="类型">
          <Select
            value={eventType}
            onChange={(v) => setEventType(v)}
            style={{ width: '100%' }}
            options={eventTypes.map((t) => ({
              value: t.key,
              label: (
                <span className="inline-flex items-center gap-1.5">
                  {(() => {
                    const Icon = iconFromName(t.icon_name);
                    return (
                      <Icon
                        style={{ color: t.color_hex ?? '#6b7280', fontSize: 14 }}
                      />
                    );
                  })()}
                  <span>{t.label}</span>
                </span>
              ),
            }))}
            dropdownRender={(menu) => (
              <>
                {menu}
                <div
                  style={{
                    borderTop: '1px solid var(--color-border)',
                    padding: 4,
                  }}
                >
                  <Button
                    type="text"
                    icon={<PlusOutlined />}
                    block
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => setQuickAddTypeOpen(true)}
                  >
                    新增类型
                  </Button>
                </div>
              </>
            )}
          />
        </Field>

        <Field label="日期" description="年/月/日皆可缺省；不填则归入「未知时间」">
          <div className="flex flex-wrap items-center gap-2">
            <InputNumber
              value={year}
              onChange={(v) => {
                const ny = v == null ? null : Number(v);
                if (!ny || !Number.isFinite(ny)) {
                  setYear(null);
                  setMonth(null);
                  setDay(null);
                } else {
                  setYear(ny);
                }
              }}
              min={1900}
              max={2100}
              placeholder="年"
              style={{ width: 96 }}
              controls={false}
            />
            <Select
              value={month ?? undefined}
              onChange={(v) => {
                if (v == null) {
                  setMonth(null);
                  setDay(null);
                } else {
                  const nm = Number(v);
                  const cap = daysInMonth(year, nm);
                  setMonth(nm);
                  if (day && day > cap) setDay(null);
                }
              }}
              placeholder="月"
              style={{ width: 80 }}
              allowClear
              disabled={!year}
              options={Array.from({ length: 12 }, (_, i) => i + 1).map((m) => ({
                value: m,
                label: String(m),
              }))}
            />
            <Select
              value={day ?? undefined}
              onChange={(v) => setDay(v == null ? null : Number(v))}
              placeholder="日"
              style={{ width: 80 }}
              allowClear
              disabled={!month}
              options={Array.from({ length: maxDay }, (_, i) => i + 1).map(
                (d) => ({ value: d, label: String(d) })
              )}
            />
            {(year || month || day) && (
              <Button
                type="text"
                size="small"
                onClick={() => {
                  setYear(null);
                  setMonth(null);
                  setDay(null);
                }}
              >
                清除
              </Button>
            )}
          </div>
        </Field>

        <div className="flex flex-col gap-2">
          <span style={{ fontSize: 13 }}>位置</span>
          <Input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="手填地址，或下方在地图中拾取"
            disabled={isPicking}
            maxLength={120}
          />
          {isPicking && (
            <p className="m-0 text-[12px] text-[var(--color-accent-strong)]">
              正在拾取中，选择 POI 后地址将自动填入，届时可手动微调
            </p>
          )}

          {!isPicking && (
            <Button
              type="text"
              size="small"
              style={{ alignSelf: 'flex-start', paddingLeft: 0 }}
              onClick={() => setShowCoordInput((v) => !v)}
            >
              {showCoordInput ? '收起坐标输入' : '手动输入坐标'}
            </Button>
          )}

          {showCoordInput && !isPicking && (
            <div className="grid grid-cols-2 gap-2">
              <InputNumber
                value={longitude}
                onChange={(v) => setLongitude(v == null ? null : Number(v))}
                step={0.000001}
                min={-180}
                max={180}
                placeholder="经度 116.397428"
                style={{ width: '100%', fontFamily: 'monospace' }}
                controls={false}
              />
              <InputNumber
                value={latitude}
                onChange={(v) => setLatitude(v == null ? null : Number(v))}
                step={0.000001}
                min={-90}
                max={90}
                placeholder="纬度 39.90923"
                style={{ width: '100%', fontFamily: 'monospace' }}
                controls={false}
              />
            </div>
          )}

          <AMapPicker
            longitude={longitude}
            latitude={latitude}
            forceOpen={
              showCoordInput && (longitude !== null || latitude !== null)
            }
            onChange={(lng, lat, addr) => {
              setLongitude(lng);
              setLatitude(lat);
              if (addr) setLocation(addr);
              setIsPicking(false);
            }}
            onPickingChange={setIsPicking}
          />

          {(longitude !== null || latitude !== null) && !isPicking && (
            <div
              className="flex flex-wrap items-center gap-2 px-2.5 py-1.5"
              style={{
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                borderRadius: 8,
              }}
            >
              <span className="text-[12px] text-[var(--color-muted-fg)]">
                坐标：{longitude?.toFixed(6)}, {latitude?.toFixed(6)}
              </span>
              <Button
                type="text"
                size="small"
                danger
                icon={<DeleteOutlined />}
                onClick={() => {
                  setLongitude(null);
                  setLatitude(null);
                  setShowCoordInput(false);
                }}
              >
                清除坐标
              </Button>
            </div>
          )}
        </div>

        <Field label="正文">
          <TextArea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="可填可不填，简单写两句"
            autoSize={{ minRows: 3, maxRows: 8 }}
            maxLength={2000}
            showCount
          />
        </Field>

        <Field
          label="涉及人物"
          required
          description={
            viewerIsSubject
              ? '点击 ⭐ 切换主角；可以一个都不设，也可以多个'
              : '由主角管理，参与人无法在此修改'
          }
        >
          <Select
            mode="multiple"
            value={personIds}
            disabled={!viewerIsSubject}
            onChange={(v: number[]) => {
              if (!viewerIsSubject) return;
              const next = v.includes(personId) ? v : [personId, ...v];
              setPersonIds(next);
              setSubjectIds((s) => s.filter((id) => next.includes(id)));
            }}
            options={personOptions}
            placeholder="搜索并选择"
            optionFilterProp="label"
            loading={personsQ.isLoading}
            style={{ width: '100%' }}
            maxTagCount="responsive"
            tagRender={(props) => {
              const pid = Number(props.value);
              const isSubject = subjectIds.includes(pid);
              return (
                <Tag
                  closable={viewerIsSubject && props.closable}
                  onClose={props.onClose}
                  style={{
                    marginInlineEnd: 4,
                    paddingInlineStart: 6,
                    background: isSubject
                      ? 'var(--color-accent-soft)'
                      : 'var(--color-hairline)',
                    color: isSubject
                      ? 'var(--color-accent-strong)'
                      : 'var(--color-foreground)',
                    border: 'none',
                    opacity: viewerIsSubject ? 1 : 0.85,
                  }}
                >
                  <StarFilled
                    onMouseDown={(e) => {
                      // 阻止 Select 把这次点击当成关闭/打开 dropdown
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (!viewerIsSubject) return;
                      setSubjectIds((s) =>
                        s.includes(pid)
                          ? s.filter((id) => id !== pid)
                          : [...s, pid]
                      );
                    }}
                    style={{
                      marginRight: 4,
                      cursor: viewerIsSubject ? 'pointer' : 'default',
                      color: isSubject
                        ? 'var(--color-accent-strong)'
                        : 'rgba(0,0,0,0.18)',
                    }}
                    title={
                      !viewerIsSubject
                        ? '由主角管理'
                        : isSubject
                          ? '取消主角'
                          : '设为主角'
                    }
                  />
                  {props.label}
                </Tag>
              );
            }}
          />
        </Field>

        <Field
          label="图片 / 视频"
          description={
            s3Ready
              ? '点击右下「添加」选择文件（图 ≤10MB · 视频 ≤90MB）'
              : '需先配置公共文件存储'
          }
        >
          <MediaGrid
            media={media}
            uploadingCount={uploadingCount}
            disabled={!s3Ready}
            onPick={() => fileInputRef.current?.click()}
            onRemove={(idx) =>
              setMedia((prev) => prev.filter((_, i) => i !== idx))
            }
          />
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/*"
            multiple
            style={{ display: 'none' }}
            onChange={(e) => {
              const fs = e.target.files;
              if (fs && fs.length > 0) void doUpload(fs);
              e.target.value = '';
            }}
          />
        </Field>
      </div>

      <TaxonomyEditModal
        open={quickAddTypeOpen}
        domain="event_type"
        taxonomy={null}
        onClose={() => setQuickAddTypeOpen(false)}
        onSaved={(t: Taxonomy) => {
          qc.invalidateQueries({ queryKey: ['taxonomies', 'event_type'] });
          qc.invalidateQueries({ queryKey: ['taxonomies', 'event_type', 'all'] });
          setEventType(t.key);
        }}
      />
    </Drawer>
  );
}

function Field({
  label,
  required,
  description,
  children,
}: {
  label: string;
  required?: boolean;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Form.Item
        label={
          <span style={{ fontSize: 13 }}>
            {label}
            {required && (
              <span style={{ color: '#dc2626', marginLeft: 4 }}>*</span>
            )}
          </span>
        }
        layout="vertical"
        colon={false}
        style={{ marginBottom: 0 }}
      >
        {children}
      </Form.Item>
      {description && (
        <span className="text-[12px] text-[var(--color-muted-fg)]">
          {description}
        </span>
      )}
    </div>
  );
}

function MediaGrid({
  media,
  uploadingCount,
  disabled,
  onPick,
  onRemove,
}: {
  media: EventMedia[];
  uploadingCount: number;
  disabled: boolean;
  onPick: () => void;
  onRemove: (idx: number) => void;
}) {
  return (
    <div className="grid grid-cols-4 gap-2">
      {media.map((m, i) => (
        <div
          key={`${m.url}-${i}`}
          className="group relative"
          style={{
            aspectRatio: '1 / 1',
            border: '1px solid var(--color-border)',
            borderRadius: 6,
            overflow: 'hidden',
            background: '#f5f5f5',
            isolation: 'isolate',
          }}
        >
          {m.type === 'image' ? (
            <SafeImage
              src={m.url}
              alt=""
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              loading="lazy"
            />
          ) : (
            <>
              <SafeVideo
                src={m.url}
                preload="metadata"
                muted
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
              <div
                className="pointer-events-none absolute inset-0 grid place-items-center"
                style={{
                  color: 'white',
                  textShadow: '0 0 6px rgba(0,0,0,0.6)',
                }}
              >
                <PlayCircleOutlined style={{ fontSize: 28 }} />
              </div>
            </>
          )}
          {/* hover 时整张图轻微变暗,作为视觉反馈 */}
          <div
            className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-150 group-hover:opacity-100"
            style={{ background: 'rgba(0,0,0,0.18)' }}
          />
          <button
            type="button"
            onClick={() => onRemove(i)}
            aria-label="移除该媒体"
            title="移除该媒体"
            className="absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-full transition-all duration-150 hover:scale-110"
            style={{
              background: 'rgba(0,0,0,0.55)',
              color: '#fff',
              border: 'none',
              cursor: 'pointer',
              padding: 0,
              zIndex: 2,
              lineHeight: 1,
              backdropFilter: 'blur(2px)',
              WebkitBackdropFilter: 'blur(2px)',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background =
                'rgba(220,38,38,0.92)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background =
                'rgba(0,0,0,0.55)';
            }}
          >
            <DeleteOutlined style={{ fontSize: 12 }} />
          </button>
        </div>
      ))}
      {Array.from({ length: uploadingCount }).map((_, i) => (
        <div
          key={`upl-${i}`}
          className="grid place-items-center"
          style={{
            aspectRatio: '1 / 1',
            border: '1px dashed var(--color-border)',
            borderRadius: 6,
            color: 'var(--color-muted-fg)',
          }}
        >
          <LoadingOutlined style={{ fontSize: 20 }} />
        </div>
      ))}
      <button
        type="button"
        onClick={onPick}
        disabled={disabled}
        className="grid place-items-center"
        style={{
          aspectRatio: '1 / 1',
          border: '1px dashed var(--color-border)',
          borderRadius: 6,
          background: 'transparent',
          color: disabled ? 'var(--color-muted-fg)' : 'var(--color-foreground)',
          cursor: disabled ? 'not-allowed' : 'pointer',
        }}
      >
        <div className="flex flex-col items-center gap-1">
          <PlusOutlined />
          <span style={{ fontSize: 12 }}>添加</span>
        </div>
      </button>
    </div>
  );
}
