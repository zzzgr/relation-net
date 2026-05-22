import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AppstoreOutlined,
  ArrowDownOutlined,
  ArrowUpOutlined,
  CalendarOutlined,
  CloudDownloadOutlined,
  CloudSyncOutlined,
  CloudUploadOutlined,
  CopyOutlined,
  DatabaseOutlined,
  DeleteOutlined,
  EditOutlined,
  EnvironmentOutlined,
  EyeInvisibleOutlined,
  EyeOutlined,
  ImportOutlined,
  LinkOutlined,
  LockOutlined,
  PlusOutlined,
  RestOutlined,
  SaveOutlined,
  ShareAltOutlined,
  StopOutlined,
  UndoOutlined,
} from '@ant-design/icons';
import {
  Badge,
  Button,
  Card,
  Checkbox,
  Divider,
  Dropdown,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Segmented,
  Select,
  Switch,
  Table,
  Tabs,
  Tag,
  Tooltip,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useEffect, useMemo, useRef, useState } from 'react';
import { changePassword } from '@/api/auth';
import {
  BACKUP_TABLE_LABELS,
  type BackupPayload,
  type BackupTable,
  deleteOssBackup,
  downloadBackup,
  downloadOssBackup,
  listOssBackups,
  type OssBackupItem,
  parseBackupFile,
  restoreBackup,
  restoreFromOss,
  triggerAutoBackup,
} from '@/api/backup';
import { listPersons, purgePerson, restorePerson } from '@/api/persons';
import {
  getSettings,
  testAmap,
  testS3,
  testS3Backup,
  updateSettings,
  type TestResult,
} from '@/api/settings';
import {
  ALL_VISIBLE_FIELDS,
  VISIBLE_FIELD_LABEL,
  deleteShare,
  listShares,
  parseShareVisibleFields,
  updateShare,
  type Share,
  type VisibleField,
} from '@/api/shares';
import {
  hideTaxonomy,
  listTaxonomies,
  purgeTaxonomy,
  showTaxonomy,
  updateTaxonomy,
} from '@/api/taxonomies';
import { TaxonomyEditModal } from '@/components/TaxonomyEditModal';
import { setAMapConfig } from '@/lib/amap';
import { iconFromName } from '@/lib/icon-picker';
import { toast, getModal } from '@/lib/message';
import { DEFAULT_S3_PATH_TEMPLATE, substitutePath } from '@/lib/pathTemplate';
import { kinshipLabel } from '@/lib/relations';
import {
  buildShareUrl,
} from '@/lib/share-password';
import type { Kinship } from '@/lib/relations';
import type { Person, Taxonomy, TaxonomyDomain } from '@/types';

interface PwFormValues {
  current: string;
  next: string;
  confirm: string;
}

interface AmapFormValues {
  amap_key: string;
  amap_security_code: string;
}

const SETTINGS_TAB_KEYS = [
  'account',
  'shares',
  'taxonomies',
  'amap',
  's3',
  'backup',
  'trash',
] as const;
type SettingsTabKey = (typeof SETTINGS_TAB_KEYS)[number];
const SETTINGS_TAB_KEY_SET = new Set<string>(SETTINGS_TAB_KEYS);
const SETTINGS_TAB_STORAGE_KEY = 'settings.active-tab';

function readSettingsTab(): SettingsTabKey {
  if (typeof window === 'undefined') return 'account';
  // 1) URL hash 优先：F5 刷新 + 可分享链接
  const h = window.location.hash.replace(/^#/, '');
  if (SETTINGS_TAB_KEY_SET.has(h)) return h as SettingsTabKey;
  // 2) localStorage 兜底：从其他页跳回 /settings（菜单 Link 不带 hash）
  try {
    const stored = localStorage.getItem(SETTINGS_TAB_STORAGE_KEY);
    if (stored && SETTINGS_TAB_KEY_SET.has(stored)) {
      return stored as SettingsTabKey;
    }
  } catch {
    // ignore
  }
  return 'account';
}

export default function SettingsPage() {
  // 桌面（≥768px）左侧 tab；窄屏顶部 tab
  const [isWide, setIsWide] = useState(() =>
    typeof window !== 'undefined'
      ? window.matchMedia('(min-width: 768px)').matches
      : true
  );
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(min-width: 768px)');
    const fn = (e: MediaQueryListEvent) => setIsWide(e.matches);
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, []);

  // 当前选中的 tab 持久化到 URL hash + localStorage
  const [activeKey, setActiveKey] = useState<SettingsTabKey>(readSettingsTab);

  // 初次挂载：如果 URL 没有 hash 但 localStorage 有，把 hash 同步回来，
  // 这样 URL 始终反映当前 tab，刷新 + 分享都正确。
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const cur = window.location.hash.replace(/^#/, '');
    if (cur !== activeKey) {
      const url = `${window.location.pathname}${window.location.search}#${activeKey}`;
      window.history.replaceState(null, '', url);
    }
    // 仅挂载时同步一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onHashChange = () => setActiveKey(readSettingsTab());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const handleTabChange = (k: string) => {
    if (!SETTINGS_TAB_KEY_SET.has(k)) return;
    setActiveKey(k as SettingsTabKey);
    if (typeof window !== 'undefined') {
      const url = `${window.location.pathname}${window.location.search}#${k}`;
      window.history.replaceState(null, '', url);
      try {
        localStorage.setItem(SETTINGS_TAB_STORAGE_KEY, k);
      } catch {
        // ignore
      }
    }
  };

  const tabLabel = (icon: React.ReactNode, text: string) => (
    <span className="inline-flex items-center gap-2">
      {icon}
      {text}
    </span>
  );

  return (
    <div className="max-w-5xl">
      <Tabs
        activeKey={activeKey}
        onChange={handleTabChange}
        tabPosition={isWide ? 'left' : 'top'}
        // 左侧 tab 给一个固定宽度，让选项不挤
        tabBarStyle={isWide ? { width: 168 } : undefined}
        items={[
          {
            key: 'account',
            label: tabLabel(<LockOutlined />, '通用'),
            children: (
              <div className="flex flex-col gap-4">
                <AppTitleCard />
                <ReminderDaysCard />
                <PasswordCard />
              </div>
            ),
          },
          {
            key: 'shares',
            label: tabLabel(<ShareAltOutlined />, '分享'),
            children: <ShareManagementCard />,
          },
          {
            key: 'taxonomies',
            label: tabLabel(<AppstoreOutlined />, '分类'),
            children: <TaxonomyManagementCard />,
          },
          {
            key: 'amap',
            label: tabLabel(<EnvironmentOutlined />, '地图'),
            children: <AmapSettingsCard />,
          },
          {
            key: 's3',
            label: tabLabel(<CloudUploadOutlined />, '存储'),
            children: (
              <div className="flex flex-col gap-4">
                <S3SettingsCard />
                <BackupStorageCard />
              </div>
            ),
          },
          {
            key: 'backup',
            label: tabLabel(<DatabaseOutlined />, '备份'),
            children: <BackupCard />,
          },
          {
            key: 'trash',
            label: tabLabel(<RestOutlined />, '回收站'),
            children: <TrashCard />,
          },
        ]}
      />
    </div>
  );
}

// ───────────────────────────────────────────
// 修改密码
// ───────────────────────────────────────────

