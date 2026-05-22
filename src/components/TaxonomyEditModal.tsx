// 分类（taxonomy）创建 / 编辑 Modal
//
// 在 Settings 的"分类管理"和事件类型 / 社会关系下拉的"+ 新增"里复用。

import { useEffect, useState } from 'react';
import { Input, Modal, Switch } from 'antd';
import { useMutation } from '@tanstack/react-query';
import { ColorPicker } from '@/components/ColorPicker';
import { IconPicker } from '@/components/IconPicker';
import { iconFromName } from '@/lib/icon-picker';
import { toast } from '@/lib/message';
import { createTaxonomy, updateTaxonomy } from '@/api/taxonomies';
import type { Taxonomy, TaxonomyDomain } from '@/types';

export interface TaxonomyEditModalProps {
  open: boolean;
  domain: TaxonomyDomain;
  /** null 表示新建 */
  taxonomy: Taxonomy | null;
  /** 新建时使用的 order_index；缺省 -1，后端会自动放到末尾 */
  nextOrderIndex?: number;
  onClose: () => void;
  /** 成功后回调，参数是创建/更新后的 taxonomy。caller 负责 invalidate cache */
  onSaved: (taxonomy: Taxonomy) => void;
}

export function TaxonomyEditModal({
  open,
  domain,
  taxonomy,
  nextOrderIndex,
  onClose,
  onSaved,
}: TaxonomyEditModalProps) {
  const isEdit = !!taxonomy;
  const [label, setLabel] = useState('');
  const [iconName, setIconName] = useState<string | null>(null);
  const [colorHex, setColorHex] = useState<string | null>(null);
  const [isAnniversary, setIsAnniversary] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLabel(taxonomy?.label ?? '');
    setIconName(taxonomy?.icon_name ?? null);
    setColorHex(taxonomy?.color_hex ?? '#6b7280');
    setIsAnniversary(taxonomy?.is_anniversary ?? false);
  }, [open, taxonomy]);

  const saveMut = useMutation({
    mutationFn: async (): Promise<Taxonomy> => {
      const trimmed = label.trim();
      if (!trimmed) throw new Error('名称不能为空');
      if (isEdit) {
        return updateTaxonomy(taxonomy!.id, {
          label: trimmed,
          icon_name: iconName,
          color_hex: colorHex,
          is_anniversary: isAnniversary,
        });
      }
      return createTaxonomy({
        domain,
        label: trimmed,
        icon_name: iconName,
        color_hex: colorHex,
        order_index: nextOrderIndex,
      });
    },
    onSuccess: (t) => {
      toast.success(isEdit ? '已更新' : '已添加');
      onSaved(t);
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Modal
      open={open}
      onCancel={onClose}
      onOk={() => saveMut.mutate()}
      okButtonProps={{ loading: saveMut.isPending, disabled: !label.trim() }}
      destroyOnHidden
      title={isEdit ? '编辑分类' : '新增分类'}
      width={420}
    >
      <div className="mt-3 flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-[13px]">
            名称
            <span style={{ color: '#dc2626', marginLeft: 4 }}>*</span>
          </label>
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            maxLength={40}
            placeholder="如：求职 / 同学 / 婚礼"
            autoFocus
          />
        </div>
        <div className="flex items-center gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-[13px]">图标</label>
            <IconPicker value={iconName} onChange={setIconName} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[13px]">颜色</label>
            <ColorPicker value={colorHex} onChange={setColorHex} />
          </div>
          <div
            className="ml-auto flex items-center gap-1.5 px-2.5 py-1.5"
            style={{
              border: '1px solid var(--color-border)',
              borderRadius: 6,
              background: `color-mix(in srgb, ${colorHex ?? '#6b7280'} 14%, transparent)`,
              color: colorHex ?? '#6b7280',
            }}
          >
            {(() => {
              const Icon = iconFromName(iconName);
              return <Icon style={{ fontSize: 14 }} />;
            })()}
            <span style={{ fontSize: 13, fontWeight: 500 }}>
              {label.trim() || '预览'}
            </span>
          </div>
        </div>
        {isEdit && taxonomy && (
          <div className="text-[12px] text-[var(--color-muted-fg)]">
            key（不可改）：
            <code className="font-mono">{taxonomy.key}</code>
          </div>
        )}
        {domain === 'event_type' && (
          <div className="flex items-center justify-between">
            <div className="flex flex-col gap-0.5">
              <span className="text-[13px]">周年提醒</span>
              <span className="text-[11px] text-[var(--color-muted-fg)]">
                开启后，该类型的事件会自动按年提醒
              </span>
            </div>
            <Switch
              checked={isAnniversary}
              onChange={setIsAnniversary}
              size="small"
            />
          </div>
        )}
      </div>
    </Modal>
  );
}
