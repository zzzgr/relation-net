import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeftOutlined,
  CheckOutlined,
  DeleteOutlined,
  LoadingOutlined,
  PartitionOutlined,
  PlusOutlined,
  QuestionCircleOutlined,
  SaveOutlined,
  SearchOutlined,
  ShareAltOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import {
  Badge,
  Button,
  Card,
  Divider,
  Form,
  Input,
  InputNumber,
  Popover,
  Radio,
  Select,
  Switch,
  Tabs,
  Tooltip,
} from 'antd';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import AMapPicker from '@/components/AMapPicker';
import { PersonAvatar } from '@/components/PersonAvatar';
import { EventsCard } from '@/components/EventsCard';
import ShareDialog from '@/components/ShareDialog';
import { TaxonomyEditModal } from '@/components/TaxonomyEditModal';
import {
  createPerson,
  deletePerson,
  getPerson,
  listPersons,
  updatePerson,
} from '@/api/persons';
import {
  createRelation,
  deleteRelation,
  listRelations,
  updateRelation,
} from '@/api/relations';
import {
  createPhone,
  deletePhone,
  listPhones,
  updatePhone,
} from '@/api/phones';
import {
  createAddress,
  deleteAddress,
  listAddresses,
  updateAddress,
} from '@/api/addresses';
import { getSettings, setFamilyRoots } from '@/api/settings';
import { uploadImage } from '@/api/upload';
import {
  KINSHIPS,
  birthOrderLabel,
} from '@/lib/relations';
import type { Kinship } from '@/lib/relations';
import { useRelationLabel, useSocialRelations } from '@/lib/taxonomies';
import { toast, getModal } from '@/lib/message';
import type { Address, Person, PersonInput, Phone, Relation, Taxonomy } from '@/types';

const { TextArea } = Input;

// ────────────────────────────────────────────────────────
// 出生日期：年/月/日 三个独立可选
// ────────────────────────────────────────────────────────

function parseBirthDate(s: string | null | undefined): {
  year: number | null;
  month: number | null;
  day: number | null;
} {
  if (!s) return { year: null, month: null, day: null };
  const parts = s.split('-');
  return {
    year: parts[0] ? Number(parts[0]) : null,
    month: parts[1] ? Number(parts[1]) : null,
    day: parts[2] ? Number(parts[2]) : null,
  };
}

