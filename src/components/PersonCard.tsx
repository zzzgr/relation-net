import {
  DeleteOutlined,
  EditOutlined,
  EnvironmentOutlined,
  MoreOutlined,
  PartitionOutlined,
  ShareAltOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Button, Dropdown, Tag, Tooltip } from 'antd';
import type { MenuProps } from 'antd';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PersonAvatar } from '@/components/PersonAvatar';
import ShareDialog from '@/components/ShareDialog';
import { listAddresses } from '@/api/addresses';
import { kinshipLabel } from '@/lib/relations';
import { getModal } from '@/lib/message';
import type { Kinship } from '@/lib/relations';
import type { Person } from '@/types';

const GENDER_GLYPH: Record<string, string> = {
  male: '♂',
  female: '♀',
  unknown: '·',
};
const GENDER_COLOR: Record<string, string> = {
  male: 'var(--color-male)',
  female: 'var(--color-female)',
  unknown: 'var(--color-unknown)',
};

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

function birthYear(p: Person): string | null {
  if (!p.birth_date) return null;
  const m = /^(\d{4})/.exec(p.birth_date);
  return m ? m[1] : null;
}

interface Props {
  person: Person;
  isFamilyRoot?: boolean;
  onDelete: (id: number) => void;
}

export default function PersonCard({ person, isFamilyRoot, onDelete }: Props) {
  const navigate = useNavigate();
  const [hover, setHover] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const displayName = personDisplayName(person);
  const addrQ = useQuery({
    queryKey: ['addresses', person.id],
    queryFn: () => listAddresses(person.id),
    staleTime: 60_000,
  });
  const addresses = addrQ.data ?? [];
  const primaryAddress = addresses[0];
  const sub =
    person.real_name &&
    (person.dialect_title || person.standard_title || person.nickname)
      ? person.dialect_title || person.standard_title || person.nickname
      : null;
  const year = birthYear(person);
  const kinStyle = KIN_STYLE[person.kinship] ?? KIN_STYLE.social;
  const editHref = `/persons/${person.id}/edit`;

  const goEdit = (e?: React.SyntheticEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    navigate(editHref);
  };

  const confirmDelete = (e?: React.SyntheticEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    getModal()?.confirm({
      title: (<span>确认将 <b>{displayName}</b> 移入回收站？</span>),
      content: '该人物会从列表中隐藏，可在回收站中恢复。',
      okText: '移入回收站',
      cancelText: '取消',
      onOk: () => onDelete(person.id),
    });
  };

  const menu: MenuProps['items'] = [
    {
      key: 'edit',
      icon: <EditOutlined />,
      label: '编辑',
      onClick: ({ domEvent }) => goEdit(domEvent),
    },
    {
      key: 'share',
      icon: <ShareAltOutlined />,
      label: '分享此人',
      onClick: ({ domEvent }) => {
        domEvent.preventDefault();
        domEvent.stopPropagation();
        setShareOpen(true);
      },
    },
    {
      key: 'delete',
      danger: true,
      icon: <DeleteOutlined />,
      label: '移入回收站',
      onClick: ({ domEvent }) => confirmDelete(domEvent),
    },
  ];

  const onCardClick: React.MouseEventHandler<HTMLElement> = (e) => {
    // 防御层 1：分享弹窗打开时一律忽略
    if (shareOpen) return;
    // 防御层 2：DOM 上有任意 AntD modal 在显示 —— 不要导航
    if (document.querySelector('.ant-modal-wrap:not([style*="display: none"])')) return;
    // 防御层 3：portal 出去的 menu/modal 事件目标不在 article DOM 子树里
    const target = e.target as Node;
    if (!e.currentTarget.contains(target)) return;
    // 防御层 4：内部按钮区
    if ((target as HTMLElement).closest('[data-stop]')) return;
    goEdit(e);
  };

  const onCardKey: React.KeyboardEventHandler<HTMLElement> = (e) => {
    if (shareOpen) return;
    if (document.querySelector('.ant-modal-wrap:not([style*="display: none"])')) return;
    if (!e.currentTarget.contains(e.target as Node)) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      goEdit(e);
    }
  };

  return (
    <>
    <article
      role="link"
      tabIndex={0}
      onClick={onCardClick}
      onKeyDown={onCardKey}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      aria-label={`编辑 ${displayName}`}
      className="group relative flex cursor-pointer flex-col gap-3 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[var(--color-accent-ring)]"
      style={{
        background: 'var(--color-card)',
        border: `1px solid ${hover ? 'var(--color-border-strong)' : 'var(--color-border)'}`,
        borderRadius: 10,
        padding: 18,
      }}
    >
      {/* Top row: 头像 + 主标题 + Kinship Tag */}
      <header className="flex items-center gap-3">
        <PersonAvatar person={person} size={42} shape="circle" />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <h3
              className="m-0 truncate text-[17px] font-semibold leading-tight tracking-tight text-[var(--color-foreground)]"
              title={displayName}
            >
              {displayName}
            </h3>
            <span
              className="text-[14px] font-semibold"
              style={{ color: GENDER_COLOR[person.gender] }}
              aria-label={person.gender}
            >
              {GENDER_GLYPH[person.gender]}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] text-[var(--color-muted-fg)]">
            {sub && <span className="truncate">{sub}</span>}
            {year && (
              <span className="font-mono tabular-nums">
                {year}
                <span className="text-[var(--color-subtle-fg)]"> 年</span>
              </span>
            )}
          </div>
        </div>

        <Tag
          style={{
            color: kinStyle.color,
            background: kinStyle.bg,
            border: 'none',
            fontWeight: 500,
            margin: 0,
          }}
        >
          {kinshipLabel(person.kinship)}
        </Tag>
      </header>

      {/* Address row */}
      {primaryAddress && (
        <div className="flex items-center gap-1.5 text-[13px] text-[var(--color-foreground)]">
          <EnvironmentOutlined
            style={{ color: 'var(--color-muted-fg)', fontSize: 13 }}
          />
          {primaryAddress.label && (
            <Tag
              bordered={false}
              style={{
                margin: 0,
                fontSize: 11,
                lineHeight: 1.4,
                padding: '0 6px',
                background: 'var(--color-accent-soft)',
                color: 'var(--color-accent-strong)',
              }}
            >
              {primaryAddress.label}
            </Tag>
          )}
          <span className="line-clamp-1 flex-1" title={primaryAddress.address}>
            {primaryAddress.address}
          </span>
          {addresses.length > 1 && (
            <span className="text-[11px] text-[var(--color-muted-fg)]">
              +{addresses.length - 1}
            </span>
          )}
          {primaryAddress.longitude && primaryAddress.latitude && (
            <Tooltip title="已有坐标">
              <span
                className="inline-block h-1.5 w-1.5 rounded-full"
                style={{ background: 'var(--color-accent)' }}
              />
            </Tooltip>
          )}
        </div>
      )}

      {/* Family root chip */}
      {isFamilyRoot && (
        <div
          className="inline-flex w-fit items-center gap-1 rounded-md px-2 py-0.5 text-[12px] font-medium"
          style={{
            background: 'var(--color-accent-soft)',
            color: 'var(--color-accent-strong)',
          }}
        >
          <PartitionOutlined style={{ fontSize: 12 }} />
          家族顶点
        </div>
      )}

      {person.notes && (
        <p className="m-0 line-clamp-2 text-[12px] text-[var(--color-muted-fg)]">
          {person.notes}
        </p>
      )}

      {/* Action menu: visible on hover (desktop) / always (mobile) */}
      <div
        data-stop
        className="absolute right-3 top-3 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity"
      >
        <Dropdown menu={{ items: menu }} trigger={['click']} placement="bottomRight">
          <Button
            type="text"
            size="small"
            icon={<MoreOutlined />}
            aria-label="更多操作"
            onClick={(e) => e.stopPropagation()}
          />
        </Dropdown>
      </div>
    </article>

    <ShareDialog
      open={shareOpen}
      onClose={() => setShareOpen(false)}
      rootPersonId={person.id}
      defaultTitle={`${displayName} 的资料`}
      mode="person"
    />
    </>
  );
}