function AppTitleCard() {
  const qc = useQueryClient();
  const settingsQ = useQuery({ queryKey: ['settings'], queryFn: getSettings });
  const [value, setValue] = useState('');

  useEffect(() => {
    if (settingsQ.data) setValue(settingsQ.data.app_title ?? '');
  }, [settingsQ.data]);

  const mut = useMutation({
    mutationFn: (next: string) =>
      updateSettings({ app_title: next.trim() || null }),
    onSuccess: () => {
      toast.success('已保存');
      qc.invalidateQueries({ queryKey: ['settings'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const original = settingsQ.data?.app_title ?? '';
  const dirty = value.trim() !== original.trim();

  return (
    <Card
      title={
        <span className="inline-flex items-center gap-2">
          <EditOutlined />
          应用标题
        </span>
      }
      style={{ border: '1px solid var(--color-border)', borderRadius: 10 }}
      styles={{ header: { borderBottom: '1px solid var(--color-border)' } }}
    >
      <div className="flex flex-col gap-3">
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="人物关系网"
          maxLength={6}
          showCount
        />
        <div>
          <Button
            type="primary"
            icon={<SaveOutlined />}
            disabled={!dirty || mut.isPending}
            loading={mut.isPending}
            onClick={() => mut.mutate(value)}
          >
            保存
          </Button>
        </div>
      </div>
    </Card>
  );
}

const REMINDER_DAYS_OPTIONS = [
  { value: 30, label: '1 个月' },
  { value: 60, label: '2 个月' },
  { value: 90, label: '3 个月' },
  { value: 180, label: '半年' },
];

function ReminderDaysCard() {
  const qc = useQueryClient();
  const settingsQ = useQuery({ queryKey: ['settings'], queryFn: getSettings });
  const current = settingsQ.data?.reminder_days ?? 60;

  const mut = useMutation({
    mutationFn: (next: number) => updateSettings({ reminder_days: String(next) }),
    onSuccess: () => {
      toast.success('已保存');
      qc.invalidateQueries({ queryKey: ['settings'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card
      title={
        <span className="inline-flex items-center gap-2">
          <CalendarOutlined />
          提醒天数
        </span>
      }
      style={{ border: '1px solid var(--color-border)', borderRadius: 10 }}
      styles={{ header: { borderBottom: '1px solid var(--color-border)' } }}
    >
      <div className="flex flex-col gap-2">
        <div className="text-[12px] text-[var(--color-muted-fg)]">
          大屏「近期提醒」面板的时间范围（生日 + 周年纪念日）
        </div>
        <Select
          value={current}
          onChange={(v) => mut.mutate(v)}
          options={REMINDER_DAYS_OPTIONS}
          style={{ width: 200 }}
          loading={mut.isPending}
        />
      </div>
    </Card>
  );
}

function PasswordCard() {
  const [pwForm] = Form.useForm<PwFormValues>();

  const pwMut = useMutation({
    mutationFn: ({ current, next }: { current: string; next: string }) =>
      changePassword(current, next),
    onSuccess: () => {
      toast.success('密码已修改');
      pwForm.resetFields();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card
      title={
        <span className="inline-flex items-center gap-2">
          <LockOutlined />
          修改密码
        </span>
      }
      style={{ border: '1px solid var(--color-border)', borderRadius: 10 }}
      styles={{ header: { borderBottom: '1px solid var(--color-border)' } }}
    >
      <Form<PwFormValues>
        form={pwForm}
        layout="vertical"
        onFinish={(v) => pwMut.mutate({ current: v.current, next: v.next })}
        requiredMark={false}
      >
        <Form.Item
          name="current"
          label="当前密码"
          rules={[{ required: true, message: '请输入当前密码' }]}
        >
          <Input.Password placeholder="输入当前密码" autoComplete="current-password" />
        </Form.Item>
        <Form.Item
          name="next"
          label="新密码"
          rules={[
            { required: true, message: '请输入新密码' },
            { min: 6, message: '新密码至少 6 位' },
          ]}
        >
          <Input.Password placeholder="至少 6 位" autoComplete="new-password" />
        </Form.Item>
        <Form.Item
          name="confirm"
          label="确认新密码"
          dependencies={['next']}
          rules={[
            { required: true, message: '请再输入一次新密码' },
            ({ getFieldValue }) => ({
              validator(_, value) {
                if (!value || getFieldValue('next') === value) return Promise.resolve();
                return Promise.reject(new Error('两次输入的新密码不一致'));
              },
            }),
          ]}
        >
          <Input.Password placeholder="再输入一次新密码" autoComplete="new-password" />
        </Form.Item>
        <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={pwMut.isPending}>
          保存
        </Button>
      </Form>
    </Card>
  );
}

// ───────────────────────────────────────────
// 高德地图
// ───────────────────────────────────────────

function formatRelative(ts: number): string {
  const diff = Math.floor(Date.now() / 1000) - ts;
  if (diff < 60) return '刚刚';
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`;
  if (diff < 86400 * 30) return `${Math.floor(diff / 86400)} 天前`;
  return formatTimestamp(ts);
}

function TestResultBanner({
  result,
  stale = false,
}: {
  result: TestResult | null;
  stale?: boolean;
}) {
  if (!result) return null;
  // stale = 测试通过但表单已被改动，提示用户重新测试
  const tone: 'success' | 'error' | 'stale' = stale
    ? 'stale'
    : result.ok
      ? 'success'
      : 'error';
  const palette =
    tone === 'success'
      ? { bg: 'rgba(34,197,94,0.08)', border: 'rgba(34,197,94,0.35)', fg: 'rgb(21,128,61)' }
      : tone === 'stale'
        ? { bg: 'rgba(234,179,8,0.08)', border: 'rgba(234,179,8,0.4)', fg: 'rgb(161,98,7)' }
        : { bg: 'rgba(239,68,68,0.08)', border: 'rgba(239,68,68,0.35)', fg: 'rgb(185,28,28)' };
  const label =
    tone === 'success' ? '✓ 验证通过' : tone === 'stale' ? '⚠ 配置已变更' : '✗ 验证失败';
  const message = stale
    ? '请重新点击「测试」验证当前配置后再保存。'
    : result.ok
      ? result.note || '配置可用，可以保存'
      : result.error || '请检查配置';
  return (
    <div
      className="mb-3 flex items-start gap-2 px-3 py-2 text-[13px]"
      style={{
        background: palette.bg,
        border: `1px solid ${palette.border}`,
        borderRadius: 8,
        color: palette.fg,
      }}
    >
      <span style={{ fontWeight: 600 }}>{label}</span>
      <span className="min-w-0 flex-1 break-words">
        {message}
        {!stale && result.detail && (
          <span className="mt-0.5 block opacity-70 text-[12px]">{result.detail}</span>
        )}
      </span>
    </div>
  );
}

function MaskedValue({ value }: { value: string }) {
  const [reveal, setReveal] = useState(false);
  let prefix = '';
  let middle: string;
  let suffix = '';
  if (value.length > 8) {
    prefix = value.slice(0, 4);
    middle = value.slice(4, -4);
    suffix = value.slice(-4);
  } else {
    middle = value;
  }
  return (
    <code
      className="inline-flex items-center font-mono text-[13px] text-[var(--color-foreground)]"
      onMouseEnter={() => setReveal(true)}
      onMouseLeave={() => setReveal(false)}
    >
      {prefix}
      <span
        style={{
          filter: reveal ? 'none' : 'blur(5px)',
          transition: 'filter .15s ease',
          userSelect: reveal ? 'text' : 'none',
          display: 'inline-block',
          minWidth: middle ? undefined : '2.5em',
        }}
      >
        {middle || '\u00A0\u00A0\u00A0\u00A0\u00A0'}
      </span>
      {suffix}
    </code>
  );
}

function AmapSettingsCard() {
  const qc = useQueryClient();
  const [amapForm] = Form.useForm<AmapFormValues>();
  const settingsQ = useQuery({ queryKey: ['settings'], queryFn: getSettings });

  const currentKey = settingsQ.data?.amap_key ?? '';
  const currentSecret = settingsQ.data?.amap_security_code ?? '';
  const validatedAt = settingsQ.data?.amap_validated_at;
  const isConfigured = !!(currentKey.trim() || currentSecret.trim());

  // 用户是否主动进入编辑态。未配置时无论如何都展示编辑表单。
  const [editing, setEditing] = useState(false);
  const mode: 'view' | 'edit' = editing || !isConfigured ? 'edit' : 'view';
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [testedSnapshot, setTestedSnapshot] = useState<string>('');

  const watched = Form.useWatch([], amapForm);
  const currentSnapshot = JSON.stringify(watched ?? {});
  const canSave = !!testResult?.ok && currentSnapshot === testedSnapshot;

  useEffect(() => {
    if (mode === 'edit') {
      amapForm.setFieldsValue({
        amap_key: currentKey,
        amap_security_code: currentSecret,
      });
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTestResult(null);
       
      setTestedSnapshot('');
    }
  }, [mode, currentKey, currentSecret, amapForm]);

  const testMut = useMutation({
    mutationFn: (v: AmapFormValues) =>
      testAmap({ key: v.amap_key.trim(), security_code: v.amap_security_code.trim() }),
    onSuccess: (r, v) => {
      setTestResult(r);
      if (r.ok) setTestedSnapshot(JSON.stringify(v));
    },
    onError: (e: Error) => {
      setTestResult({ ok: false, error: e.message });
      setTestedSnapshot('');
    },
  });

  const saveMut = useMutation({
    mutationFn: (v: AmapFormValues) =>
      updateSettings({
        amap_key: v.amap_key.trim() || null,
        amap_security_code: v.amap_security_code.trim() || null,
        amap_validated_at: String(Math.floor(Date.now() / 1000)),
      }),
    onSuccess: (_d, v) => {
      const k = v.amap_key.trim();
      const s = v.amap_security_code.trim();
      toast.success('高德地图配置已保存');
      setAMapConfig(k || undefined, s || undefined);
      qc.invalidateQueries({ queryKey: ['settings'] });
      setEditing(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const clearMut = useMutation({
    mutationFn: () =>
      updateSettings({
        amap_key: null,
        amap_security_code: null,
        amap_validated_at: null,
      }),
    onSuccess: () => {
      toast.success('高德地图配置已清空');
      setAMapConfig(undefined, undefined);
      qc.invalidateQueries({ queryKey: ['settings'] });
      setEditing(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleClear = () => {
    getModal()?.confirm({
      title: '清空高德地图配置？',
      content: '清空后，地图相关功能将不可用，直到重新配置 Key。',
      okText: '清空',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: () => clearMut.mutate(),
    });
  };

  return (
    <Card
      title={
        <span className="inline-flex items-center gap-2">
          <EnvironmentOutlined />
          高德地图
          {mode === 'view' && validatedAt && (
            <Tag color="green" style={{ marginInlineEnd: 0 }}>
              已验证 · {formatRelative(validatedAt)}
            </Tag>
          )}
        </span>
      }
      extra={
        isConfigured ? (
          mode === 'view' ? (
            <span className="inline-flex items-center gap-1">
              <Button
                type="link"
                size="small"
                danger
                icon={<StopOutlined />}
                onClick={handleClear}
                loading={clearMut.isPending}
              >
                清空
              </Button>
              <Button
                type="link"
                size="small"
                icon={<EditOutlined />}
                onClick={() => setEditing(true)}
              >
                修改
              </Button>
            </span>
          ) : (
            <Button type="link" size="small" onClick={() => setEditing(false)}>
              取消
            </Button>
          )
        ) : null
      }
      style={{ border: '1px solid var(--color-border)', borderRadius: 10 }}
      styles={{ header: { borderBottom: '1px solid var(--color-border)' } }}
    >
      {mode === 'view' && isConfigured ? (
        <div className="flex flex-col gap-3">
          <ConfiguredRow label="Key" value={currentKey} />
          <ConfiguredRow label="安全密钥" value={currentSecret} />
        </div>
      ) : (
        <>
          <Form<AmapFormValues>
            form={amapForm}
            layout="vertical"
            onFinish={(v) => saveMut.mutate(v)}
            requiredMark={false}
            autoComplete="off"
          >
            <Form.Item
              name="amap_key"
              label="Key"
              rules={[{ required: true, message: '请输入 Key' }]}
            >
              <Input placeholder="高德 JS API Key" autoComplete="off" />
            </Form.Item>
            <Form.Item name="amap_security_code" label="安全密钥">
              <Input placeholder="安全密钥（jscode）" autoComplete="off" />
            </Form.Item>
            <TestResultBanner result={testResult} stale={!canSave && !!testResult?.ok} />
            <div className="flex items-center gap-2">
              <Button
                onClick={() => {
                  amapForm
                    .validateFields()
                    .then((v) => testMut.mutate(v))
                    .catch(() => undefined);
                }}
                loading={testMut.isPending}
              >
                测试
              </Button>
              <Tooltip title={canSave ? '' : '请先点击「测试」并通过验证'}>
                <Button
                  type="primary"
                  htmlType="submit"
                  icon={<SaveOutlined />}
                  loading={saveMut.isPending}
                  disabled={!canSave}
                >
                  保存
                </Button>
              </Tooltip>
            </div>
          </Form>
          <p className="m-0 mt-3 text-[12px] text-[var(--color-muted-fg)]">
            在{' '}
            <a
              href="https://console.amap.com/"
              target="_blank"
              rel="noreferrer"
              style={{ color: 'var(--color-accent-strong)' }}
            >
              console.amap.com
            </a>{' '}
            创建 Web 端 (JS API) 应用获取 Key 和安全密钥。「测试」通过后才能保存。
          </p>
        </>
      )}
    </Card>
  );
}

function ConfiguredRow({
  label,
  value,
  masked = true,
}: {
  label: string;
  value: string;
  masked?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-4">
      <div className="w-20 shrink-0 text-[13px] text-[var(--color-muted-fg)]">{label}</div>
      <div className="min-w-0 flex-1">
        {value ? (
          masked ? (
            <MaskedValue value={value} />
          ) : (
            <code className="font-mono text-[13px] break-all text-[var(--color-foreground)]">
              {value}
            </code>
          )
        ) : (
          <span className="text-[13px] text-[var(--color-muted-fg)]">未配置</span>
        )}
      </div>
    </div>
  );
}

// ───────────────────────────────────────────
// 分享管理
// ───────────────────────────────────────────

function formatTimestamp(ts: number): string {
  const d = new Date(ts * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function expiresLabel(expires_at: number | null): { text: string; tone: 'default' | 'warn' | 'expired' } {
  if (expires_at === null) return { text: '永不失效', tone: 'default' };
  const now = Math.floor(Date.now() / 1000);
  if (expires_at < now) return { text: '已过期', tone: 'expired' };
  const remaining = expires_at - now;
  const days = Math.ceil(remaining / 86400);
  return {
    text: `${formatTimestamp(expires_at)} · 剩 ${days} 天`,
    tone: days <= 7 ? 'warn' : 'default',
  };
}

function ShareManagementCard() {
  const qc = useQueryClient();
  const sharesQ = useQuery({ queryKey: ['shares'], queryFn: listShares });
  const personsQ = useQuery({ queryKey: ['persons', 'all-for-shares'], queryFn: () => listPersons() });

  const personMap = useMemo(() => {
    const m = new Map<number, Person>();
    (personsQ.data ?? []).forEach((p) => m.set(p.id, p));
    return m;
  }, [personsQ.data]);

  const [pwTarget, setPwTarget] = useState<Share | null>(null);
  const [exTarget, setExTarget] = useState<Share | null>(null);
  const [vfTarget, setVfTarget] = useState<Share | null>(null);

  const deleteMut = useMutation({
    mutationFn: deleteShare,
    onSuccess: () => {
      toast.success('已删除分享');
      qc.invalidateQueries({ queryKey: ['shares'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleDelete = (s: Share) => {
    getModal()?.confirm({
      title: '删除分享？',
      content: <span>分享链接 <b>{s.title || `#${s.id}`}</b> 将永久失效。</span>,
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: () => deleteMut.mutateAsync(s.id),
    });
  };

  const handleCopy = (s: Share) => {
    const url = buildShareUrl(s.token);
    navigator.clipboard.writeText(url).then(() => toast.success('链接已复制'));
  };

  const handleCopyWithPassword = (s: Share) => {
    if (!s.password) {
      toast.error('该分享密码无法解密');
      return;
    }
    const url = buildShareUrl(s.token, s.password);
    navigator.clipboard.writeText(url).then(() => toast.success('已复制（含密码）'));
  };

  const personName = (id: number): string => {
    const p = personMap.get(id);
    if (!p) return `#${id}`;
    return p.real_name || p.standard_title || p.dialect_title || p.nickname || `#${id}`;
  };

  return (
    <Card
      title={
        <span className="inline-flex items-center gap-2">
          <ShareAltOutlined />
          分享管理
        </span>
      }
      style={{ border: '1px solid var(--color-border)', borderRadius: 10 }}
      styles={{ header: { borderBottom: '1px solid var(--color-border)' } }}
    >
      {sharesQ.isLoading ? (
        <div className="py-4 text-center text-[13px] text-[var(--color-muted-fg)]">加载中…</div>
      ) : !sharesQ.data || sharesQ.data.length === 0 ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={
            <span className="text-[13px] text-[var(--color-muted-fg)]">
              还没有分享。在「家族」页选择一个根，点击「分享」即可创建。
            </span>
          }
        />
      ) : (() => {
        const personShares = sharesQ.data.filter((s) => s.mode === 'person');
        const treeShares = sharesQ.data.filter((s) => s.mode === 'tree');
        return (
          <Tabs
            defaultActiveKey={personShares.length > 0 ? 'person' : 'tree'}
            items={[
              {
                key: 'person',
                label: `人物 (${personShares.length})`,
                children: personShares.length === 0 ? (
                  <div className="py-4 text-center text-[13px] text-[var(--color-muted-fg)]">暂无人物分享</div>
                ) : (
                  <ShareList
                    shares={personShares}
                    personName={personName}
                    onCopy={handleCopy}
                    onCopyWithPassword={handleCopyWithPassword}
                    onDelete={handleDelete}
                    onPw={setPwTarget}
                    onEx={setExTarget}
                    onVf={setVfTarget}
                  />
                ),
              },
              {
                key: 'tree',
                label: `家族树 (${treeShares.length})`,
                children: treeShares.length === 0 ? (
                  <div className="py-4 text-center text-[13px] text-[var(--color-muted-fg)]">暂无家族树分享</div>
                ) : (
                  <ShareList
                    shares={treeShares}
                    personName={personName}
                    onCopy={handleCopy}
                    onCopyWithPassword={handleCopyWithPassword}
                    onDelete={handleDelete}
                    onPw={setPwTarget}
                    onEx={setExTarget}
                    onVf={setVfTarget}
                  />
                ),
              },
            ]}
          />
        );
      })()}

      <ChangeSharePasswordModal share={pwTarget} onClose={() => setPwTarget(null)} />
      <ChangeShareExpiryModal share={exTarget} onClose={() => setExTarget(null)} />
      <ChangeShareVisibilityModal share={vfTarget} onClose={() => setVfTarget(null)} />
    </Card>
  );
}

function ShareList({
  shares,
  personName,
  onCopy,
  onCopyWithPassword,
  onDelete,
  onPw,
  onEx,
  onVf,
}: {
  shares: Share[];
  personName: (id: number) => string;
  onCopy: (s: Share) => void;
  onCopyWithPassword: (s: Share) => void;
  onDelete: (s: Share) => void;
  onPw: (s: Share) => void;
  onEx: (s: Share) => void;
  onVf: (s: Share) => void;
}) {
  return (
    <ul className="m-0 flex list-none flex-col gap-2 p-0">
      {shares.map((s) => {
        const exp = expiresLabel(s.expires_at);
        const url = buildShareUrl(s.token);
        const hasPw = !!s.password;
        return (
          <li
            key={s.id}
            className="flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-center sm:gap-4"
            style={{
              border: '1px solid var(--color-border)',
              borderRadius: 8,
              background: 'var(--color-surface)',
            }}
          >
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <div className="flex items-center gap-2">
                <span className="truncate text-[14px] font-medium text-[var(--color-foreground)]">
                  {s.title ||
                    (s.mode === 'person'
                      ? `${personName(s.root_person_id)} 的资料`
                      : `${personName(s.root_person_id)} 的家族树`)}
                </span>
                {s.mode === 'person' && (() => {
                  const visible = parseShareVisibleFields(s.visible_fields);
                  const total = ALL_VISIBLE_FIELDS.length;
                  return (
                    <Tag bordered={false} style={{ marginInlineEnd: 0 }}>
                      {visible.length === 0 ? (
                        <>
                          <EyeInvisibleOutlined /> 全部隐藏
                        </>
                      ) : visible.length === total ? (
                        <>
                          <EyeOutlined /> 全部可见
                        </>
                      ) : (
                        <>
                          <EyeOutlined /> 可见 {visible.length}/{total}
                        </>
                      )}
                    </Tag>
                  );
                })()}
                <Tag
                  color={
                    exp.tone === 'expired' ? 'red' : exp.tone === 'warn' ? 'orange' : 'default'
                  }
                  style={{ marginInlineEnd: 0 }}
                >
                  {exp.text}
                </Tag>
                {s.root_deleted_at !== null && (
                  <Tooltip title="对应人物已移入回收站，访问者打不开此分享。彻底删除人物时此分享会一并清除。">
                    <Tag color="red" style={{ marginInlineEnd: 0 }}>
                      <DeleteOutlined /> 人物已回收
                    </Tag>
                  </Tooltip>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-[var(--color-muted-fg)]">
                <span>
                  {s.mode === 'person' ? '人物：' : '根：'}
                  {personName(s.root_person_id)}
                </span>
                <span>创建：{formatTimestamp(s.created_at)}</span>
              </div>
              <a
                href={url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 truncate text-[12px]"
                style={{ color: 'var(--color-accent-strong)' }}
              >
                <LinkOutlined />
                <span className="truncate">{url}</span>
              </a>
            </div>
            <div className="flex flex-wrap items-center gap-1">
              <Dropdown
                trigger={['click']}
                menu={{
                  items: [
                    { key: 'plain', label: '复制链接', onClick: () => onCopy(s) },
                    {
                      key: 'with-pw',
                      label: '复制链接（含密码）',
                      disabled: !hasPw,
                      onClick: () => onCopyWithPassword(s),
                    },
                  ],
                }}
              >
                <Tooltip title={hasPw ? '复制链接' : '复制链接（密码无法解密，仅可复制纯链接）'}>
                  <Button size="small" type="text" icon={<CopyOutlined />} />
                </Tooltip>
              </Dropdown>
              {s.mode === 'person' && (
                <Tooltip title="编辑访问者可见字段">
                  <Button
                    size="small"
                    type="text"
                    icon={<EyeOutlined />}
                    onClick={() => onVf(s)}
                  />
                </Tooltip>
              )}
              <Tooltip title="修改密码">
                <Button size="small" type="text" icon={<LockOutlined />} onClick={() => onPw(s)} />
              </Tooltip>
              <Tooltip title="修改有效期">
                <Button size="small" type="text" icon={<EditOutlined />} onClick={() => onEx(s)} />
              </Tooltip>
              <Tooltip title="删除分享">
                <Button
                  size="small"
                  type="text"
                  danger
                  icon={<DeleteOutlined />}
                  onClick={() => onDelete(s)}
                />
              </Tooltip>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function ChangeSharePasswordModal({
  share,
  onClose,
}: {
  share: Share | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [form] = Form.useForm<{ password: string; confirm: string }>();

  useEffect(() => {
    if (share) form.resetFields();
  }, [share, form]);

  const mut = useMutation({
    mutationFn: ({ id, password }: { id: number; password: string }) =>
      updateShare(id, { password }),
    onSuccess: () => {
      toast.success('访问密码已更新');
      qc.invalidateQueries({ queryKey: ['shares'] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Modal
      open={!!share}
      onCancel={onClose}
      footer={null}
      destroyOnHidden
      title="修改访问密码"
      width={400}
    >
      <Form
        form={form}
        layout="vertical"
        requiredMark={false}
        autoComplete="off"
        onFinish={(v) => share && mut.mutate({ id: share.id, password: v.password })}
      >
        <Form.Item
          name="password"
          label="新密码"
          rules={[
            { required: true, message: '请输入新密码' },
            { min: 4, message: '至少 4 位' },
          ]}
        >
          <Input.Password placeholder="访问者需要输入此密码" autoComplete="new-password" autoFocus />
        </Form.Item>
        <Form.Item
          name="confirm"
          label="确认新密码"
          dependencies={['password']}
          rules={[
            { required: true, message: '请再输入一次新密码' },
            ({ getFieldValue }) => ({
              validator(_, value) {
                if (!value || getFieldValue('password') === value) return Promise.resolve();
                return Promise.reject(new Error('两次输入的新密码不一致'));
              },
            }),
          ]}
        >
          <Input.Password placeholder="再输入一次新密码" autoComplete="new-password" />
        </Form.Item>
        <Button type="primary" htmlType="submit" block loading={mut.isPending}>
          保存
        </Button>
      </Form>
    </Modal>
  );
}

function ChangeShareVisibilityModal({
  share,
  onClose,
}: {
  share: Share | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<VisibleField[]>([]);

  useEffect(() => {
    if (share) setSelected(parseShareVisibleFields(share.visible_fields));
  }, [share]);

  const mut = useMutation({
    mutationFn: ({ id, visible }: { id: number; visible: VisibleField[] }) =>
      updateShare(id, { visible_fields: visible }),
    onSuccess: () => {
      toast.success('已更新可见字段');
      qc.invalidateQueries({ queryKey: ['shares'] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Modal
      open={!!share}
      onCancel={onClose}
      footer={null}
      destroyOnHidden
      title="编辑访问者可见字段"
      width={420}
    >
      <div className="flex flex-col gap-3 pb-1">
        <p className="m-0 text-[12px] text-[var(--color-muted-fg)]">
          只有勾选的字段会展示给访问者。姓名未勾选时按首字打码（首字 + `*`）。
        </p>
        <Checkbox.Group
          value={selected}
          onChange={(vals) => setSelected(vals as VisibleField[])}
          options={ALL_VISIBLE_FIELDS.map((f) => ({
            label: VISIBLE_FIELD_LABEL[f],
            value: f,
          }))}
          style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}
        />
        <Button
          type="primary"
          block
          loading={mut.isPending}
          onClick={() =>
            share && mut.mutate({ id: share.id, visible: selected })
          }
        >
          保存
        </Button>
      </div>
    </Modal>
  );
}

type ExpiryPreset = 'never' | '7' | '30' | '90' | '365' | 'custom';

function ChangeShareExpiryModal({
  share,
  onClose,
}: {
  share: Share | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [form] = Form.useForm<{ preset: ExpiryPreset; custom: number }>();
  const preset = Form.useWatch('preset', form);

  useEffect(() => {
    if (share) form.setFieldsValue({ preset: 'never', custom: 30 });
  }, [share, form]);

  const mut = useMutation({
    mutationFn: ({ id, expires_days }: { id: number; expires_days: number | null }) =>
      updateShare(id, { expires_days }),
    onSuccess: () => {
      toast.success('有效期已更新');
      qc.invalidateQueries({ queryKey: ['shares'] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleFinish = (v: { preset: ExpiryPreset; custom: number }) => {
    if (!share) return;
    let expires_days: number | null;
    if (v.preset === 'never') expires_days = null;
    else if (v.preset === 'custom') expires_days = Number(v.custom);
    else expires_days = Number(v.preset);
    mut.mutate({ id: share.id, expires_days });
  };

  return (
    <Modal
      open={!!share}
      onCancel={onClose}
      footer={null}
      destroyOnHidden
      title="修改有效期"
      width={400}
    >
      <p className="m-0 mb-3 text-[12px] text-[var(--color-muted-fg)]">
        新的有效期将从当前时间开始计算。
      </p>
      <Form
        form={form}
        layout="vertical"
        requiredMark={false}
        onFinish={handleFinish}
        initialValues={{ preset: 'never', custom: 30 }}
      >
        <Form.Item name="preset" label="有效期">
          <Select
            options={[
              { value: 'never', label: '永不失效' },
              { value: '7', label: '7 天' },
              { value: '30', label: '30 天' },
              { value: '90', label: '90 天' },
              { value: '365', label: '1 年' },
              { value: 'custom', label: '自定义天数' },
            ]}
          />
        </Form.Item>
        {preset === 'custom' && (
          <Form.Item
            name="custom"
            label="自定义天数"
            rules={[
              { required: true, message: '请输入天数' },
              { type: 'number', min: 1, message: '至少 1 天' },
            ]}
          >
            <InputNumber min={1} max={3650} style={{ width: '100%' }} addonAfter="天" />
          </Form.Item>
        )}
        <Button type="primary" htmlType="submit" block loading={mut.isPending}>
          保存
        </Button>
      </Form>
    </Modal>
  );
}

// ───────────────────────────────────────────
// 公共文件存储 (S3) — 头像 / 大事记媒体等需要公开访问的文件
// ───────────────────────────────────────────

interface S3FormValues {
  s3_endpoint: string;
  s3_region: string;
  s3_bucket: string;
  s3_access_key_id: string;
  s3_secret_access_key: string;
  s3_public_base: string;
  s3_path_template: string;
}

function PathTemplateHelp({ template }: { template: string }) {
  // 实时预览：用当前时间 + 示例文件名渲染模板
  const effective = (template || '').trim() || DEFAULT_S3_PATH_TEMPLATE;
  const preview = substitutePath(effective, { ext: 'jpg', originalName: 'sample-photo.jpg' });
  return (
    <span className="block text-[12px] leading-relaxed text-[var(--color-muted-fg)]">
      占位符：
      <code>{'{yyyy} {MM} {dd} {HH} {mm} {ss} {ts} {rand} {rand6} {rand4} {ext} {name}'}</code>
      <br />
      预览：
      <code
        className="break-all"
        style={{ color: 'var(--color-foreground)' }}
      >
        {preview}
      </code>
    </span>
  );
}

function BackupPathTemplateHelp({ template }: { template: string }) {
  const effective =
    (template || '').trim() ||
    'backup/relation-net-backup-{yyyy}-{MM}-{dd}_{HH}-{mm}-{ss}.json';
  const preview = substitutePath(effective, {
    ext: 'json',
    originalName: 'relation-net-backup',
    kind: 'backup',
  });
  return (
    <span className="block text-[12px] leading-relaxed text-[var(--color-muted-fg)]">
      占位符：
      <code>{'{yyyy} {MM} {dd} {HH} {mm} {ss} {ts} {rand} {rand6} {rand4}'}</code>
      <br />
      预览：
      <code className="break-all" style={{ color: 'var(--color-foreground)' }}>
        {preview}
      </code>
    </span>
  );
}

function S3SettingsCard() {
  const qc = useQueryClient();
  const [form] = Form.useForm<S3FormValues>();
  const settingsQ = useQuery({ queryKey: ['settings'], queryFn: getSettings });
  const validatedAt = settingsQ.data?.s3_validated_at;

  const current: S3FormValues = {
    s3_endpoint: settingsQ.data?.s3_endpoint ?? '',
    s3_region: settingsQ.data?.s3_region ?? '',
    s3_bucket: settingsQ.data?.s3_bucket ?? '',
    s3_access_key_id: settingsQ.data?.s3_access_key_id ?? '',
    s3_secret_access_key: settingsQ.data?.s3_secret_access_key ?? '',
    s3_public_base: settingsQ.data?.s3_public_base ?? '',
    s3_path_template: settingsQ.data?.s3_path_template ?? '',
  };
  const isConfigured = !!(
    current.s3_endpoint.trim() &&
    current.s3_bucket.trim() &&
    current.s3_access_key_id.trim() &&
    current.s3_secret_access_key.trim()
  );

  const [editing, setEditing] = useState(false);
  const mode: 'view' | 'edit' = editing || !isConfigured ? 'edit' : 'view';
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [testedSnapshot, setTestedSnapshot] = useState<string>('');

  const watched = Form.useWatch([], form);
  const currentSnapshot = JSON.stringify(watched ?? {});
  const canSave = !!testResult?.ok && currentSnapshot === testedSnapshot;

  useEffect(() => {
    if (mode === 'edit') {
      form.setFieldsValue(current);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTestResult(null);
       
      setTestedSnapshot('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, settingsQ.data]);

  const testMut = useMutation({
    mutationFn: (v: S3FormValues) =>
      testS3({
        s3_endpoint: v.s3_endpoint.trim(),
        s3_region: v.s3_region.trim() || undefined,
        s3_bucket: v.s3_bucket.trim(),
        s3_access_key_id: v.s3_access_key_id.trim(),
        s3_secret_access_key: v.s3_secret_access_key.trim(),
        s3_public_base: v.s3_public_base.trim() || undefined,
      }),
    onSuccess: (r, v) => {
      setTestResult(r);
      if (r.ok) setTestedSnapshot(JSON.stringify(v));
    },
    onError: (e: Error) => {
      setTestResult({ ok: false, error: e.message });
      setTestedSnapshot('');
    },
  });

  const saveMut = useMutation({
    mutationFn: (v: S3FormValues) =>
      updateSettings({
        s3_endpoint: v.s3_endpoint.trim() || null,
        s3_region: v.s3_region.trim() || null,
        s3_bucket: v.s3_bucket.trim() || null,
        s3_access_key_id: v.s3_access_key_id.trim() || null,
        s3_secret_access_key: v.s3_secret_access_key.trim() || null,
        s3_public_base: v.s3_public_base.trim() || null,
        s3_path_template: v.s3_path_template.trim() || null,
        s3_validated_at: String(Math.floor(Date.now() / 1000)),
      }),
    onSuccess: () => {
      toast.success('公共文件存储配置已保存');
      qc.invalidateQueries({ queryKey: ['settings'] });
      setEditing(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const clearMut = useMutation({
    mutationFn: () =>
      updateSettings({
        s3_endpoint: null,
        s3_region: null,
        s3_bucket: null,
        s3_access_key_id: null,
        s3_secret_access_key: null,
        s3_public_base: null,
        s3_path_template: null,
        s3_validated_at: null,
      }),
    onSuccess: () => {
      toast.success('公共文件存储配置已清空');
      qc.invalidateQueries({ queryKey: ['settings'] });
      setEditing(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleClear = () => {
    getModal()?.confirm({
      title: '清空公共文件存储配置？',
      content:
        '清空后，头像、大事记媒体等公共文件上传将不可用。已上传的文件不会被删除。',
      okText: '清空',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: () => clearMut.mutate(),
    });
  };

  return (
    <Card
      title={
        <span className="inline-flex items-center gap-2">
          <CloudUploadOutlined />
          公共文件存储
          {mode === 'view' && validatedAt && (
            <Tag color="green" style={{ marginInlineEnd: 0 }}>
              已验证 · {formatRelative(validatedAt)}
            </Tag>
          )}
        </span>
      }
      extra={
        isConfigured ? (
          mode === 'view' ? (
            <span className="inline-flex items-center gap-1">
              <Button
                type="link"
                size="small"
                danger
                icon={<StopOutlined />}
                onClick={handleClear}
                loading={clearMut.isPending}
              >
                清空
              </Button>
              <Button
                type="link"
                size="small"
                icon={<EditOutlined />}
                onClick={() => setEditing(true)}
              >
                修改
              </Button>
            </span>
          ) : (
            <Button type="link" size="small" onClick={() => setEditing(false)}>
              取消
            </Button>
          )
        ) : null
      }
      style={{ border: '1px solid var(--color-border)', borderRadius: 10 }}
      styles={{ header: { borderBottom: '1px solid var(--color-border)' } }}
    >
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        <span className="text-[12px] text-[var(--color-muted-fg)]">
          存放：
        </span>
        <Tag bordered={false} style={{ marginInlineEnd: 0 }}>
          人物头像
        </Tag>
        <Tag bordered={false} style={{ marginInlineEnd: 0 }}>
          大事记图片
        </Tag>
        <Tag bordered={false} style={{ marginInlineEnd: 0 }}>
          大事记视频
        </Tag>
      </div>
      {mode === 'view' && isConfigured ? (
        <div className="flex flex-col gap-3">
          <ConfiguredRow label="Endpoint" value={current.s3_endpoint} masked={false} />
          <ConfiguredRow label="Region" value={current.s3_region || 'us-east-1'} masked={false} />
          <ConfiguredRow label="Bucket" value={current.s3_bucket} masked={false} />
          <ConfiguredRow label="Access Key" value={current.s3_access_key_id} />
          <ConfiguredRow label="Secret Key" value={current.s3_secret_access_key} />
          {current.s3_public_base && (
            <ConfiguredRow label="公开前缀" value={current.s3_public_base} masked={false} />
          )}
          <ConfiguredRow
            label="路径模板"
            value={current.s3_path_template || DEFAULT_S3_PATH_TEMPLATE}
            masked={false}
          />
        </div>
      ) : (
        <Form<S3FormValues>
          form={form}
          layout="vertical"
          onFinish={(v) => saveMut.mutate(v)}
          requiredMark={false}
          autoComplete="off"
          initialValues={current}
        >
          <p className="m-0 mb-3 text-[12px] text-[var(--color-muted-fg)]">
            Bucket 须可公开读取，或绑定 CDN/自定义域名填到「公开访问 URL 前缀」。
          </p>
          <Form.Item
            name="s3_endpoint"
            label="Endpoint"
            rules={[{ required: true, message: '请输入 Endpoint' }]}
          >
            <Input
              placeholder="如 https://s3.us-east-1.amazonaws.com / https://oss-cn-hangzhou.aliyuncs.com"
              autoComplete="off"
            />
          </Form.Item>
          <div className="grid gap-3 sm:grid-cols-2">
            <Form.Item name="s3_region" label="Region">
              <Input placeholder="如 us-east-1 / cn-hangzhou" autoComplete="off" />
            </Form.Item>
            <Form.Item
              name="s3_bucket"
              label="Bucket"
              rules={[{ required: true, message: '请输入 Bucket' }]}
            >
              <Input placeholder="Bucket 名称" autoComplete="off" />
            </Form.Item>
          </div>
          <Form.Item
            name="s3_access_key_id"
            label="Access Key ID"
            rules={[{ required: true, message: '请输入 Access Key' }]}
          >
            <Input autoComplete="off" />
          </Form.Item>
          <Form.Item
            name="s3_secret_access_key"
            label="Secret Access Key"
            rules={[{ required: true, message: '请输入 Secret' }]}
          >
            <Input.Password autoComplete="new-password" visibilityToggle />
          </Form.Item>
          <Form.Item
            name="s3_public_base"
            label="公开访问 URL 前缀"
            extra="可选。如果 Bucket 是私有的（如七牛默认），把绑定的 CDN/公开域名填到这里。留空则用 endpoint 拼。"
          >
            <Input placeholder="可选 · 例如 https://cdn.example.com" autoComplete="off" />
          </Form.Item>
          <Form.Item
            name="s3_path_template"
            label="对象 Key 模板"
            extra={<PathTemplateHelp template={watched?.s3_path_template ?? ''} />}
          >
            <Input
              placeholder={`留空则用默认：${DEFAULT_S3_PATH_TEMPLATE}`}
              autoComplete="off"
            />
          </Form.Item>
          <TestResultBanner result={testResult} stale={!canSave && !!testResult?.ok} />
          <div className="flex items-center gap-2">
            <Button
              onClick={() => {
                form
                  .validateFields()
                  .then((v) => testMut.mutate(v))
                  .catch(() => undefined);
              }}
              loading={testMut.isPending}
            >
              测试
            </Button>
            <Tooltip title={canSave ? '' : '请先点击「测试」并通过验证'}>
              <Button
                type="primary"
                htmlType="submit"
                icon={<SaveOutlined />}
                loading={saveMut.isPending}
                disabled={!canSave}
              >
                保存
              </Button>
            </Tooltip>
          </div>
          <p className="m-0 mt-3 text-[12px] text-[var(--color-muted-fg)]">
            支持 AWS S3 及 S3 兼容协议（阿里云 OSS / 腾讯云 COS / 七牛 Kodo 等）。
            「测试」会用当前配置 PUT 一个小对象、匿名 GET 验证可公开访问、再 DELETE 清理；全部通过才能保存。
            <br />
            <b>七牛 / R2 等强制私有的 Bucket</b>：请绑定一个公开访问域名填到「公开访问 URL 前缀」（用作 CDN）；其他 provider 可以直接把 Bucket 设成公共读。
            <br />
            备份等私有数据请改用下方的「备份存储」。
          </p>
        </Form>
      )}
    </Card>
  );
}

// ───────────────────────────────────────────
// 备份存储 (S3-backup)
// ───────────────────────────────────────────

interface S3BackupFormValues {
  s3_backup_endpoint: string;
  s3_backup_region: string;
  s3_backup_bucket: string;
  s3_backup_access_key_id: string;
  s3_backup_secret_access_key: string;
  s3_backup_path_template: string;
}

const DEFAULT_BACKUP_PATH_TEMPLATE =
  'backup/relation-net-backup-{yyyy}-{MM}-{dd}_{HH}-{mm}-{ss}.json';

function BackupStorageCard() {
  const qc = useQueryClient();
  const [form] = Form.useForm<S3BackupFormValues>();
  const settingsQ = useQuery({ queryKey: ['settings'], queryFn: getSettings });
  const validatedAt = settingsQ.data?.s3_backup_validated_at;

  const current: S3BackupFormValues = {
    s3_backup_endpoint: settingsQ.data?.s3_backup_endpoint ?? '',
    s3_backup_region: settingsQ.data?.s3_backup_region ?? '',
    s3_backup_bucket: settingsQ.data?.s3_backup_bucket ?? '',
    s3_backup_access_key_id: settingsQ.data?.s3_backup_access_key_id ?? '',
    s3_backup_secret_access_key:
      settingsQ.data?.s3_backup_secret_access_key ?? '',
    s3_backup_path_template: settingsQ.data?.s3_backup_path_template ?? '',
  };
  const isConfigured = !!(
    current.s3_backup_endpoint.trim() &&
    current.s3_backup_bucket.trim() &&
    current.s3_backup_access_key_id.trim() &&
    current.s3_backup_secret_access_key.trim()
  );

  const [editing, setEditing] = useState(false);
  const mode: 'view' | 'edit' = editing || !isConfigured ? 'edit' : 'view';
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [testedSnapshot, setTestedSnapshot] = useState<string>('');

  const watched = Form.useWatch([], form);
  const currentSnapshot = JSON.stringify(watched ?? {});
  const canSave = !!testResult?.ok && currentSnapshot === testedSnapshot;

  useEffect(() => {
    if (mode === 'edit') {
      form.setFieldsValue(current);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTestResult(null);

      setTestedSnapshot('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, settingsQ.data]);

  const testMut = useMutation({
    mutationFn: (v: S3BackupFormValues) =>
      testS3Backup({
        s3_backup_endpoint: v.s3_backup_endpoint.trim(),
        s3_backup_region: v.s3_backup_region.trim() || undefined,
        s3_backup_bucket: v.s3_backup_bucket.trim(),
        s3_backup_access_key_id: v.s3_backup_access_key_id.trim(),
        s3_backup_secret_access_key: v.s3_backup_secret_access_key.trim(),
        s3_backup_path_template: v.s3_backup_path_template.trim() || undefined,
      }),
    onSuccess: (r, v) => {
      setTestResult(r);
      if (r.ok) setTestedSnapshot(JSON.stringify(v));
    },
    onError: (e: Error) => {
      setTestResult({ ok: false, error: e.message });
      setTestedSnapshot('');
    },
  });

  const saveMut = useMutation({
    mutationFn: (v: S3BackupFormValues) =>
      updateSettings({
        s3_backup_endpoint: v.s3_backup_endpoint.trim() || null,
        s3_backup_region: v.s3_backup_region.trim() || null,
        s3_backup_bucket: v.s3_backup_bucket.trim() || null,
        s3_backup_access_key_id: v.s3_backup_access_key_id.trim() || null,
        s3_backup_secret_access_key:
          v.s3_backup_secret_access_key.trim() || null,
        s3_backup_path_template: v.s3_backup_path_template.trim() || null,
        s3_backup_validated_at: String(Math.floor(Date.now() / 1000)),
      }),
    onSuccess: () => {
      toast.success('备份存储配置已保存');
      qc.invalidateQueries({ queryKey: ['settings'] });
      qc.invalidateQueries({ queryKey: ['oss-backups'] });
      setEditing(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const clearMut = useMutation({
    mutationFn: () =>
      updateSettings({
        s3_backup_endpoint: null,
        s3_backup_region: null,
        s3_backup_bucket: null,
        s3_backup_access_key_id: null,
        s3_backup_secret_access_key: null,
        s3_backup_path_template: null,
        s3_backup_validated_at: null,
      }),
    onSuccess: () => {
      toast.success('备份存储配置已清空');
      qc.invalidateQueries({ queryKey: ['settings'] });
      qc.invalidateQueries({ queryKey: ['oss-backups'] });
      setEditing(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleClear = () => {
    getModal()?.confirm({
      title: '清空备份存储配置？',
      content: (
        <div className="flex flex-col gap-2 text-[13px]">
          <span>
            清空后自动备份将停止，备份列表也无法读取。
          </span>
          <span>
            <strong>对象存储里已有的备份文件不会被删除</strong>
            ——它们仍保留在你的 bucket 中。只要把同一份 Endpoint / Bucket / AccessKey 再填回来保存，就能重新看到并恢复历史备份。
          </span>
        </div>
      ),
      okText: '清空',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: () => clearMut.mutate(),
    });
  };

  const handleCopyFromAvatar = () => {
    const s = settingsQ.data;
    if (!s) return;
    form.setFieldsValue({
      s3_backup_endpoint: s.s3_endpoint ?? '',
      s3_backup_region: s.s3_region ?? '',
      s3_backup_access_key_id: s.s3_access_key_id ?? '',
      s3_backup_secret_access_key: s.s3_secret_access_key ?? '',
    });
    setTestResult(null);
    setTestedSnapshot('');
    toast.success('已复制公共文件存储的 Endpoint / Region / 密钥');
  };

  const avatarConfigured = !!(
    settingsQ.data?.s3_endpoint &&
    settingsQ.data?.s3_access_key_id &&
    settingsQ.data?.s3_secret_access_key
  );

  return (
    <Card
      title={
        <span className="inline-flex items-center gap-2">
          <DatabaseOutlined />
          备份存储
          {mode === 'view' && validatedAt && (
            <Tag color="green" style={{ marginInlineEnd: 0 }}>
              已验证 · {formatRelative(validatedAt)}
            </Tag>
          )}
        </span>
      }
      extra={
        isConfigured ? (
          mode === 'view' ? (
            <span className="inline-flex items-center gap-1">
              <Button
                type="link"
                size="small"
                danger
                icon={<StopOutlined />}
                onClick={handleClear}
                loading={clearMut.isPending}
              >
                清空
              </Button>
              <Button
                type="link"
                size="small"
                icon={<EditOutlined />}
                onClick={() => setEditing(true)}
              >
                修改
              </Button>
            </span>
          ) : (
            <Button type="link" size="small" onClick={() => setEditing(false)}>
              取消
            </Button>
          )
        ) : null
      }
      style={{ border: '1px solid var(--color-border)', borderRadius: 10 }}
      styles={{ header: { borderBottom: '1px solid var(--color-border)' } }}
    >
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        <span className="text-[12px] text-[var(--color-muted-fg)]">
          存放：
        </span>
        <Tag bordered={false} style={{ marginInlineEnd: 0 }}>
          数据备份
        </Tag>
      </div>
      {mode === 'view' && isConfigured ? (
        <div className="flex flex-col gap-3">
          <ConfiguredRow
            label="Endpoint"
            value={current.s3_backup_endpoint}
            masked={false}
          />
          <ConfiguredRow
            label="Region"
            value={current.s3_backup_region || 'us-east-1'}
            masked={false}
          />
          <ConfiguredRow
            label="Bucket"
            value={current.s3_backup_bucket}
            masked={false}
          />
          <ConfiguredRow
            label="Access Key"
            value={current.s3_backup_access_key_id}
          />
          <ConfiguredRow
            label="Secret Key"
            value={current.s3_backup_secret_access_key}
          />
          <ConfiguredRow
            label="路径模板"
            value={current.s3_backup_path_template || DEFAULT_BACKUP_PATH_TEMPLATE}
            masked={false}
          />
        </div>
      ) : (
        <Form<S3BackupFormValues>
          form={form}
          layout="vertical"
          onFinish={(v) => saveMut.mutate(v)}
          requiredMark={false}
          autoComplete="off"
          initialValues={current}
        >
          <p className="m-0 mb-3 text-[12px] text-[var(--color-muted-fg)]">
            Bucket 必须是<b>私有</b>的——不能匿名读取，否则备份等私有文件会暴露。
          </p>

          {avatarConfigured && (
            <div className="mb-3 flex items-center justify-between gap-3 rounded-lg border border-dashed border-[var(--color-border)] px-3 py-2">
              <span className="text-[12px] text-[var(--color-muted-fg)]">
                公共文件存储已配置，可一键复用同账号的 Endpoint / Region / 密钥（不复用 Bucket / 前缀）
              </span>
              <Button size="small" onClick={handleCopyFromAvatar}>
                从公共文件存储复制
              </Button>
            </div>
          )}

          <Form.Item
            name="s3_backup_endpoint"
            label="Endpoint"
            rules={[{ required: true, message: '请输入 Endpoint' }]}
          >
            <Input
              placeholder="如 https://s3.us-east-1.amazonaws.com / https://oss-cn-hangzhou.aliyuncs.com"
              autoComplete="off"
            />
          </Form.Item>
          <div className="grid gap-3 sm:grid-cols-2">
            <Form.Item name="s3_backup_region" label="Region">
              <Input placeholder="如 us-east-1 / cn-hangzhou" autoComplete="off" />
            </Form.Item>
            <Form.Item
              name="s3_backup_bucket"
              label="Bucket"
              rules={[{ required: true, message: '请输入 Bucket' }]}
            >
              <Input placeholder="建议是单独的私有 Bucket" autoComplete="off" />
            </Form.Item>
          </div>
          <Form.Item
            name="s3_backup_access_key_id"
            label="Access Key ID"
            rules={[{ required: true, message: '请输入 Access Key' }]}
          >
            <Input autoComplete="off" />
          </Form.Item>
          <Form.Item
            name="s3_backup_secret_access_key"
            label="Secret Access Key"
            rules={[{ required: true, message: '请输入 Secret' }]}
          >
            <Input.Password autoComplete="new-password" visibilityToggle />
          </Form.Item>
          <Form.Item
            name="s3_backup_path_template"
            label="对象 Key 模板"
            extra={
              <BackupPathTemplateHelp
                template={watched?.s3_backup_path_template ?? ''}
              />
            }
          >
            <Input
              placeholder={`留空则用默认：${DEFAULT_BACKUP_PATH_TEMPLATE}`}
              autoComplete="off"
            />
          </Form.Item>

          <TestResultBanner result={testResult} stale={!canSave && !!testResult?.ok} />
          <div className="flex items-center gap-2">
            <Button
              onClick={() => {
                form
                  .validateFields()
                  .then((v) => testMut.mutate(v))
                  .catch(() => undefined);
              }}
              loading={testMut.isPending}
            >
              测试
            </Button>
            <Tooltip title={canSave ? '' : '请先点击「测试」并通过验证'}>
              <Button
                type="primary"
                htmlType="submit"
                icon={<SaveOutlined />}
                loading={saveMut.isPending}
                disabled={!canSave}
              >
                保存
              </Button>
            </Tooltip>
          </div>
          <p className="m-0 mt-3 text-[12px] text-[var(--color-muted-fg)]">
            备份桶必须是<b>私有</b>的。测试会用当前凭证 PUT 一个小对象、再用<b>签名</b> GET 校验能读回来、最后 DELETE 清理。
            <br />
            <b>建议</b>：在同账号下另开一个私有 Bucket 给备份用，避免和公共文件桶混用。
          </p>
        </Form>
      )}
    </Card>
  );
}

// ───────────────────────────────────────────
// 分类管理（事件类型 / 社会关系）
// ───────────────────────────────────────────

const DOMAIN_META: Record<
  TaxonomyDomain,
  { label: string; description: string }
> = {
  event_type: {
    label: '事件类型',
    description: '用于大事记的类型标签和地图 marker 颜色',
  },
  social_relation: {
    label: '社会关系',
    description: '用于「社会」关系下拉选项（朋友 / 同事 / 邻居 等）',
  },
};

function TaxonomyManagementCard() {
  const [domain, setDomain] = useState<TaxonomyDomain>('event_type');
  const [editing, setEditing] = useState<Taxonomy | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const qc = useQueryClient();
  const listQ = useQuery({
    queryKey: ['taxonomies', domain],
    queryFn: () => listTaxonomies(domain),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['taxonomies', domain] });
    qc.invalidateQueries({ queryKey: ['taxonomies', domain, 'all'] });
    qc.invalidateQueries({ queryKey: ['taxonomies', 'trash'] });
  };

  const hideMut = useMutation({
    mutationFn: hideTaxonomy,
    onSuccess: () => {
      toast.success('已移到回收站');
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const active = listQ.data ?? [];

  const [swapping, setSwapping] = useState(false);
  const handleSwap = async (a: Taxonomy, b: Taxonomy) => {
    if (swapping) return;
    setSwapping(true);
    try {
      // 两边各发一次 PUT 交换 order_index；后端要求 label 非空，所以传原值。
      await Promise.all([
        updateTaxonomy(a.id, {
          label: a.label,
          icon_name: a.icon_name,
          color_hex: a.color_hex,
          order_index: b.order_index,
        }),
        updateTaxonomy(b.id, {
          label: b.label,
          icon_name: b.icon_name,
          color_hex: b.color_hex,
          order_index: a.order_index,
        }),
      ]);
      invalidate();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSwapping(false);
    }
  };

  const handleHide = (t: Taxonomy) => {
    getModal()?.confirm({
      title: <span>把 <b>{t.label}</b> 移到回收站？</span>,
      content: t.is_default
        ? '内置分类不会出现在下拉里，可随时在「回收站」恢复。'
        : '已在使用该分类的事件/关系仍保留原 key 值，可随时在「回收站」恢复。',
      okText: '移到回收站',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: () => hideMut.mutate(t.id),
    });
  };

  const meta = DOMAIN_META[domain];

  return (
    <Card
      title={
        <span className="inline-flex items-center gap-2">
          <AppstoreOutlined />
          分类管理
        </span>
      }
      extra={
        <Segmented<TaxonomyDomain>
          size="small"
          value={domain}
          onChange={(v) => setDomain(v)}
          options={(['event_type', 'social_relation'] as TaxonomyDomain[]).map(
            (d) => ({ value: d, label: DOMAIN_META[d].label })
          )}
        />
      }
      style={{ border: '1px solid var(--color-border)', borderRadius: 10 }}
      styles={{ header: { borderBottom: '1px solid var(--color-border)' } }}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="text-[12px] text-[var(--color-muted-fg)]">
          {meta.description}
        </span>
        <Button
          type="primary"
          size="small"
          icon={<PlusOutlined />}
          onClick={() => {
            setEditing(null);
            setModalOpen(true);
          }}
        >
          新增
        </Button>
      </div>

      {listQ.isLoading ? (
        <div className="py-4 text-center text-[13px] text-[var(--color-muted-fg)]">
          加载中…
        </div>
      ) : active.length === 0 ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={
            <span className="text-[13px] text-[var(--color-muted-fg)]">
              还没有分类，点击右上「新增」开始
            </span>
          }
        />
      ) : (
        <>
          <ul className="m-0 flex list-none flex-col p-0">
            {active.map((t, i) => (
              <TaxonomyRow
                key={t.id}
                t={t}
                isFirst={i === 0}
                isLast={i === active.length - 1}
                onMoveUp={() => void handleSwap(t, active[i - 1])}
                onMoveDown={() => void handleSwap(t, active[i + 1])}
                onEdit={() => {
                  setEditing(t);
                  setModalOpen(true);
                }}
                onHide={() => handleHide(t)}
                disableMoves={swapping}
              />
            ))}
          </ul>
        </>
      )}

      <TaxonomyEditModal
        open={modalOpen}
        domain={domain}
        taxonomy={editing}
        nextOrderIndex={
          active.length === 0
            ? 0
            : Math.max(...active.map((t) => t.order_index)) + 1
        }
        onClose={() => setModalOpen(false)}
        onSaved={() => invalidate()}
      />
    </Card>
  );
}

interface TaxonomyRowProps {
  t: Taxonomy;
  isFirst: boolean;
  isLast: boolean;
  disableMoves?: boolean;
  onEdit: () => void;
  onHide: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}

function TaxonomyRow({
  t,
  isFirst,
  isLast,
  disableMoves,
  onEdit,
  onHide,
  onMoveUp,
  onMoveDown,
}: TaxonomyRowProps) {
  const Icon = iconFromName(t.icon_name);
  const color = t.color_hex ?? '#6b7280';
  return (
    <li
      className="flex items-center gap-2 py-2"
      style={{ borderBottom: '1px solid var(--color-border)' }}
    >
      <span
        className="grid place-items-center"
        style={{
          width: 28,
          height: 28,
          borderRadius: 6,
          background: `color-mix(in srgb, ${color} 14%, transparent)`,
          color,
          flex: '0 0 auto',
        }}
      >
        <Icon style={{ fontSize: 14 }} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span style={{ fontSize: 14, fontWeight: 500 }}>{t.label}</span>
          {t.is_default && (
            <Tag bordered={false} style={{ marginRight: 0, fontSize: 11 }}>
              内置
            </Tag>
          )}
        </div>
        <code
          className="font-mono text-[11px]"
          style={{ color: 'var(--color-muted-fg)' }}
        >
          {t.key}
        </code>
      </div>

      {onMoveUp && (
        <Tooltip title="上移">
          <Button
            type="text"
            size="small"
            icon={<ArrowUpOutlined />}
            disabled={isFirst || disableMoves}
            onClick={onMoveUp}
          />
        </Tooltip>
      )}
      {onMoveDown && (
        <Tooltip title="下移">
          <Button
            type="text"
            size="small"
            icon={<ArrowDownOutlined />}
            disabled={isLast || disableMoves}
            onClick={onMoveDown}
          />
        </Tooltip>
      )}
      <Tooltip title="编辑">
        <Button
          type="text"
          size="small"
          icon={<EditOutlined />}
          onClick={onEdit}
        />
      </Tooltip>
      <Tooltip title="移到回收站">
        <Button
          type="text"
          size="small"
          danger
          icon={<DeleteOutlined />}
          onClick={onHide}
        />
      </Tooltip>
    </li>
  );
}

// ───────────────────────────────────────────
// 备份 / 恢复
// ───────────────────────────────────────────

function BackupCard() {
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<{
    payload: BackupPayload;
    filename: string;
  } | null>(null);

  const settingsQ = useQuery({ queryKey: ['settings'], queryFn: getSettings });
  const s = settingsQ.data;
  const s3Configured = !!(
    s?.s3_backup_endpoint &&
    s?.s3_backup_bucket &&
    s?.s3_backup_access_key_id &&
    s?.s3_backup_secret_access_key
  );
  const autoEnabled = !!s?.auto_backup_enabled;
  const lastAutoAt = s?.last_auto_backup_at;

  const downloadMut = useMutation({
    mutationFn: downloadBackup,
    onSuccess: () => toast.success('备份已下载'),
    onError: (e: Error) => toast.error(e.message),
  });

  const restoreMut = useMutation({
    mutationFn: restoreBackup,
    onSuccess: (r) => {
      const total = Object.values(r.counts).reduce((a, b) => a + b, 0);
      toast.success(`恢复成功，共写入 ${total} 条`);
      setPending(null);
      if (inputRef.current) inputRef.current.value = '';
      // 全量替换数据，让所有 react-query 缓存重新拉取
      qc.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleAutoMut = useMutation({
    mutationFn: (next: boolean) =>
      updateSettings({ auto_backup_enabled: next ? '1' : '0' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings'] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const manualAutoMut = useMutation({
    mutationFn: () => triggerAutoBackup({ force: true }),
    onSuccess: (r) => {
      const base = r.key ? r.key.replace(/^backup\//, '') : '完成';
      toast.success(`已上传：${base}`);
      qc.invalidateQueries({ queryKey: ['settings'] });
      qc.invalidateQueries({ queryKey: ['oss-backups'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const ossListQ = useQuery({
    queryKey: ['oss-backups'],
    queryFn: listOssBackups,
    enabled: s3Configured,
    staleTime: 30_000,
  });

  const restoreOssMut = useMutation({
    mutationFn: (key: string) => restoreFromOss(key),
    onSuccess: (r) => {
      const total = Object.values(r.counts).reduce((a, b) => a + b, 0);
      toast.success(`恢复成功，共写入 ${total} 条`);
      qc.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteOssMut = useMutation({
    mutationFn: (key: string) => deleteOssBackup(key),
    onSuccess: () => {
      toast.success('已删除');
      qc.invalidateQueries({ queryKey: ['oss-backups'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const downloadOssMut = useMutation({
    mutationFn: (key: string) => downloadOssBackup(key),
    onError: (e: Error) => toast.error(e.message),
  });

  const handleFile = async (file: File) => {
    try {
      const payload = await parseBackupFile(file);
      setPending({ payload, filename: file.name });
    } catch (e) {
      toast.error((e as Error).message);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const handleConfirm = () => {
    if (!pending) return;
    getModal()?.confirm({
      title: '确认恢复并替换全部数据？',
      content:
        '当前数据库的所有数据（人物、关系、事件、电话、分享、分类、设置）会被永久删除，然后用备份文件里的数据完整替换。该操作无法撤销。',
      okText: '替换',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: () => restoreMut.mutateAsync(pending.payload).catch(() => undefined),
    });
  };

  const handleRestoreOss = (item: OssBackupItem) => {
    const base = item.key.replace(/^backup\//, '');
    getModal()?.confirm({
      title: '从备份存储恢复并替换全部数据？',
      content: (
        <span>
          将用 <b>{base}</b>{' '}
          完整替换当前所有数据。当前数据将被永久删除，无法撤销。
        </span>
      ),
      okText: '替换',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: () =>
        restoreOssMut.mutateAsync(item.key).catch(() => undefined),
    });
  };

  const handleDeleteOss = (item: OssBackupItem) => {
    const base = item.key.replace(/^backup\//, '');
    getModal()?.confirm({
      title: '删除该备份？',
      content: (
        <span>
          对象 <b>{base}</b> 将从备份存储永久移除。
        </span>
      ),
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: () => deleteOssMut.mutateAsync(item.key).catch(() => undefined),
    });
  };

  const tableRows = useMemo(() => {
    if (!pending) return [];
    return (Object.keys(BACKUP_TABLE_LABELS) as BackupTable[]).map((t) => ({
      key: t,
      label: BACKUP_TABLE_LABELS[t],
      count: pending.payload.tables[t]?.length ?? 0,
    }));
  }, [pending]);

  const ossColumns: ColumnsType<OssBackupItem> = useMemo(
    () => [
      {
        title: '文件',
        key: 'key',
        render: (_, it) => (
          <code className="font-mono text-[12px] text-[var(--color-foreground)]">
            {it.key.replace(/^backup\//, '')}
          </code>
        ),
      },
      {
        title: '大小',
        key: 'size',
        width: 100,
        render: (_, it) => (
          <span className="text-[12px] tabular-nums text-[var(--color-muted-fg)]">
            {formatBytes(it.size)}
          </span>
        ),
      },
      {
        title: '时间',
        key: 'lastModified',
        width: 200,
        render: (_, it) => (
          <span className="flex flex-col text-[12px] tabular-nums">
            <span className="text-[var(--color-foreground)]">
              {formatTimestamp(it.lastModified)}
            </span>
            <span className="text-[var(--color-muted-fg)]">
              {formatRelative(it.lastModified)}
            </span>
          </span>
        ),
      },
      {
        title: '操作',
        key: 'actions',
        width: 130,
        render: (_, it) => (
          <div className="flex gap-1">
            <Tooltip title="恢复">
              <Button
                type="text"
                size="small"
                icon={<UndoOutlined />}
                onClick={() => handleRestoreOss(it)}
                loading={
                  restoreOssMut.isPending &&
                  restoreOssMut.variables === it.key
                }
              />
            </Tooltip>
            <Tooltip title="下载">
              <Button
                type="text"
                size="small"
                icon={<CloudDownloadOutlined />}
                onClick={() => downloadOssMut.mutate(it.key)}
                loading={
                  downloadOssMut.isPending &&
                  downloadOssMut.variables === it.key
                }
              />
            </Tooltip>
            <Tooltip title="删除">
              <Button
                type="text"
                size="small"
                danger
                icon={<DeleteOutlined />}
                onClick={() => handleDeleteOss(it)}
                loading={
                  deleteOssMut.isPending &&
                  deleteOssMut.variables === it.key
                }
              />
            </Tooltip>
          </div>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [restoreOssMut.isPending, downloadOssMut.isPending, deleteOssMut.isPending]
  );

  const ossList = ossListQ.data?.data ?? [];

  return (
    <Card
      title={
        <span className="inline-flex items-center gap-2">
          <DatabaseOutlined />
          备份 / 恢复
        </span>
      }
      style={{ border: '1px solid var(--color-border)', borderRadius: 10 }}
      styles={{ header: { borderBottom: '1px solid var(--color-border)' } }}
    >
      {/* ── 1. 自动备份开关 + 即时 action ── */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3">
          <div className="text-[14px] font-medium text-[var(--color-foreground)]">
            自动备份
          </div>
          <Tooltip
            title={s3Configured ? '' : '需先配置备份存储'}
            placement="left"
          >
            <Switch
              checked={autoEnabled}
              disabled={!s3Configured || toggleAutoMut.isPending}
              onChange={(v) => toggleAutoMut.mutate(v)}
              loading={toggleAutoMut.isPending}
            />
          </Tooltip>
        </div>
        <p className="m-0 text-[12px] text-[var(--color-muted-fg)]">
          打开后，每天访问 App 时若距上次备份超过 24
          小时，会自动把整库 JSON 推送到备份存储，最多保留 7 份。也可以手动点「立即备份」推送，或导出 JSON 到本地。
        </p>
        <input
          ref={inputRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleFile(f);
          }}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="primary"
            icon={<CloudSyncOutlined />}
            onClick={() => manualAutoMut.mutate()}
            loading={manualAutoMut.isPending}
            disabled={!s3Configured}
          >
            立即备份
          </Button>
          <Button
            icon={<CloudDownloadOutlined />}
            onClick={() => downloadMut.mutate()}
            loading={downloadMut.isPending}
          >
            下载到本地
          </Button>
          <Button
            icon={<ImportOutlined />}
            onClick={() => inputRef.current?.click()}
          >
            从本地文件恢复
          </Button>
          <span className="ml-auto text-[12px] text-[var(--color-muted-fg)]">
            {lastAutoAt
              ? `上次自动备份：${formatRelative(lastAutoAt)}`
              : '尚未自动备份'}
          </span>
        </div>

        {pending && (
          <div
            className="mt-2 flex flex-col gap-3 px-3 py-3"
            style={{
              border: '1px solid var(--color-border)',
              borderRadius: 8,
              background: 'var(--color-surface)',
            }}
          >
            <div className="flex flex-col gap-1 text-[12px]">
              <div>
                <span className="text-[var(--color-muted-fg)]">文件：</span>
                <span className="text-[var(--color-foreground)]">
                  {pending.filename}
                </span>
              </div>
              <div>
                <span className="text-[var(--color-muted-fg)]">版本：</span>
                <code className="font-mono text-[var(--color-foreground)]">
                  {pending.payload.version}
                </code>
                <span className="ml-3 text-[var(--color-muted-fg)]">
                  导出时间：
                </span>
                <span className="text-[var(--color-foreground)]">
                  {formatTimestamp(pending.payload.exported_at)}
                </span>
              </div>
            </div>

            <ul className="m-0 grid list-none grid-cols-2 gap-x-4 gap-y-1 p-0 sm:grid-cols-4">
              {tableRows.map((r) => (
                <li
                  key={r.key}
                  className="flex items-baseline justify-between text-[12px]"
                >
                  <span className="text-[var(--color-muted-fg)]">{r.label}</span>
                  <span className="font-medium tabular-nums text-[var(--color-foreground)]">
                    {r.count}
                  </span>
                </li>
              ))}
            </ul>

            <div className="flex items-center gap-2">
              <Button
                danger
                type="primary"
                icon={<ImportOutlined />}
                onClick={handleConfirm}
                loading={restoreMut.isPending}
              >
                确认恢复并替换全部数据
              </Button>
              <Button
                type="text"
                onClick={() => {
                  setPending(null);
                  if (inputRef.current) inputRef.current.value = '';
                }}
                disabled={restoreMut.isPending}
              >
                取消
              </Button>
            </div>
          </div>
        )}
      </div>

      <Divider style={{ margin: '20px 0', borderColor: 'var(--color-border)' }} />

      {/* ── 2. OSS 备份列表 ── */}
      <div className="flex flex-col gap-2">
        <div className="text-[14px] font-medium text-[var(--color-foreground)]">
          备份存储中的文件
        </div>
        {!s3Configured ? (
          <div className="flex flex-col gap-1 text-[12px] text-[var(--color-muted-fg)]">
            <span>需先在「设置 → 存储」配置备份存储。</span>
            <span>
              如果之前有备份过，对象存储里的历史文件并不会被删除——只是这里没有凭证读不到。重新填回同一个 Endpoint / Bucket / AccessKey 并保存即可重新看到并恢复。
            </span>
          </div>
        ) : ossListQ.isLoading ? (
          <div className="py-4 text-center text-[13px] text-[var(--color-muted-fg)]">
            加载中…
          </div>
        ) : ossListQ.isError ? (
          <div
            className="flex flex-col gap-2 px-3 py-3"
            style={{
              border: '1px solid var(--color-danger)',
              borderRadius: 8,
              background: 'var(--color-danger-soft)',
            }}
          >
            <p className="m-0 text-[13px]" style={{ color: 'var(--color-danger)' }}>
              {(ossListQ.error as Error)?.message ?? '读取对象存储失败'}
            </p>
            <p className="m-0 text-[12px] text-[var(--color-muted-fg)]">
              常见原因：AccessKey 缺少 <code>s3:ListBucket</code> 权限。请在控制台给该 Key 加上对应 bucket 的列表权限后重试。
            </p>
            <div>
              <Button
                size="small"
                onClick={() => ossListQ.refetch()}
                loading={ossListQ.isFetching}
              >
                重试
              </Button>
            </div>
          </div>
        ) : ossList.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
              <div className="flex flex-col gap-1 text-[13px] text-[var(--color-muted-fg)]">
                <span>备份存储里还没有匹配的文件。</span>
                {ossListQ.data?.prefix && (
                  <span className="text-[12px]">
                    查找前缀：<code>{ossListQ.data.prefix}</code>
                    。如果云端文件不在此前缀下，请到「设置 → 存储」修改备份路径模板。
                  </span>
                )}
              </div>
            }
          />
        ) : (
          <Table<OssBackupItem>
            dataSource={ossList}
            columns={ossColumns}
            rowKey="key"
            pagination={false}
            size="small"
            style={{
              border: '1px solid var(--color-border)',
              borderRadius: 10,
              overflow: 'hidden',
            }}
          />
        )}
      </div>
    </Card>
  );
}

function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

// ───────────────────────────────────────────
// 回收站（人物 + 分类）
// ───────────────────────────────────────────

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

function formatDeletedAt(ts: number | null): string {
  if (!ts) return '—';
  const d = new Date(ts * 1000);
  return d.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function TrashCard() {
  return (
    <Card
      title={
        <span className="inline-flex items-center gap-2">
          <RestOutlined />
          回收站
        </span>
      }
      style={{ border: '1px solid var(--color-border)', borderRadius: 10 }}
      styles={{ header: { borderBottom: '1px solid var(--color-border)' } }}
    >
      <Tabs
        defaultActiveKey="persons"
        items={[
          {
            key: 'persons',
            label: (
              <span className="inline-flex items-center gap-1.5">
                <TrashPersonsCount />
                人物
              </span>
            ),
            children: <TrashPersons />,
          },
          {
            key: 'taxonomies',
            label: (
              <span className="inline-flex items-center gap-1.5">
                <TrashTaxonomiesCount />
                分类
              </span>
            ),
            children: <TrashTaxonomies />,
          },
        ]}
      />
    </Card>
  );
}

function TrashPersonsCount() {
  const q = useQuery({
    queryKey: ['persons', { deleted: true }],
    queryFn: () => listPersons({ deleted: true }),
  });
  const n = q.data?.length ?? 0;
  if (n === 0) return null;
  return <Badge count={n} size="small" />;
}

function TrashTaxonomiesCount() {
  const eventQ = useQuery({
    queryKey: ['taxonomies', 'event_type', 'all'],
    queryFn: () => listTaxonomies('event_type', { includeHidden: true }),
  });
  const relQ = useQuery({
    queryKey: ['taxonomies', 'social_relation', 'all'],
    queryFn: () => listTaxonomies('social_relation', { includeHidden: true }),
  });
  const n =
    (eventQ.data ?? []).filter((t) => t.deleted_at).length +
    (relQ.data ?? []).filter((t) => t.deleted_at).length;
  if (n === 0) return null;
  return <Badge count={n} size="small" />;
}

function TrashPersons() {
  const qc = useQueryClient();
  const trashQ = useQuery({
    queryKey: ['persons', { deleted: true }],
    queryFn: () => listPersons({ deleted: true }),
  });

  const restoreMut = useMutation({
    mutationFn: restorePerson,
    onSuccess: () => {
      toast.success('已恢复');
      qc.invalidateQueries({ queryKey: ['persons'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const purgeMut = useMutation({
    mutationFn: purgePerson,
    onSuccess: () => {
      toast.success('已彻底删除');
      qc.invalidateQueries({ queryKey: ['persons'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const confirmRestore = (person: Person) => {
    getModal()?.confirm({
      title: `恢复 ${personDisplayName(person)}？`,
      content: '该人物将重新出现在人物列表中。',
      okText: '确认恢复',
      cancelText: '取消',
      onOk: () => restoreMut.mutate(person.id),
    });
  };

  const confirmPurge = (person: Person) => {
    getModal()?.confirm({
      title: `彻底删除 ${personDisplayName(person)}？`,
      content: '这会永久删除该人物及其所有关系、电话数据，无法恢复。',
      okText: '彻底删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: () => purgeMut.mutate(person.id),
    });
  };

  const columns: ColumnsType<Person> = [
    {
      title: '姓名',
      key: 'name',
      render: (_, p) => (
        <span className="font-medium text-[var(--color-foreground)]">
          {personDisplayName(p)}
        </span>
      ),
    },
    {
      title: '档位',
      key: 'kinship',
      width: 80,
      render: (_, p) => {
        const ks = KIN_STYLE[p.kinship] ?? KIN_STYLE.social;
        return (
          <Tag style={{ color: ks.color, background: ks.bg, border: 'none' }}>
            {kinshipLabel(p.kinship)}
          </Tag>
        );
      },
    },
    {
      title: '删除时间',
      key: 'deleted_at',
      width: 160,
      render: (_, p) => (
        <span className="text-[12px] text-[var(--color-muted-fg)] tabular-nums">
          {formatDeletedAt(p.deleted_at)}
        </span>
      ),
    },
    {
      title: '操作',
      key: 'actions',
      width: 140,
      render: (_, p) => (
        <div className="flex gap-1">
          <Tooltip title="恢复">
            <Button
              type="text"
              size="small"
              icon={<UndoOutlined />}
              onClick={() => confirmRestore(p)}
              loading={restoreMut.isPending}
            >
              恢复
            </Button>
          </Tooltip>
          <Tooltip title="彻底删除">
            <Button
              type="text"
              size="small"
              danger
              icon={<DeleteOutlined />}
              onClick={() => confirmPurge(p)}
            />
          </Tooltip>
        </div>
      ),
    },
  ];

  const data = trashQ.data ?? [];

  if (data.length === 0) {
    return (
      <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description={
          <span className="text-[13px] text-[var(--color-muted-fg)]">
            没有已删除的人物
          </span>
        }
      />
    );
  }

  return (
    <Table<Person>
      dataSource={data}
      columns={columns}
      rowKey="id"
      pagination={false}
      size="small"
      style={{
        border: '1px solid var(--color-border)',
        borderRadius: 10,
        overflow: 'hidden',
      }}
    />
  );
}

function TrashTaxonomies() {
  const qc = useQueryClient();

  const eventQ = useQuery({
    queryKey: ['taxonomies', 'event_type', 'all'],
    queryFn: () => listTaxonomies('event_type', { includeHidden: true }),
  });
  const relQ = useQuery({
    queryKey: ['taxonomies', 'social_relation', 'all'],
    queryFn: () => listTaxonomies('social_relation', { includeHidden: true }),
  });

  const invalidate = (domain: TaxonomyDomain) => {
    qc.invalidateQueries({ queryKey: ['taxonomies', domain] });
    qc.invalidateQueries({ queryKey: ['taxonomies', domain, 'all'] });
  };

  const showMut = useMutation({
    mutationFn: ({ id }: { id: number; domain: TaxonomyDomain }) =>
      showTaxonomy(id),
    onSuccess: (_d, v) => {
      toast.success('已恢复');
      invalidate(v.domain);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const purgeMut = useMutation({
    mutationFn: ({ id }: { id: number; domain: TaxonomyDomain }) =>
      purgeTaxonomy(id),
    onSuccess: (_d, v) => {
      toast.success('已彻底删除');
      invalidate(v.domain);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const items = useMemo(() => {
    const out: Array<{ t: Taxonomy; domain: TaxonomyDomain }> = [];
    for (const t of eventQ.data ?? []) {
      if (t.deleted_at) out.push({ t, domain: 'event_type' });
    }
    for (const t of relQ.data ?? []) {
      if (t.deleted_at) out.push({ t, domain: 'social_relation' });
    }
    // 按删除时间倒序（最近删的在前）
    out.sort((a, b) => (b.t.deleted_at ?? 0) - (a.t.deleted_at ?? 0));
    return out;
  }, [eventQ.data, relQ.data]);

  const confirmPurge = (t: Taxonomy, domain: TaxonomyDomain) => {
    getModal()?.confirm({
      title: <span>彻底删除分类 <b>{t.label}</b>？</span>,
      content: '永久删除，无法恢复。已经使用该分类的事件/关系仍会保留 key 值。',
      okText: '彻底删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: () => purgeMut.mutate({ id: t.id, domain }),
    });
  };

  if (items.length === 0) {
    return (
      <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description={
          <span className="text-[13px] text-[var(--color-muted-fg)]">
            没有已隐藏/删除的分类
          </span>
        }
      />
    );
  }

  return (
    <ul className="m-0 flex list-none flex-col p-0">
      {items.map(({ t, domain }) => {
        const Icon = iconFromName(t.icon_name);
        const color = t.color_hex ?? '#6b7280';
        return (
          <li
            key={`${domain}-${t.id}`}
            className="flex items-center gap-2 py-2"
            style={{ borderBottom: '1px solid var(--color-border)' }}
          >
            <span
              className="grid place-items-center"
              style={{
                width: 28,
                height: 28,
                borderRadius: 6,
                background: `color-mix(in srgb, ${color} 14%, transparent)`,
                color,
                flex: '0 0 auto',
                opacity: 0.5,
              }}
            >
              <Icon style={{ fontSize: 14 }} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <span
                  style={{ fontSize: 14, fontWeight: 500, opacity: 0.6 }}
                >
                  {t.label}
                </span>
                <Tag bordered={false} style={{ marginRight: 0, fontSize: 11 }}>
                  {DOMAIN_META[domain].label}
                </Tag>
                {t.is_default && (
                  <Tag bordered={false} style={{ marginRight: 0, fontSize: 11 }}>
                    内置
                  </Tag>
                )}
              </div>
              <div className="flex items-center gap-2 text-[11px] text-[var(--color-muted-fg)]">
                <code className="font-mono">{t.key}</code>
                <span>·</span>
                <span className="tabular-nums">
                  {formatDeletedAt(t.deleted_at)}
                </span>
              </div>
            </div>
            <Tooltip title="恢复">
              <Button
                type="text"
                size="small"
                icon={<UndoOutlined />}
                onClick={() => showMut.mutate({ id: t.id, domain })}
                loading={showMut.isPending}
              >
                恢复
              </Button>
            </Tooltip>
            {!t.is_default && (
              <Tooltip title="彻底删除">
                <Button
                  type="text"
                  size="small"
                  danger
                  icon={<DeleteOutlined />}
                  onClick={() => confirmPurge(t, domain)}
                />
              </Tooltip>
            )}
          </li>
        );
      })}
    </ul>
  );
}