function buildBirthDate(
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

function daysInMonth(year: number | null, month: number | null): number {
  if (!year || !month) return 31;
  return new Date(year, month, 0).getDate();
}

function BirthDateInput({
  year,
  month,
  day,
  onChange,
}: {
  year: number | null;
  month: number | null;
  day: number | null;
  onChange: (y: number | null, m: number | null, d: number | null) => void;
}) {
  const maxDay = daysInMonth(year, month);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <InputNumber
        value={year}
        onChange={(v) => {
          const ny = v == null ? null : Number(v);
          if (!ny || !Number.isFinite(ny)) onChange(null, null, null);
          else onChange(ny, month, day);
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
            onChange(year, null, null);
          } else {
            const nm = Number(v);
            const cap = daysInMonth(year, nm);
            onChange(year, nm, day && day > cap ? null : day);
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
        onChange={(v) => onChange(year, month, v == null ? null : Number(v))}
        placeholder="日"
        style={{ width: 80 }}
        allowClear
        disabled={!month}
        options={Array.from({ length: maxDay }, (_, i) => i + 1).map((d) => ({
          value: d,
          label: String(d),
        }))}
      />
      {(year || month || day) && (
        <Button type="text" size="small" onClick={() => onChange(null, null, null)}>
          清除
        </Button>
      )}
      <span className="text-[12px] text-[var(--color-muted-fg)]">
        年/月/日皆可缺省
      </span>
    </div>
  );
}

// ────────────────────────────────────────────────────────
// 主表单
// ────────────────────────────────────────────────────────

export default function PersonForm() {
  const { id } = useParams();
  const idNum = id ? Number(id) : undefined;
  const isEdit = idNum !== undefined;
  const navigate = useNavigate();
  const qc = useQueryClient();

  const personQ = useQuery({
    queryKey: ['person', idNum],
    queryFn: () => getPerson(idNum!),
    enabled: isEdit,
  });

  const [realName, setRealName] = useState('');
  const [dialectTitle, setDialectTitle] = useState('');
  const [gender, setGender] = useState<'male' | 'female' | 'unknown'>('unknown');
  const [kinship, setKinship] = useState<Kinship>('blood');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [avatarChar, setAvatarChar] = useState<string | null>(null);
  const avatarCharManual = useRef(false);
  const [notes, setNotes] = useState('');
  const [birthYear, setBirthYear] = useState<number | null>(null);
  const [birthMonth, setBirthMonth] = useState<number | null>(null);
  const [birthDay, setBirthDay] = useState<number | null>(null);
  const [birthCalendar, setBirthCalendar] = useState<'solar' | 'lunar' | 'both'>('solar');

  useEffect(() => {
    if (!personQ.data) return;
    const p = personQ.data;
    setRealName(p.real_name ?? '');
    setDialectTitle(p.dialect_title ?? '');
    setGender(p.gender);
    setKinship(p.kinship ?? 'social');
    setAvatarUrl(p.avatar_url ?? '');
    setAvatarChar(p.avatar_char ?? null);
    avatarCharManual.current = true;
    setNotes(p.notes ?? '');
    const { year, month, day } = parseBirthDate(p.birth_date);
    setBirthYear(year);
    setBirthMonth(month);
    setBirthDay(day);
    setBirthCalendar(p.birth_calendar ?? 'solar');
  }, [personQ.data]);

  useEffect(() => {
    if (isEdit || avatarCharManual.current) return;
    const chars = Array.from(realName.trim());
    setAvatarChar(chars.length > 0 ? chars[chars.length - 1] : null);
  }, [realName, isEdit]);

  const handleAvatarCharChange = (v: string | null) => {
    avatarCharManual.current = true;
    setAvatarChar(v);
  };

  const upsertMut = useMutation({
    mutationFn: (input: PersonInput) =>
      isEdit ? updatePerson(idNum!, input) : createPerson(input),
    onSuccess: (saved: Person) => {
      toast.success(isEdit ? '已更新' : '已创建');
      qc.invalidateQueries({ queryKey: ['persons'] });
      qc.invalidateQueries({ queryKey: ['person', saved.id] });
      if (!isEdit) navigate(`/persons/${saved.id}/edit`, { replace: true });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: deletePerson,
    onSuccess: () => {
      toast.success('已移入回收站');
      qc.invalidateQueries({ queryKey: ['persons'] });
      navigate('/persons');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleSave = () => {
    const input: PersonInput = {
      nickname: personQ.data?.nickname ?? null,
      standard_title: personQ.data?.standard_title ?? null,
      dialect_title: dialectTitle.trim() || null,
      real_name: realName.trim() || null,
      gender,
      birth_date: buildBirthDate(birthYear, birthMonth, birthDay),
      birth_calendar: birthCalendar,
      kinship,
      avatar_url: avatarUrl.trim() || null,
      avatar_char: avatarChar,
      notes: notes.trim() || null,
    };
    upsertMut.mutate(input);
  };

  const confirmDelete = () => {
    if (!idNum) return;
    getModal()?.confirm({
      title: (<span>确认将 <b>{displayName}</b> 移入回收站？</span>),
      content: '该人物会从列表中隐藏，可在回收站中恢复。',
      okText: '移入回收站',
      cancelText: '取消',
      onOk: () => deleteMut.mutate(idNum),
    });
  };

  const displayName =
    realName ||
    dialectTitle ||
    personQ.data?.standard_title ||
    personQ.data?.nickname ||
    (isEdit ? `#${idNum}` : '新人物');

  const [shareOpen, setShareOpen] = useState(false);

  if (isEdit && personQ.isLoading) {
    return (
      <div className="grid place-items-center py-20 text-[13px] text-[var(--color-muted-fg)]">
        加载中…
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 pb-24 md:pb-0">
      {/* —— Header —— */}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="text"
          size="small"
          icon={<ArrowLeftOutlined />}
          onClick={() => navigate('/persons')}
        >
          <span className="hidden md:inline">返回</span>
        </Button>
        <h1 className="m-0 text-[24px] font-semibold tracking-tight md:text-[28px]">
          {isEdit ? '编辑人物' : '新增人物'}
        </h1>
        <div className="ml-auto hidden gap-2 md:flex">
          {isEdit && idNum && (
            <Button icon={<ShareAltOutlined />} onClick={() => setShareOpen(true)}>
              分享此人
            </Button>
          )}
          {isEdit && (
            <Button danger icon={<DeleteOutlined />} onClick={confirmDelete}>
              删除
            </Button>
          )}
          <Button
            type="primary"
            icon={<SaveOutlined />}
            onClick={handleSave}
            loading={upsertMut.isPending}
          >
            {isEdit ? '保存修改' : '创建'}
          </Button>
        </div>
      </div>

      {/* —— BasicInfoCard —— */}
      <Card
        title="基本信息"
        extra={
          <span className="text-[12px] text-[var(--color-muted-fg)]">
            姓名 · 称谓 · 性别 · 生日 · 档位
          </span>
        }
        style={{ border: '1px solid var(--color-border)', borderRadius: 10 }}
      >
        <div className="flex flex-col gap-5">
          {/* 顶部：头像 + 大名 */}
          <div className="flex items-center gap-4">
            <PersonAvatar
              person={{ gender, avatar_url: avatarUrl || null, avatar_char: avatarChar }}
              size={68}
            />
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <Input
                value={realName}
                onChange={(e) => setRealName(e.target.value)}
                placeholder="真实姓名 · 如 李小明"
                size="large"
                style={{ fontSize: 18, fontWeight: 600 }}
              />
              <p className="m-0 text-[12px] text-[var(--color-muted-fg)]">
                显示名：{displayName}
              </p>
            </div>
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            <FieldRow label="方言称谓">
              <Input
                value={dialectTitle}
                onChange={(e) => setDialectTitle(e.target.value)}
                placeholder='如 "幺爸" "嬢嬢"'
              />
            </FieldRow>

            <FieldRow label="性别">
              <Radio.Group
                value={gender}
                onChange={(e) => setGender(e.target.value)}
                optionType="button"
                buttonStyle="solid"
                options={[
                  { value: 'male', label: '男' },
                  { value: 'female', label: '女' },
                  { value: 'unknown', label: '未知' },
                ]}
              />
            </FieldRow>
          </div>

          <FieldRow label="出生日期">
            <div className="flex flex-col gap-2">
              <BirthDateInput
                year={birthYear}
                month={birthMonth}
                day={birthDay}
                onChange={(y, m, d) => {
                  setBirthYear(y);
                  setBirthMonth(m);
                  setBirthDay(d);
                }}
              />
              {(birthMonth != null && birthDay != null) && (
                <Radio.Group
                  value={birthCalendar}
                  onChange={(e) => setBirthCalendar(e.target.value)}
                  size="small"
                  optionType="button"
                  options={[
                    { value: 'solar', label: '过阳历' },
                    { value: 'lunar', label: '过农历' },
                    { value: 'both', label: '都过' },
                  ]}
                />
              )}
            </div>
          </FieldRow>

          <FieldRow
            label={
              <span className="inline-flex items-center gap-1.5">
                关系档位
                <Popover
                  placement="right"
                  content={
                    <div className="max-w-[260px] text-[12px] leading-relaxed">
                      <div>
                        <b>血亲</b>：同血缘的亲属
                      </div>
                      <div>
                        <b>拟血亲</b>：继父母 / 继子女 / 养父母 / 养子女
                      </div>
                      <div>
                        <b>姻亲</b>：通过婚姻产生的关系
                      </div>
                      <div>
                        <b>社会</b>：朋友 / 同事 / 邻居 / 师长
                      </div>
                    </div>
                  }
                >
                  <QuestionCircleOutlined
                    style={{
                      color: 'var(--color-muted-fg)',
                      cursor: 'pointer',
                    }}
                  />
                </Popover>
              </span>
            }
          >
            <Radio.Group
              value={kinship}
              onChange={(e) => setKinship(e.target.value)}
              optionType="button"
            >
              {KINSHIPS.map((k) => (
                <Radio.Button key={k.key} value={k.key}>
                  <span className="inline-flex items-center gap-1.5">
                    <span
                      className="inline-block h-2 w-2 rounded-full"
                      style={{ background: k.color }}
                    />
                    {k.label}
                  </span>
                </Radio.Button>
              ))}
            </Radio.Group>
          </FieldRow>

          <FieldRow label="头像">
            <AvatarField value={avatarUrl} onChange={setAvatarUrl} />
          </FieldRow>

          <FieldRow label="文字头像">
            <AvatarCharPicker
              source={`${realName}${dialectTitle}`}
              value={avatarChar}
              onChange={handleAvatarCharChange}
              hasUrl={!!avatarUrl.trim()}
            />
          </FieldRow>

          <FieldRow label="备注">
            <TextArea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="任何想记的：性格 / 事件 / 故事"
              rows={3}
              autoSize={{ minRows: 3, maxRows: 6 }}
            />
          </FieldRow>
        </div>
      </Card>

      {/* —— LocationCard —— */}
      {isEdit && idNum && (
        <>
          <AddressesCard personId={idNum} />
          <PhonesCard personId={idNum} />
          <RelationsCard personId={idNum} />
          <EventsCard personId={idNum} />
        </>
      )}

      {/* —— 移动端底部固定保存条 —— */}
      <div
        className="fixed inset-x-0 z-20 px-4 py-3 md:hidden"
        style={{
          bottom: 'calc(4rem + env(safe-area-inset-bottom))',
          background: 'color-mix(in srgb, var(--color-background) 95%, transparent)',
          backdropFilter: 'blur(8px)',
          borderTop: '1px solid var(--color-border)',
        }}
      >
        <div className="flex items-center gap-2">
          <Button onClick={() => navigate('/persons')} style={{ flex: 1 }}>
            返回
          </Button>
          {isEdit && idNum && (
            <Button
              icon={<ShareAltOutlined />}
              onClick={() => setShareOpen(true)}
              aria-label="分享此人"
            />
          )}
          {isEdit && (
            <Button
              danger
              icon={<DeleteOutlined />}
              onClick={confirmDelete}
              aria-label="删除"
            />
          )}
          <Button
            type="primary"
            icon={<SaveOutlined />}
            onClick={handleSave}
            loading={upsertMut.isPending}
            style={{ flex: 1 }}
          >
            {isEdit ? '保存' : '创建'}
          </Button>
        </div>
      </div>

      {isEdit && idNum && (
        <ShareDialog
          open={shareOpen}
          onClose={() => setShareOpen(false)}
          rootPersonId={idNum}
          defaultTitle={`${displayName} 的资料`}
          mode="person"
        />
      )}
    </div>
  );
}

function FieldRow({
  label,
  children,
  description,
}: {
  label: React.ReactNode;
  children: React.ReactNode;
  description?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Form.Item
        label={<span style={{ fontSize: 13 }}>{label}</span>}
        layout="vertical"
        colon={false}
        style={{ marginBottom: 0 }}
      >
        {children}
      </Form.Item>
      {description && (
        <p className="m-0 -mt-1 text-[12px] text-[var(--color-muted-fg)]">
          {description}
        </p>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────
// 头像字段：URL 输入 + 上传按钮 + Ctrl+V 粘贴图片
// ────────────────────────────────────────────────────────

function extractImageFromClipboard(cd: DataTransfer | null): File | null {
  if (!cd) return null;
  // 优先使用 .files（FileList，现代浏览器）
  const files = cd.files;
  if (files && files.length > 0) {
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      if (f.type.startsWith('image/')) return f;
    }
  }
  // 回退使用 .items（DataTransferItemList）
  const items = cd.items;
  if (items) {
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        const f = item.getAsFile();
        if (f) return f;
      }
    }
  }
  return null;
}

function AvatarField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [uploading, setUploading] = useState(false);
  const uploadingRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const settingsQ = useQuery({ queryKey: ['settings'], queryFn: getSettings });
  const s3Ready = !!(
    settingsQ.data?.s3_endpoint &&
    settingsQ.data?.s3_bucket &&
    settingsQ.data?.s3_access_key_id &&
    settingsQ.data?.s3_secret_access_key
  );
  const s3ReadyRef = useRef(s3Ready);
  // eslint-disable-next-line react-hooks/refs
  s3ReadyRef.current = s3Ready;

  const doUpload = async (file: File) => {
    if (!s3ReadyRef.current) {
      toast.error('请先在「设置 → 存储」中完成公共文件存储配置');
      return;
    }
    if (!file.type.startsWith('image/')) {
      toast.error('请选择图片文件');
      return;
    }
    if (uploadingRef.current) return;
    uploadingRef.current = true;
    setUploading(true);
    try {
      const res = await uploadImage(file);
      onChange(res.url);
      toast.success('上传成功');
    } catch (e: unknown) {
      toast.error((e as Error).message);
    } finally {
      uploadingRef.current = false;
      setUploading(false);
    }
  };

  // 文档级 Ctrl/Cmd+V 监听：当焦点不在其他可编辑元素上时，捕获图片粘贴
  useEffect(() => {
    const handler = (e: ClipboardEvent) => {
      if (!s3ReadyRef.current || uploadingRef.current) return;
      // 焦点在其他可编辑元素（包括我们自己之外的 input / textarea / contenteditable）→ 跳过
      const active = document.activeElement as HTMLElement | null;
      const isEditable =
        !!active &&
        (active.tagName === 'INPUT' ||
          active.tagName === 'TEXTAREA' ||
          active.isContentEditable);
      const insideOurField = !!(active && containerRef.current?.contains(active));
      if (isEditable && !insideOurField) return;
      const file = extractImageFromClipboard(e.clipboardData);
      if (file) {
        e.preventDefault();
        void doUpload(file);
      }
    };
    document.addEventListener('paste', handler);
    return () => document.removeEventListener('paste', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleInputPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const file = extractImageFromClipboard(e.clipboardData);
    if (file) {
      e.preventDefault();
      void doUpload(file);
    }
    // 否则保留默认行为：粘贴文本 URL 等
  };

  const handlePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // 允许重复选同一文件
    if (file) void doUpload(file);
  };

  const uploadBtn = (
    <Button
      icon={uploading ? <LoadingOutlined /> : <UploadOutlined />}
      onClick={() => fileInputRef.current?.click()}
      loading={uploading}
      disabled={!s3Ready}
    >
      上传
    </Button>
  );

  return (
    <div ref={containerRef} className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onPaste={handleInputPaste}
          placeholder={
            s3Ready
              ? '粘贴图片链接，或 Ctrl/Cmd+V 直接粘贴图片'
              : '可粘贴图片链接（配置公共文件存储后可直接上传）'
          }
          disabled={uploading}
          allowClear
        />
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={handlePick}
        />
        {s3Ready ? (
          uploadBtn
        ) : (
          <Tooltip title="上传图片需先在「设置 → 存储」配置公共文件存储">
            <span>{uploadBtn}</span>
          </Tooltip>
        )}
      </div>
      {!s3Ready && (
        <p className="m-0 text-[12px] text-[var(--color-muted-fg)]">
          想直接上传或粘贴图片？请先到{' '}
          <a
            onClick={(e) => {
              e.preventDefault();
              window.location.href = '/settings';
            }}
            style={{ color: 'var(--color-accent-strong)', cursor: 'pointer' }}
          >
            设置 → 存储
          </a>{' '}
          完成配置。
        </p>
      )}
    </div>
  );
}

function AvatarCharPicker({
  source,
  value,
  onChange,
  hasUrl,
}: {
  source: string;
  value: string | null;
  onChange: (v: string | null) => void;
  hasUrl: boolean;
}) {
  const chars = Array.from(new Set(Array.from(source).filter((c) => c.trim())));
  return (
    <div className="flex flex-col gap-1.5">
      {chars.length === 0 ? (
        <p className="m-0 text-[12px] text-[var(--color-muted-fg)]">
          先填写姓名或方言称谓，再来这里选一个字。
        </p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {chars.map((c) => {
            const selected = c === value;
            return (
              <button
                key={c}
                type="button"
                onClick={() => onChange(selected ? null : c)}
                className="grid place-items-center"
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 6,
                  border: `1px solid ${selected ? 'var(--color-accent-strong)' : 'var(--color-border)'}`,
                  background: selected ? 'var(--color-accent-soft)' : 'transparent',
                  color: selected ? 'var(--color-accent-strong)' : 'var(--color-foreground)',
                  fontSize: 16,
                  fontWeight: 600,
                  cursor: 'pointer',
                  padding: 0,
                }}
              >
                {c}
              </button>
            );
          })}
          {value && (
            <button
              type="button"
              onClick={() => onChange(null)}
              className="text-[12px]"
              style={{
                padding: '0 8px',
                height: 32,
                borderRadius: 6,
                border: '1px solid var(--color-border)',
                background: 'transparent',
                color: 'var(--color-muted-fg)',
                cursor: 'pointer',
              }}
            >
              清除
            </button>
          )}
        </div>
      )}
      {hasUrl && value && (
        <p className="m-0 text-[12px] text-[var(--color-muted-fg)]">
          已上传头像图片，文字头像仅在图片移除后生效。
        </p>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────
// 电话子卡
// ────────────────────────────────────────────────────────

function PhonesCard({ personId }: { personId: number }) {
  const qc = useQueryClient();
  const phonesQ = useQuery({
    queryKey: ['phones', personId],
    queryFn: () => listPhones(personId),
  });

  const [newPhone, setNewPhone] = useState('');
  const [newNote, setNewNote] = useState('');

  const addMut = useMutation({
    mutationFn: createPhone,
    onSuccess: () => {
      toast.success('已添加电话');
      qc.invalidateQueries({ queryKey: ['phones', personId] });
      setNewPhone('');
      setNewNote('');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delMut = useMutation({
    mutationFn: deletePhone,
    onSuccess: () => {
      toast.success('已删除');
      qc.invalidateQueries({ queryKey: ['phones', personId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const phones = phonesQ.data ?? [];

  return (
    <Card
      title="电话号码"
      extra={
        <span className="text-[12px] text-[var(--color-muted-fg)]">
          多个号码可分别加备注
        </span>
      }
      style={{ border: '1px solid var(--color-border)', borderRadius: 10 }}
    >
      <div className="flex flex-col gap-3">
        {phones.length === 0 ? (
          <p className="m-0 text-[13px] text-[var(--color-muted-fg)]">暂无</p>
        ) : (
          <div className="flex flex-col gap-2">
            {phones.map((p) => (
              <PhoneRow
                key={p.id}
                phone={p}
                onSaved={() =>
                  qc.invalidateQueries({ queryKey: ['phones', personId] })
                }
                onDelete={() => delMut.mutate(p.id)}
              />
            ))}
          </div>
        )}

        <Divider style={{ margin: '4px 0' }} />

        <div>
          <div className="mb-2 text-[13px] font-medium">添加电话</div>
          <div className="flex flex-wrap items-end gap-2">
            <div className="w-full md:w-52">
              <Input
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
                placeholder="号码 · 如 13800138000"
                inputMode="tel"
                style={{ fontFamily: 'monospace' }}
              />
            </div>
            <div className="min-w-[160px] flex-1">
              <Input
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                placeholder="备注 · 工作 / 家里座机 / 媳妇号"
              />
            </div>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() =>
                addMut.mutate({
                  person_id: personId,
                  phone: newPhone.trim(),
                  note: newNote.trim() || null,
                })
              }
              disabled={addMut.isPending || !newPhone.trim()}
            >
              添加
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}

function PhoneRow({
  phone,
  onSaved,
  onDelete,
}: {
  phone: Phone;
  onSaved: () => void;
  onDelete: () => void;
}) {
  const [num, setNum] = useState(phone.phone);
  const [note, setNote] = useState(phone.note ?? '');

  useEffect(() => {
    setNum(phone.phone);
    setNote(phone.note ?? '');
  }, [phone.id, phone.phone, phone.note]);

  const dirty = useMemo(
    () => num.trim() !== phone.phone || note.trim() !== (phone.note ?? ''),
    [num, note, phone.phone, phone.note]
  );

  const saveMut = useMutation({
    mutationFn: () =>
      updatePhone(phone.id, { phone: num.trim(), note: note.trim() || null }),
    onSuccess: () => {
      toast.success('已保存');
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const confirmDelete = () => {
    getModal()?.confirm({
      title: '删除该电话？',
      okText: '确认删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: onDelete,
    });
  };

  return (
    <div
      className="flex flex-wrap items-center gap-2 px-3 py-2"
      style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 8,
      }}
    >
      <Input
        value={num}
        onChange={(e) => setNum(e.target.value)}
        placeholder="号码"
        inputMode="tel"
        style={{ width: 176, fontFamily: 'monospace' }}
      />
      <Input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="备注"
        style={{ minWidth: 160, flex: 1 }}
      />
      <Button
        type="primary"
        size="small"
        icon={<CheckOutlined />}
        disabled={!dirty || !num.trim() || saveMut.isPending}
        onClick={() => saveMut.mutate()}
      >
        保存
      </Button>
      <Button
        size="small"
        type="text"
        danger
        icon={<DeleteOutlined />}
        onClick={confirmDelete}
        aria-label="删除"
      />
    </div>
  );
}

// ────────────────────────────────────────────────────────
// 关系子卡（父母 / 子女 / 配偶 / 社会）
// ────────────────────────────────────────────────────────

type RelTab = 'parents' | 'children' | 'spouse' | 'social';

function RelationsCard({ personId }: { personId: number }) {
  const qc = useQueryClient();
  const socialRelations = useSocialRelations();
  const relationLabelOf = useRelationLabel();
  const allPersonsQ = useQuery({
    queryKey: ['persons'],
    queryFn: () => listPersons(),
  });
  const fromQ = useQuery({
    queryKey: ['relations', { from: personId }],
    queryFn: () => listRelations({ from: personId }),
  });
  const toQ = useQuery({
    queryKey: ['relations', { to: personId }],
    queryFn: () => listRelations({ to: personId }),
  });
  // 全部关系：用来推导"配偶推导父母"（与家族树展示口径一致）
  const allRelationsQ = useQuery({
    queryKey: ['relations', 'all'],
    queryFn: () => listRelations(),
  });

  const personById = useMemo(
    () => new Map((allPersonsQ.data ?? []).map((p) => [p.id, p])),
    [allPersonsQ.data]
  );
  const personLabel = (id: number): string => {
    const p = personById.get(id);
    if (!p) return `#${id}`;
    return (
      p.real_name ||
      p.dialect_title ||
      p.standard_title ||
      p.nickname ||
      `#${id}`
    );
  };

  const fromRows = useMemo(() => fromQ.data ?? [], [fromQ.data]);
  const toRows = useMemo(() => toQ.data ?? [], [toQ.data]);

  const childRows = useMemo(
    () =>
      fromRows
        .filter((r) => r.relation_type === 'parent')
        .slice()
        .sort((a, b) => {
          const ao = a.birth_order ?? Number.MAX_SAFE_INTEGER;
          const bo = b.birth_order ?? Number.MAX_SAFE_INTEGER;
          if (ao !== bo) return ao - bo;
          return a.id - b.id;
        }),
    [fromRows]
  );
  const parentRows = useMemo(
    () => toRows.filter((r) => r.relation_type === 'parent'),
    [toRows]
  );

  // 由"显式父母的配偶"推导出来的隐式父母（与家族树视图口径一致，只读）
  const inferredParentIds = useMemo(() => {
    if (!allRelationsQ.data) return [] as number[];
    const explicitParents = new Set(parentRows.map((r) => r.from_person_id));
    if (explicitParents.size === 0) return [];
    const inferred = new Set<number>();
    for (const r of allRelationsQ.data) {
      if (r.relation_type !== 'spouse') continue;
      const { from_person_id: a, to_person_id: b } = r;
      if (explicitParents.has(a) && !explicitParents.has(b)) inferred.add(b);
      if (explicitParents.has(b) && !explicitParents.has(a)) inferred.add(a);
    }
    // 不要把当前人自己列为父母
    inferred.delete(personId);
    return Array.from(inferred);
  }, [allRelationsQ.data, parentRows, personId]);

  const spouseRows = useMemo(() => {
    const seen = new Set<number>();
    const acc: Array<{ row: Relation; otherId: number }> = [];
    for (const r of fromRows) {
      if (r.relation_type !== 'spouse') continue;
      if (seen.has(r.to_person_id)) continue;
      seen.add(r.to_person_id);
      acc.push({ row: r, otherId: r.to_person_id });
    }
    for (const r of toRows) {
      if (r.relation_type !== 'spouse') continue;
      if (seen.has(r.from_person_id)) continue;
      seen.add(r.from_person_id);
      acc.push({ row: r, otherId: r.from_person_id });
    }
    return acc;
  }, [fromRows, toRows]);

  const socialRows = useMemo(() => {
    const acc: Array<{
      row: Relation;
      otherId: number;
      perspective: 'from' | 'to';
    }> = [];
    for (const r of fromRows) {
      if (r.relation_type === 'parent' || r.relation_type === 'spouse')
        continue;
      acc.push({ row: r, otherId: r.to_person_id, perspective: 'from' });
    }
    for (const r of toRows) {
      if (r.relation_type === 'parent' || r.relation_type === 'spouse')
        continue;
      acc.push({ row: r, otherId: r.from_person_id, perspective: 'to' });
    }
    return acc;
  }, [fromRows, toRows]);

  const addMut = useMutation({
    mutationFn: createRelation,
    onSuccess: () => {
      toast.success('已添加关系');
      qc.invalidateQueries({ queryKey: ['relations'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const delMut = useMutation({
    mutationFn: deleteRelation,
    onSuccess: () => {
      toast.success('已删除关系');
      qc.invalidateQueries({ queryKey: ['relations'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const patchMut = useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: number;
      input: { birth_order?: number | null; description?: string | null };
    }) => updateRelation(id, input),
    onSuccess: () => {
      toast.success('已更新');
      qc.invalidateQueries({ queryKey: ['relations'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [tab, setTab] = useState<RelTab>('children');
  const [addOtherId, setAddOtherId] = useState<number | undefined>();
  const [addBirthOrder, setAddBirthOrder] = useState<number | null>(null);
  const [addSocialType, setAddSocialType] = useState<string>('friend');
  const [addDesc, setAddDesc] = useState('');
  const [quickAddRelOpen, setQuickAddRelOpen] = useState(false);

  useEffect(() => {
    if (tab === 'children') {
      setAddBirthOrder(childRows.length + 1);
    } else {
      setAddBirthOrder(null);
    }
    setAddOtherId(undefined);
    setAddDesc('');
  }, [tab, childRows.length]);

  const handleAdd = () => {
    if (!addOtherId) return;
    if (tab === 'children') {
      addMut.mutate({
        from_person_id: personId,
        to_person_id: addOtherId,
        relation_type: 'parent',
        birth_order: addBirthOrder ?? null,
        description: addDesc || null,
      });
    } else if (tab === 'spouse') {
      addMut.mutate({
        from_person_id: personId,
        to_person_id: addOtherId,
        relation_type: 'spouse',
        description: addDesc || null,
      });
    } else if (tab === 'social') {
      addMut.mutate({
        from_person_id: personId,
        to_person_id: addOtherId,
        relation_type: addSocialType,
        description: addDesc || null,
      });
    }
    setAddOtherId(undefined);
    setAddDesc('');
  };

  const renderTabLabel = (label: string, count: number) => (
    <span className="inline-flex items-center gap-1.5">
      {label}
      <Badge
        count={count}
        color={count > 0 ? 'var(--color-accent-strong)' : undefined}
        showZero
        style={{
          background: count > 0 ? undefined : 'var(--color-hairline)',
          color: count > 0 ? '#fff' : 'var(--color-muted-fg)',
          fontSize: 11,
          padding: '0 6px',
        }}
      />
    </span>
  );

  return (
    <Card
      title="关系"
      style={{ border: '1px solid var(--color-border)', borderRadius: 10 }}
    >
      <div className="flex flex-col gap-4">
        <FamilyRootToggle
          personId={personId}
          personName={
            personById.get(personId)
              ? personLabel(personId)
              : `#${personId}`
          }
        />

        <Tabs
          activeKey={tab}
          onChange={(k) => setTab(k as RelTab)}
          items={[
            {
              key: 'parents',
              label: renderTabLabel(
                '父母',
                parentRows.length + inferredParentIds.length
              ),
              children: (
                <div className="flex flex-col gap-2">
                  {parentRows.length === 0 && inferredParentIds.length === 0 ? (
                    <EmptyRel hint='父母只读：要给当前人添加父辈，请进入父辈的人物页面"添加子女"。' />
                  ) : (
                    <>
                      {parentRows.map((r) => {
                        const parent = personById.get(r.from_person_id);
                        return (
                          <RelationLine
                            key={r.id}
                            kind="parent"
                            tagText={
                              parent?.gender === 'female'
                                ? '母亲'
                                : parent?.gender === 'male'
                                  ? '父亲'
                                  : '父母'
                            }
                            personName={personLabel(r.from_person_id)}
                            description={null}
                            onDelete={() => delMut.mutate(r.id)}
                          />
                        );
                      })}
                      {inferredParentIds.map((pid) => {
                        const p = personById.get(pid);
                        const tag =
                          p?.gender === 'female'
                            ? '母亲'
                            : p?.gender === 'male'
                              ? '父亲'
                              : '父母';
                        return (
                          <RelationLine
                            key={`inferred-${pid}`}
                            kind="parent"
                            tagText={tag}
                            personName={personLabel(pid)}
                            description={null}
                          />
                        );
                      })}
                    </>
                  )}
                </div>
              ),
            },
            {
              key: 'children',
              label: renderTabLabel('子女', childRows.length),
              children: (
                <div className="flex flex-col gap-2">
                  {childRows.length === 0 ? (
                    <EmptyRel />
                  ) : (
                    childRows.map((r) => {
                      const child = personById.get(r.to_person_id);
                      const orderText = birthOrderLabel(
                        r.birth_order,
                        child?.gender ?? 'unknown'
                      );
                      return (
                        <ChildRow
                          key={r.id}
                          row={r}
                          tag={
                            orderText ??
                            (child?.gender === 'female'
                              ? '女儿'
                              : child?.gender === 'male'
                                ? '儿子'
                                : '子女')
                          }
                          personName={personLabel(r.to_person_id)}
                          onChangeOrder={(v) =>
                            patchMut.mutate({
                              id: r.id,
                              input: { birth_order: v },
                            })
                          }
                          onChangeDesc={(v) =>
                            patchMut.mutate({
                              id: r.id,
                              input: { description: v || null },
                            })
                          }
                          onDelete={() => delMut.mutate(r.id)}
                        />
                      );
                    })
                  )}
                </div>
              ),
            },
            {
              key: 'spouse',
              label: renderTabLabel('配偶', spouseRows.length),
              children: (
                <div className="flex flex-col gap-2">
                  {spouseRows.length === 0 ? (
                    <EmptyRel />
                  ) : (
                    spouseRows.map((s) => (
                      <RelationLine
                        key={s.row.id}
                        kind="spouse"
                        tagText="配偶"
                        personName={personLabel(s.otherId)}
                        description={s.row.description}
                        onDelete={() => delMut.mutate(s.row.id)}
                      />
                    ))
                  )}
                </div>
              ),
            },
            {
              key: 'social',
              label: renderTabLabel('社会', socialRows.length),
              children: (
                <div className="flex flex-col gap-2">
                  {socialRows.length === 0 ? (
                    <EmptyRel />
                  ) : (
                    socialRows.map((s) => (
                      <RelationLine
                        key={`${s.perspective}-${s.row.id}`}
                        kind="social"
                        tagText={relationLabelOf(s.row.relation_type)}
                        personName={personLabel(s.otherId)}
                        description={s.row.description}
                        onDelete={() => delMut.mutate(s.row.id)}
                      />
                    ))
                  )}
                </div>
              ),
            },
          ]}
        />

        {tab !== 'parents' && (
          <>
            <Divider style={{ margin: '4px 0' }} />
            <div className="flex flex-col gap-3">
              <div className="text-[13px] font-medium">
                添加
                {tab === 'children'
                  ? '子女'
                  : tab === 'spouse'
                    ? '配偶'
                    : '社会关系'}
              </div>
              <div className="flex flex-wrap items-end gap-2">
                <PersonSelect
                  persons={(allPersonsQ.data ?? []).filter(
                    (p) => p.id !== personId
                  )}
                  value={addOtherId}
                  onChange={setAddOtherId}
                  placeholder="选择人物"
                />

                {tab === 'children' && (
                  <InputNumber
                    value={addBirthOrder}
                    onChange={(v) => {
                      const n = v == null ? null : Number(v);
                      setAddBirthOrder(
                        n !== null && Number.isFinite(n) && n > 0 ? n : null
                      );
                    }}
                    min={1}
                    max={50}
                    placeholder="排行"
                    style={{ width: 112 }}
                    controls={false}
                  />
                )}

                {tab === 'social' && (
                  <Select
                    value={addSocialType}
                    onChange={setAddSocialType}
                    style={{ width: 160 }}
                    options={socialRelations.map((t) => ({
                      value: t.key,
                      label: t.label,
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
                            onClick={() => setQuickAddRelOpen(true)}
                          >
                            新增关系类型
                          </Button>
                        </div>
                      </>
                    )}
                  />
                )}

                <div className="min-w-[140px] flex-1">
                  <Input
                    value={addDesc}
                    onChange={(e) => setAddDesc(e.target.value)}
                    placeholder="备注 · 选填"
                  />
                </div>

                <Button
                  type="primary"
                  icon={<PlusOutlined />}
                  onClick={handleAdd}
                  disabled={!addOtherId || addMut.isPending}
                >
                  添加
                </Button>
              </div>
            </div>
          </>
        )}
      </div>

      <TaxonomyEditModal
        open={quickAddRelOpen}
        domain="social_relation"
        taxonomy={null}
        onClose={() => setQuickAddRelOpen(false)}
        onSaved={(t: Taxonomy) => {
          qc.invalidateQueries({ queryKey: ['taxonomies', 'social_relation'] });
          qc.invalidateQueries({
            queryKey: ['taxonomies', 'social_relation', 'all'],
          });
          setAddSocialType(t.key);
        }}
      />
    </Card>
  );
}

function EmptyRel({ hint }: { hint?: string }) {
  return (
    <div
      className="px-4 py-6 text-center text-[13px] text-[var(--color-muted-fg)]"
      style={{
        background: 'var(--color-surface)',
        border: '1px dashed var(--color-border)',
        borderRadius: 8,
      }}
    >
      {hint ?? '暂无'}
    </div>
  );
}

function RelationLine({
  kind,
  tagText,
  personName,
  description,
  onDelete,
}: {
  kind: 'parent' | 'spouse' | 'social';
  tagText: string;
  personName: string;
  description: string | null;
  onDelete?: () => void;
}) {
  const tagStyle: React.CSSProperties =
    kind === 'parent'
      ? {
          color: 'var(--color-kin-blood)',
          background: 'var(--color-kin-blood-soft)',
        }
      : kind === 'spouse'
        ? {
            color: 'var(--color-kin-in-law)',
            background: 'var(--color-kin-in-law-soft)',
          }
        : {
            color: 'var(--color-kin-social)',
            background: 'var(--color-kin-social-soft)',
          };

  const confirmDelete = () => {
    if (!onDelete) return;
    getModal()?.confirm({
      title: '删除关系？',
      okText: '确认删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: onDelete,
    });
  };

  return (
    <div
      className="flex flex-wrap items-center gap-2 px-3 py-2"
      style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 8,
      }}
    >
      <span
        className="inline-flex items-center rounded px-2 py-0.5 text-[12px] font-medium"
        style={tagStyle}
      >
        {tagText}
      </span>
      <span className="font-medium text-[var(--color-foreground)]">
        {personName}
      </span>
      {description && (
        <span className="text-[13px] text-[var(--color-muted-fg)]">
          （{description}）
        </span>
      )}
      {onDelete && (
        <div className="ml-auto">
          <Button
            size="small"
            type="text"
            danger
            icon={<DeleteOutlined />}
            onClick={confirmDelete}
            aria-label="删除关系"
          />
        </div>
      )}
    </div>
  );
}

function ChildRow({
  row,
  tag,
  personName,
  onChangeOrder,
  onChangeDesc,
  onDelete,
}: {
  row: Relation;
  tag: string;
  personName: string;
  onChangeOrder: (v: number | null) => void;
  onChangeDesc: (v: string) => void;
  onDelete: () => void;
}) {
  const [order, setOrder] = useState<number | null>(row.birth_order);
  const [desc, setDesc] = useState(row.description ?? '');

  useEffect(() => {
    setOrder(row.birth_order);
    setDesc(row.description ?? '');
  }, [row.birth_order, row.description]);

  const orderDirty = order !== row.birth_order;
  const descDirty = desc !== (row.description ?? '');

  const confirmDelete = () => {
    getModal()?.confirm({
      title: '删除该子女关系？',
      okText: '确认删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: onDelete,
    });
  };

  return (
    <div
      className="flex flex-wrap items-center gap-2 px-3 py-2"
      style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 8,
      }}
    >
      <span
        className="inline-flex items-center rounded px-2 py-0.5 text-[12px] font-medium"
        style={{
          color: 'var(--color-kin-blood)',
          background: 'var(--color-kin-blood-soft)',
        }}
      >
        {tag}
      </span>
      <span className="font-medium text-[var(--color-foreground)]">
        {personName}
      </span>
      <InputNumber
        value={order}
        onChange={(v) => {
          const n = v == null ? null : Number(v);
          setOrder(n !== null && Number.isFinite(n) && n > 0 ? n : null);
        }}
        min={1}
        max={50}
        placeholder="排行"
        size="small"
        style={{ width: 80 }}
        controls={false}
      />
      <Button
        size="small"
        type="text"
        disabled={!orderDirty}
        onClick={() => onChangeOrder(order)}
      >
        保存排行
      </Button>
      <Input
        value={desc}
        onChange={(e) => setDesc(e.target.value)}
        placeholder="备注"
        size="small"
        style={{ minWidth: 120, flex: 1 }}
      />
      <Button
        size="small"
        type="text"
        disabled={!descDirty}
        onClick={() => onChangeDesc(desc)}
      >
        保存备注
      </Button>
      <Button
        size="small"
        type="text"
        danger
        icon={<DeleteOutlined />}
        onClick={confirmDelete}
        aria-label="删除关系"
      />
    </div>
  );
}

// ────────────────────────────────────────────────────────
// 可搜索人物选择器（AntD Select 自带筛选）
// ────────────────────────────────────────────────────────

function PersonSelect({
  persons,
  value,
  onChange,
  placeholder = '选择人物',
}: {
  persons: Person[];
  value: number | undefined;
  onChange: (id: number | undefined) => void;
  placeholder?: string;
}) {
  const options = persons.map((p) => {
    const lbl =
      p.real_name ||
      p.dialect_title ||
      p.standard_title ||
      p.nickname ||
      `#${p.id}`;
    const sub =
      p.real_name && (p.dialect_title || p.standard_title)
        ? p.dialect_title || p.standard_title
        : null;
    const searchKey = [
      p.real_name,
      p.dialect_title,
      p.standard_title,
      p.nickname,
    ]
      .filter(Boolean)
      .join(' ');
    return {
      value: p.id,
      label: (
        <div className="flex items-center gap-2">
          <PersonAvatar person={p} size={24} />
          <span className="flex-1 truncate">
            <span className="font-medium text-[var(--color-foreground)]">
              {lbl}
            </span>
            {sub && (
              <span className="ml-1 text-[11px] text-[var(--color-muted-fg)]">
                · {sub}
              </span>
            )}
          </span>
        </div>
      ),
      // AntD Select 用 label 做筛选时只支持字符串；用 optionFilterProp + 自定义 prop 替代
      searchKey,
    };
  });

  return (
    <Select
      value={value}
      onChange={(v) => onChange(v ?? undefined)}
      showSearch
      placeholder={placeholder}
      style={{ minWidth: 220 }}
      allowClear
      options={options}
      optionFilterProp="searchKey"
      filterOption={(input, option) => {
        const sk = (option as unknown as { searchKey?: string })?.searchKey;
        if (!sk) return false;
        return sk.toLowerCase().includes(input.toLowerCase());
      }}
      suffixIcon={<SearchOutlined />}
    />
  );
}

// ────────────────────────────────────────────────────────
// 家族树根开关
// ────────────────────────────────────────────────────────

function FamilyRootToggle({
  personId,
  personName,
}: {
  personId: number;
  personName: string;
}) {
  const qc = useQueryClient();
  const settingsQ = useQuery({ queryKey: ['settings'], queryFn: getSettings });
  const roots = settingsQ.data?.family_roots ?? [];
  const checked = roots.includes(personId);

  const mut = useMutation({
    mutationFn: setFamilyRoots,
    onSuccess: (_d, next) => {
      toast.success(
        next.includes(personId) ? '已设为家族树根' : '已取消家族树根'
      );
      qc.invalidateQueries({ queryKey: ['settings'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggle = (v: boolean) => {
    const cur = settingsQ.data?.family_roots ?? [];
    if (v && !cur.includes(personId)) mut.mutate([...cur, personId]);
    else if (!v && cur.includes(personId))
      mut.mutate(cur.filter((x) => x !== personId));
  };

  return (
    <div
      className="flex items-center gap-3 px-4 py-3"
      style={{
        border: `1px solid ${checked ? 'var(--color-accent-strong)' : 'var(--color-border)'}`,
        background: checked ? 'var(--color-accent-soft)' : 'var(--color-surface)',
        borderRadius: 8,
        transition: 'background 0.18s, border-color 0.18s',
      }}
    >
      <div
        className="grid h-9 w-9 place-items-center rounded-md"
        style={{
          background: checked ? '#ffffff' : 'var(--color-hairline)',
          color: checked
            ? 'var(--color-accent-strong)'
            : 'var(--color-muted-fg)',
        }}
      >
        <PartitionOutlined />
      </div>
      <div className="flex flex-1 flex-col">
        <div className="text-[14px] font-medium">家族树根</div>
        <p className="m-0 text-[12px] text-[var(--color-muted-fg)]">
          勾上后会在「家族」页生成一棵以 {personName} 为顶点的独立家族树
        </p>
      </div>
      <Tooltip title={checked ? '取消家族树根' : '设为家族树根'}>
        <Switch
          checked={checked}
          onChange={toggle}
          loading={mut.isPending || settingsQ.isLoading}
        />
      </Tooltip>
    </div>
  );
}

// ────────────────────────────────────────────────────────
// 地址子卡：一人多地址，每个地址带可选标签 + 坐标
// ────────────────────────────────────────────────────────

function AddressesCard({ personId }: { personId: number }) {
  const qc = useQueryClient();
  const addrQ = useQuery({
    queryKey: ['addresses', personId],
    queryFn: () => listAddresses(personId),
  });

  const [adding, setAdding] = useState(false);
  const [draftLabel, setDraftLabel] = useState('');
  const [draftAddress, setDraftAddress] = useState('');
  const [draftLng, setDraftLng] = useState<number | null>(null);
  const [draftLat, setDraftLat] = useState<number | null>(null);
  const [draftPicking, setDraftPicking] = useState(false);

  const resetDraft = () => {
    setDraftLabel('');
    setDraftAddress('');
    setDraftLng(null);
    setDraftLat(null);
    setDraftPicking(false);
    setAdding(false);
  };

  const addMut = useMutation({
    mutationFn: createAddress,
    onSuccess: () => {
      toast.success('已添加地址');
      qc.invalidateQueries({ queryKey: ['addresses', personId] });
      resetDraft();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delMut = useMutation({
    mutationFn: deleteAddress,
    onSuccess: () => {
      toast.success('已删除');
      qc.invalidateQueries({ queryKey: ['addresses', personId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const items = addrQ.data ?? [];

  const confirmDelete = (id: number) => {
    getModal()?.confirm({
      title: '删除该地址？',
      okText: '确认删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: () => delMut.mutate(id),
    });
  };

  return (
    <Card
      title="地址"
      extra={
        <span className="text-[12px] text-[var(--color-muted-fg)]">
          支持多个地址，可加标签如「老家」「单位」
        </span>
      }
      style={{ border: '1px solid var(--color-border)', borderRadius: 10 }}
    >
      <div className="flex flex-col gap-3">
        {items.length === 0 && !adding ? (
          <p className="m-0 text-[13px] text-[var(--color-muted-fg)]">暂无</p>
        ) : (
          <div className="flex flex-col gap-3">
            {items.map((a) => (
              <AddressRow
                key={a.id}
                address={a}
                onSaved={() =>
                  qc.invalidateQueries({ queryKey: ['addresses', personId] })
                }
                onDelete={() => confirmDelete(a.id)}
              />
            ))}
          </div>
        )}

        {adding ? (
          <>
            <Divider style={{ margin: '4px 0' }} />
            <div
              className="flex flex-col gap-3 px-3 py-3"
              style={{
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                borderRadius: 8,
              }}
            >
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  value={draftLabel}
                  onChange={(e) => setDraftLabel(e.target.value)}
                  placeholder="标签 · 老家 / 单位 / 现住址"
                  style={{ width: 200 }}
                />
                <Input
                  value={draftAddress}
                  onChange={(e) => setDraftAddress(e.target.value)}
                  placeholder="地址 · 选点后会自动填入，可手动微调"
                  disabled={draftPicking}
                  style={{ minWidth: 240, flex: 1 }}
                />
              </div>
              <AMapPicker
                longitude={draftLng}
                latitude={draftLat}
                onChange={(lng, lat, addr) => {
                  setDraftLng(lng);
                  setDraftLat(lat);
                  if (addr) setDraftAddress(addr);
                  setDraftPicking(false);
                }}
                onPickingChange={setDraftPicking}
              />
              {(draftLng !== null || draftLat !== null) && (
                <span className="text-[12px] text-[var(--color-muted-fg)]">
                  坐标：{draftLng?.toFixed(6)}, {draftLat?.toFixed(6)}
                </span>
              )}
              <div className="flex items-center gap-2">
                <Button
                  type="primary"
                  icon={<PlusOutlined />}
                  loading={addMut.isPending}
                  disabled={!draftAddress.trim()}
                  onClick={() =>
                    addMut.mutate({
                      person_id: personId,
                      address: draftAddress.trim(),
                      longitude: draftLng,
                      latitude: draftLat,
                      label: draftLabel.trim() || null,
                    })
                  }
                >
                  保存地址
                </Button>
                <Button onClick={resetDraft}>取消</Button>
              </div>
            </div>
          </>
        ) : (
          <Button
            type="dashed"
            icon={<PlusOutlined />}
            onClick={() => setAdding(true)}
            block
          >
            添加地址
          </Button>
        )}
      </div>
    </Card>
  );
}

function AddressRow({
  address,
  onSaved,
  onDelete,
}: {
  address: Address;
  onSaved: () => void;
  onDelete: () => void;
}) {
  const [label, setLabel] = useState(address.label ?? '');
  const [addr, setAddr] = useState(address.address);
  const [lng, setLng] = useState<number | null>(address.longitude);
  const [lat, setLat] = useState<number | null>(address.latitude);
  const [picking, setPicking] = useState(false);

  useEffect(() => {
    setLabel(address.label ?? '');
    setAddr(address.address);
    setLng(address.longitude);
    setLat(address.latitude);
  }, [address.id, address.label, address.address, address.longitude, address.latitude]);

  const dirty = useMemo(
    () =>
      label.trim() !== (address.label ?? '') ||
      addr.trim() !== address.address ||
      lng !== address.longitude ||
      lat !== address.latitude,
    [label, addr, lng, lat, address.label, address.address, address.longitude, address.latitude]
  );

  const saveMut = useMutation({
    mutationFn: () =>
      updateAddress(address.id, {
        address: addr.trim(),
        longitude: lng,
        latitude: lat,
        label: label.trim() || null,
      }),
    onSuccess: () => {
      toast.success('已保存');
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div
      className="flex flex-col gap-2 px-3 py-3"
      style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 8,
      }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="标签 · 老家"
          style={{ width: 160 }}
        />
        <Input
          value={addr}
          onChange={(e) => setAddr(e.target.value)}
          placeholder="地址"
          disabled={picking}
          style={{ minWidth: 240, flex: 1 }}
        />
        <Button
          type="primary"
          size="small"
          icon={<CheckOutlined />}
          disabled={!dirty || !addr.trim() || saveMut.isPending}
          onClick={() => saveMut.mutate()}
        >
          保存
        </Button>
        <Button
          size="small"
          type="text"
          danger
          icon={<DeleteOutlined />}
          onClick={onDelete}
          aria-label="删除"
        />
      </div>
      <AMapPicker
        longitude={lng}
        latitude={lat}
        onChange={(newLng, newLat, newAddr) => {
          setLng(newLng);
          setLat(newLat);
          if (newAddr) setAddr(newAddr);
          setPicking(false);
        }}
        onPickingChange={setPicking}
      />
      {(lng !== null || lat !== null) && (
        <span className="text-[12px] text-[var(--color-muted-fg)]">
          坐标：{lng?.toFixed(6)}, {lat?.toFixed(6)}
        </span>
      )}
    </div>
  );
}
