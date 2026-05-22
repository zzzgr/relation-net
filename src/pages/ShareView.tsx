import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import {
  DeploymentUnitOutlined,
  DownloadOutlined,
  LockOutlined,
  MoonOutlined,
  MoreOutlined,
  SunOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { Button, Card, Dropdown, Form, Input, Tooltip } from 'antd';
import { accessShare, type ShareData } from '@/api/shares';
import FamilyChartView, { type FamilyChartHandle } from '@/components/FamilyChartView';
import { exportFamilyChartPng } from '@/lib/exportImage';
import PersonProfileView from '@/components/PersonProfileView';
import { KINSHIPS, isParentRelation, isSpouseRelation } from '@/lib/relations';
import { setAMapConfig } from '@/lib/amap';
import { useThemeMode } from '@/lib/theme';
import type { Person, Relation } from '@/types';
import { type Datum as FCDatum } from 'family-chart';

function ThemeToggle() {
  const { mode, setMode } = useThemeMode();
  const isDark = mode === 'dark';
  return (
    <Tooltip title={isDark ? '切换到亮色' : '切换到暗色'}>
      <Button
        type="text"
        size="small"
        icon={isDark ? <SunOutlined /> : <MoonOutlined />}
        onClick={() => setMode(isDark ? 'light' : 'dark')}
        aria-label="切换主题"
      />
    </Tooltip>
  );
}

function personDisplayName(p: Person): string {
  return p.real_name || p.standard_title || p.dialect_title || p.nickname || `#${p.id}`;
}

function personSubtitle(p: Person): string | null {
  if (p.real_name) return p.standard_title || p.dialect_title || p.nickname || null;
  return null;
}

function buildFamilyChartData(persons: Person[], relations: Relation[]): FCDatum[] {
  const visiblePersons = persons.filter((p) => p.kinship !== 'social');
  const visibleIds = new Set(visiblePersons.map((p) => p.id));
  const parentsOf = new Map<number, Set<number>>();
  const childrenOf = new Map<number, Set<number>>();
  const spousesOf = new Map<number, Set<number>>();
  const orderOfEdge = new Map<string, number>();
  const edgeKey = (parentId: number, childId: number) => `${parentId}->${childId}`;

  const addParent = (parentId: number, childId: number, birthOrder: number | null = null) => {
    if (!visibleIds.has(parentId) || !visibleIds.has(childId) || parentId === childId) return;
    if (!parentsOf.has(childId)) parentsOf.set(childId, new Set());
    parentsOf.get(childId)!.add(parentId);
    if (!childrenOf.has(parentId)) childrenOf.set(parentId, new Set());
    childrenOf.get(parentId)!.add(childId);
    if (birthOrder !== null && birthOrder > 0) {
      const k = edgeKey(parentId, childId);
      const existing = orderOfEdge.get(k);
      if (existing === undefined || birthOrder < existing) orderOfEdge.set(k, birthOrder);
    }
  };

  const addSpouse = (a: number, b: number) => {
    if (!visibleIds.has(a) || !visibleIds.has(b) || a === b) return;
    if (!spousesOf.has(a)) spousesOf.set(a, new Set());
    if (!spousesOf.has(b)) spousesOf.set(b, new Set());
    spousesOf.get(a)!.add(b);
    spousesOf.get(b)!.add(a);
  };

  for (const r of relations) {
    if (isParentRelation(r.relation_type)) addParent(r.from_person_id, r.to_person_id, r.birth_order);
    else if (isSpouseRelation(r.relation_type)) addSpouse(r.from_person_id, r.to_person_id);
  }
  for (const ps of parentsOf.values()) {
    const arr = Array.from(ps);
    for (let i = 0; i < arr.length; i++)
      for (let j = i + 1; j < arr.length; j++) addSpouse(arr[i], arr[j]);
  }
  for (const [a, spouseSet] of spousesOf) {
    const aChildren = childrenOf.get(a);
    if (!aChildren || aChildren.size === 0) continue;
    for (const b of spouseSet)
      for (const c of aChildren) addParent(b, c, orderOfEdge.get(edgeKey(a, c)) ?? null);
  }

  const sortedChildren = (parentId: number): string[] => {
    const set = childrenOf.get(parentId);
    if (!set) return [];
    return Array.from(set)
      .sort((a, b) => {
        const ao = orderOfEdge.get(edgeKey(parentId, a)) ?? Number.MAX_SAFE_INTEGER;
        const bo = orderOfEdge.get(edgeKey(parentId, b)) ?? Number.MAX_SAFE_INTEGER;
        return ao !== bo ? ao - bo : a - b;
      })
      .map(String);
  };

  return visiblePersons.map((p) => ({
    id: String(p.id),
    rels: {
      parents: Array.from(parentsOf.get(p.id) ?? []).map(String),
      spouses: Array.from(spousesOf.get(p.id) ?? []).map(String),
      children: sortedChildren(p.id),
    },
    data: {
      gender: p.gender === 'female' ? 'F' : 'M',
      'first name': personDisplayName(p),
      'last name': personSubtitle(p) ?? '',
      birthday: p.birth_date ?? '',
      avatar: p.avatar_url ?? '',
    },
  }));
}

function restrictToFamilyTree(rootId: string, fullData: FCDatum[]): FCDatum[] {
  const byId = new Map(fullData.map((d) => [d.id, d]));
  if (!byId.has(rootId)) return [];
  const visited = new Set<string>([rootId]);
  const queue: string[] = [rootId];
  while (queue.length) {
    const cur = queue.shift()!;
    const node = byId.get(cur);
    if (!node) continue;
    for (const c of node.rels.children ?? []) if (byId.has(c) && !visited.has(c)) { visited.add(c); queue.push(c); }
    for (const s of node.rels.spouses ?? []) if (byId.has(s) && !visited.has(s)) { visited.add(s); queue.push(s); }
  }
  return fullData
    .filter((d) => visited.has(d.id))
    .map((d) => ({
      ...d,
      rels: {
        ...d.rels,
        parents: (d.rels.parents ?? []).filter((p) => visited.has(p)),
        spouses: (d.rels.spouses ?? []).filter((s) => visited.has(s)),
        children: (d.rels.children ?? []).filter((c) => visited.has(c)),
      },
    }));
}

// 折叠 hiddenIds 中的节点：将它们子孙整树丢弃；节点本身保留但 children 清空 + 加上"已折叠"提示
function applyHiddenFilter(
  fcData: FCDatum[],
  hiddenIds: Set<string>
): FCDatum[] {
  if (hiddenIds.size === 0) return fcData;
  const byId = new Map(fcData.map((d) => [d.id, d]));
  const dropped = new Set<string>();
  const queue: string[] = [];
  for (const h of hiddenIds) {
    const node = byId.get(h);
    if (!node) continue;
    for (const c of node.rels.children ?? []) queue.push(c);
  }
  while (queue.length) {
    const cur = queue.shift()!;
    if (dropped.has(cur)) continue;
    dropped.add(cur);
    const node = byId.get(cur);
    for (const c of node?.rels.children ?? []) queue.push(c);
  }
  return fcData
    .filter((d) => !dropped.has(d.id))
    .map((d) => {
      const isHidden = hiddenIds.has(d.id);
      return {
        ...d,
        rels: {
          ...d.rels,
          parents: (d.rels.parents ?? []).filter((p) => !dropped.has(p)),
          spouses: (d.rels.spouses ?? []).filter((s) => !dropped.has(s)),
          children: isHidden
            ? []
            : (d.rels.children ?? []).filter((c) => !dropped.has(c)),
        },
        data: isHidden
          ? { ...d.data, 'last name': '⊕ 已折叠子孙' }
          : d.data,
      };
    });
}

const SHARE_PW_PREFIX = 'share_pw_';

function readBootstrapPassword(token: string | undefined, searchParams: URLSearchParams): string | null {
  if (!token) return null;
  const fromUrl = searchParams.get('p');
  if (fromUrl) return fromUrl;
  try {
    return sessionStorage.getItem(SHARE_PW_PREFIX + token);
  } catch {
    return null;
  }
}

export default function ShareView() {
  const { token } = useParams<{ token: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ShareData | null>(null);
  const [bootstrapping, setBootstrapping] = useState(() => readBootstrapPassword(token, searchParams) !== null);

  const chartRef = useRef<FamilyChartHandle>(null);
  const [exporting, setExporting] = useState(false);

  // 折叠 / 展开子分支
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const toggleHide = useCallback((id: number) => {
    const key = String(id);
    setHiddenIds((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const submitPassword = async (password: string, fromCache: boolean): Promise<void> => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const result = await accessShare(token, password);
      setData(result);
      try {
        sessionStorage.setItem(SHARE_PW_PREFIX + token, password);
      } catch {
        /* sessionStorage 可能被禁用，忽略 */
      }
      if (searchParams.has('p')) {
        setSearchParams({}, { replace: true });
      }
    } catch (e: unknown) {
      if (fromCache) {
        try {
          sessionStorage.removeItem(SHARE_PW_PREFIX + token);
        } catch { /* ignore */ }
      } else {
        setError((e as Error).message);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!bootstrapping) return;
    const pw = readBootstrapPassword(token, searchParams);
    if (!pw) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    submitPassword(pw, true).finally(() => setBootstrapping(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // 分享页拿到 person 模式数据后,把后端附带的 amap 凭据注入 amap loader,
  // 这样 MiniMapView 才能加载小地图。
  useEffect(() => {
    if (!data || data.mode !== 'person') return;
    setAMapConfig(data.amap_key ?? undefined, data.amap_security_code ?? undefined);
  }, [data]);

  const onFinish = (values: { password: string }) => submitPassword(values.password, false);

  const handleExport = async () => {
    const el = chartRef.current?.getContainer();
    if (!el) return;
    setExporting(true);
    try {
      const name = data?.title || '家族树';
      await exportFamilyChartPng(el, `${name}.png`);
    } catch {
      /* silent in share page */
    } finally {
      setExporting(false);
    }
  };

  if (!data) {
    if (bootstrapping) {
      return (
        <div
          className="grid min-h-dvh place-items-center px-4 text-[13px] text-[var(--color-muted-fg)]"
          style={{ background: 'var(--color-background)' }}
        >
          打开中…
        </div>
      );
    }
    return (
      <div
        className="relative grid min-h-dvh place-items-center px-4"
        style={{ background: 'var(--color-background)' }}
      >
        <div className="absolute right-4 top-4">
          <ThemeToggle />
        </div>
        <Card
          className="w-full"
          style={{ maxWidth: 400, border: '1px solid var(--color-border)', borderRadius: 12 }}
          styles={{ body: { padding: 32 } }}
        >
          <div className="flex flex-col items-center gap-3 pb-5 text-center">
            <span
              className="grid h-12 w-12 place-items-center rounded-lg text-[22px]"
              style={{ background: 'var(--color-accent-soft)', color: 'var(--color-accent-strong)' }}
            >
              <LockOutlined />
            </span>
            <h1 className="m-0 text-[20px] font-semibold tracking-tight text-[var(--color-foreground)]">
              分享内容
            </h1>
            <p className="m-0 text-[13px] text-[var(--color-muted-fg)]">
              输入访问密码查看
            </p>
          </div>

          <Form onFinish={onFinish} layout="vertical" requiredMark={false} autoComplete="off">
            <Form.Item
              name="password"
              rules={[{ required: true, message: '请输入访问密码' }]}
            >
              <Input.Password
                size="middle"
                prefix={<LockOutlined style={{ color: 'var(--color-muted-fg)' }} />}
                placeholder="访问密码"
                autoComplete="new-password"
                autoFocus
              />
            </Form.Item>
            {error && (
              <p className="m-0 mb-3 text-[13px]" style={{ color: 'var(--color-danger)' }}>
                {error}
              </p>
            )}
            <Button type="primary" htmlType="submit" size="middle" block loading={loading}>
              查看
            </Button>
          </Form>
        </Card>
      </div>
    );
  }

  // ─── person 模式 ───
  if (data.mode === 'person') {
    const title = data.title || `${data.person.real_name || data.person.dialect_title || '人物'} 的资料`;
    return (
      <div
        className="flex min-h-dvh flex-col"
        style={{ background: 'var(--color-background)' }}
      >
        <header
          className="flex shrink-0 items-center gap-3 border-b px-5 py-3"
          style={{ borderColor: 'var(--color-border)' }}
        >
          <span
            className="grid h-7 w-7 place-items-center rounded-md text-[14px]"
            style={{ background: 'var(--color-accent-soft)', color: 'var(--color-accent-strong)' }}
          >
            <UserOutlined />
          </span>
          <h1 className="m-0 text-[16px] font-semibold tracking-tight text-[var(--color-foreground)]">
            {title}
          </h1>
          <div className="ml-auto">
            <ThemeToggle />
          </div>
        </header>
        <div className="min-h-0 flex-1">
          <PersonProfileView
            person={data.person}
            phones={data.phones}
            addresses={data.addresses ?? []}
            events={data.events}
            visibleFields={data.visible_fields}
            eventTypeTaxonomies={data.event_type_taxonomies ?? []}
          />
        </div>
      </div>
    );
  }

  // ─── tree 模式 ───
  const fcDataRaw = buildFamilyChartData(data.persons, data.relations);
  const rootId = String(data.root_person_id);
  const fcDataLimited = restrictToFamilyTree(rootId, fcDataRaw);
  const fcData = applyHiddenFilter(fcDataLimited, hiddenIds);
  const rootPerson = data.persons.find((p) => p.id === data.root_person_id);
  const title = data.title || (rootPerson ? `${personDisplayName(rootPerson)} 的家族树` : '家族树');

  return (
    <div
      className="flex h-dvh flex-col overflow-hidden"
      style={{ background: 'var(--color-background)' }}
    >
      <header
        className="flex shrink-0 items-center gap-3 border-b px-5 py-3"
        style={{ borderColor: 'var(--color-border)' }}
      >
        <span
          className="grid h-7 w-7 place-items-center rounded-md text-[14px]"
          style={{ background: 'var(--color-accent-soft)', color: 'var(--color-accent-strong)' }}
        >
          <DeploymentUnitOutlined />
        </span>
        <h1 className="m-0 text-[16px] font-semibold tracking-tight text-[var(--color-foreground)]">
          {title}
        </h1>
        {hiddenIds.size > 0 && (
          <Button size="small" onClick={() => setHiddenIds(new Set())}>
            展开全部 ({hiddenIds.size} 折叠中)
          </Button>
        )}
        <Dropdown
          menu={{
            items: [
              {
                key: 'export',
                icon: <DownloadOutlined />,
                label: exporting ? '导出中…' : '导出为图片',
                disabled: exporting,
                onClick: handleExport,
              },
            ],
          }}
          trigger={['click']}
          placement="bottomRight"
        >
          <Button type="text" size="small" icon={<MoreOutlined />} aria-label="更多操作" />
        </Dropdown>
        <div className="ml-auto hidden items-center gap-2 sm:flex">
          {KINSHIPS.map((k) => (
            <span
              key={k.key}
              className="inline-flex items-center gap-1 text-[11px] text-[var(--color-muted-fg)]"
            >
              <span className="inline-block h-2 w-2 rounded-full" style={{ background: k.color }} />
              {k.label}
            </span>
          ))}
        </div>
        <div className="ml-auto sm:ml-0">
          <ThemeToggle />
        </div>
      </header>

      <div className="min-h-0 flex-1" style={{ background: 'var(--color-card)' }}>
        {fcData.length > 0 ? (
          <FamilyChartView
            ref={chartRef}
            data={fcData}
            mainId={rootId}
            hiddenIds={hiddenIds}
            onToggleHide={toggleHide}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-[var(--color-muted-fg)]">
            暂无数据
          </div>
        )}
      </div>
    </div>
  );
}
