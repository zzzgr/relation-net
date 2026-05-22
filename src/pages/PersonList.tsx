import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ManOutlined,
  PlusOutlined,
  SearchOutlined,
  SortAscendingOutlined,
  UserAddOutlined,
  WomanOutlined,
} from '@ant-design/icons';
import { Button, Input, Select, Segmented, Skeleton } from 'antd';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PersonCard from '@/components/PersonCard';
import {
  deletePerson,
  listPersons,
  type ListPersonsParams,
} from '@/api/persons';
import { getSettings } from '@/api/settings';
import { KINSHIPS } from '@/lib/relations';
import type { Kinship } from '@/lib/relations';
import { toast } from '@/lib/message';
import type { Person } from '@/types';

type KinshipFilter = 'all' | Kinship;
type GenderFilter = 'all' | 'male' | 'female';
type SortKey = 'default' | 'birthday_soon' | 'created_desc' | 'created_asc';

function daysUntilBirthday(p: Person): number | null {
  if (!p.birth_date) return null;
  const parts = p.birth_date.split('-');
  if (parts.length < 3) return null;
  const month = Number(parts[1]);
  const day = Number(parts[2]);
  if (!month || !day) return null;
  const now = new Date();
  const thisYear = now.getFullYear();
  let next = new Date(thisYear, month - 1, day);
  if (next.getTime() < now.getTime() - 86400000) {
    next = new Date(thisYear + 1, month - 1, day);
  }
  return Math.ceil((next.getTime() - now.getTime()) / 86400000);
}

function sortPersons(persons: Person[], key: SortKey): Person[] {
  if (key === 'default') return persons;
  const arr = [...persons];
  if (key === 'created_desc') return arr.sort((a, b) => b.created_at - a.created_at);
  if (key === 'created_asc') return arr.sort((a, b) => a.created_at - b.created_at);
  if (key === 'birthday_soon') {
    return arr.sort((a, b) => {
      const da = daysUntilBirthday(a) ?? 9999;
      const db = daysUntilBirthday(b) ?? 9999;
      return da - db;
    });
  }
  return arr;
}

export default function PersonList() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [kinshipFilter, setKinshipFilter] = useState<KinshipFilter>('all');
  const [genderFilter, setGenderFilter] = useState<GenderFilter>('all');
  const [sortKey, setSortKey] = useState<SortKey>('default');

  const params: ListPersonsParams = {
    q: q || undefined,
    kinship: kinshipFilter === 'all' ? undefined : kinshipFilter,
    gender: genderFilter === 'all' ? undefined : genderFilter,
  };

  const personsQ = useQuery({
    queryKey: ['persons', params],
    queryFn: () => listPersons(params),
  });
  const settingsQ = useQuery({ queryKey: ['settings'], queryFn: getSettings });
  const rootSet = new Set(settingsQ.data?.family_roots ?? []);

  const deleteMut = useMutation({
    mutationFn: deletePerson,
    onSuccess: () => {
      toast.success('已移入回收站');
      qc.invalidateQueries({ queryKey: ['persons'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const sorted = useMemo(
    () => sortPersons(personsQ.data ?? [], sortKey),
    [personsQ.data, sortKey]
  );

  const total = personsQ.data?.length ?? 0;
  const hasFilter = q !== '' || kinshipFilter !== 'all' || genderFilter !== 'all';

  return (
    <div className="flex flex-col gap-5">
      <p className="m-0 text-[13px] text-[var(--color-muted-fg)]">
        {personsQ.isLoading ? '正在加载…' : `共 ${total} 人`}
      </p>

      {/* —— 控件条 —— */}
      <div
        className="sticky z-20 -mx-4 flex flex-col gap-3 px-4 py-3 backdrop-blur md:-mx-6 md:flex-row md:items-center md:gap-3 md:px-6"
        style={{
          top: 52,
          background: 'color-mix(in srgb, var(--color-background) 85%, transparent)',
          borderBottom: '1px solid var(--color-border)',
        }}
      >
        <div className="flex-1 md:max-w-xs">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="搜索"
            allowClear
            prefix={
              <SearchOutlined style={{ color: 'var(--color-muted-fg)' }} />
            }
          />
        </div>

        <Segmented<KinshipFilter>
          value={kinshipFilter}
          onChange={(v) => setKinshipFilter(v as KinshipFilter)}
          options={[
            { label: '全部', value: 'all' },
            ...KINSHIPS.map((k) => ({
              value: k.key,
              label: (
                <span className="inline-flex items-center gap-1.5">
                  <span
                    className="inline-block h-2 w-2 rounded-full"
                    style={{ background: k.color }}
                  />
                  {k.label}
                </span>
              ),
            })),
          ]}
        />

        <Segmented<GenderFilter>
          value={genderFilter}
          onChange={(v) => setGenderFilter(v as GenderFilter)}
          options={[
            { label: '全部', value: 'all' },
            { label: <span className="inline-flex items-center gap-1"><ManOutlined />男</span>, value: 'male' },
            { label: <span className="inline-flex items-center gap-1"><WomanOutlined />女</span>, value: 'female' },
          ]}
        />

        <Select<SortKey>
          value={sortKey}
          onChange={setSortKey}
          size="small"
          style={{ width: 130 }}
          suffixIcon={<SortAscendingOutlined />}
          options={[
            { label: '默认排序', value: 'default' },
            { label: '生日最近', value: 'birthday_soon' },
            { label: '最新创建', value: 'created_desc' },
            { label: '最早创建', value: 'created_asc' },
          ]}
        />

        <div className="md:ml-auto">
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => navigate('/persons/new')}
          >
            新建人物
          </Button>
        </div>
      </div>

      {/* —— 网格 —— */}
      {personsQ.isLoading ? (
        <LoadingGrid />
      ) : total === 0 ? (
        <EmptyState
          onCreate={() => navigate('/persons/new')}
          hasFilter={hasFilter}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {sorted.map((p) => (
            <PersonCard
              key={p.id}
              person={p}
              isFamilyRoot={rootSet.has(p.id)}
              onDelete={(id) => deleteMut.mutate(id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function LoadingGrid() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="flex flex-col gap-3"
          style={{
            background: 'var(--color-card)',
            border: '1px solid var(--color-border)',
            borderRadius: 10,
            padding: 18,
          }}
        >
          <Skeleton active avatar paragraph={{ rows: 2 }} title={false} />
        </div>
      ))}
    </div>
  );
}

function EmptyState({
  onCreate,
  hasFilter,
}: {
  onCreate: () => void;
  hasFilter: boolean;
}) {
  return (
    <div
      className="flex flex-col items-center gap-3 px-6 py-16 text-center"
      style={{
        background: 'var(--color-card)',
        border: '1px dashed var(--color-border-strong)',
        borderRadius: 12,
      }}
    >
      <div
        className="grid h-12 w-12 place-items-center rounded-lg text-[20px]"
        style={{
          background: 'var(--color-accent-soft)',
          color: 'var(--color-accent-strong)',
        }}
      >
        <UserAddOutlined />
      </div>
      <h3 className="m-0 text-[18px] font-semibold text-[var(--color-foreground)]">
        {hasFilter ? '没有匹配的人物' : '还没有人物'}
      </h3>
      <p className="m-0 max-w-xs text-[13px] text-[var(--color-muted-fg)]">
        {hasFilter
          ? '试试清空搜索或换一个档位过滤。'
          : '把你想记录的人录进来，他们会出现在这里。'}
      </p>
      {!hasFilter && (
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={onCreate}
          style={{ marginTop: 4 }}
        >
          创建第一个人物
        </Button>
      )}
    </div>
  );
}
