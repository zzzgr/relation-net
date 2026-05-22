import { useMemo, useState } from 'react';
import { Button, Input, Popover } from 'antd';
import { PICKABLE_ICONS, iconFromName } from '@/lib/icon-picker';

interface Props {
  value: string | null;
  onChange: (name: string | null) => void;
}

export function IconPicker({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const Current = iconFromName(value);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return PICKABLE_ICONS;
    return PICKABLE_ICONS.filter((p) => p.hint.includes(q));
  }, [query]);

  return (
    <Popover
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) setQuery('');
      }}
      trigger="click"
      placement="bottomLeft"
      content={
        <div style={{ width: 320 }} className="flex flex-col gap-2">
          <Input
            size="small"
            allowClear
            placeholder={`搜索 ${PICKABLE_ICONS.length} 个图标（英文）`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
          <div
            className="grid gap-1 overflow-y-auto"
            style={{
              gridTemplateColumns: 'repeat(8, 1fr)',
              maxHeight: 260,
              paddingRight: 4,
            }}
          >
            {filtered.length === 0 ? (
              <div
                className="col-span-8 py-6 text-center text-[12px]"
                style={{ color: 'var(--color-muted-fg)' }}
              >
                没有匹配的图标
              </div>
            ) : (
              filtered.map((p) => {
                const active = p.name === value;
                const Icon = p.Icon;
                return (
                  <button
                    key={p.name}
                    type="button"
                    onClick={() => {
                      onChange(p.name);
                      setOpen(false);
                      setQuery('');
                    }}
                    title={p.hint}
                    style={{
                      width: 32,
                      height: 32,
                      display: 'grid',
                      placeItems: 'center',
                      border: active
                        ? '1px solid var(--color-accent-strong)'
                        : '1px solid var(--color-border)',
                      background: active
                        ? 'var(--color-accent-soft)'
                        : 'transparent',
                      borderRadius: 6,
                      cursor: 'pointer',
                      color: active
                        ? 'var(--color-accent-strong)'
                        : 'var(--color-foreground)',
                    }}
                  >
                    <Icon style={{ fontSize: 16 }} />
                  </button>
                );
              })
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              onChange(null);
              setOpen(false);
              setQuery('');
            }}
            style={{
              height: 28,
              border: '1px dashed var(--color-border)',
              background: 'transparent',
              borderRadius: 6,
              cursor: 'pointer',
              color: 'var(--color-muted-fg)',
              fontSize: 12,
            }}
          >
            不要图标
          </button>
        </div>
      }
    >
      <Button
        size="small"
        style={{
          width: 32,
          height: 32,
          display: 'grid',
          placeItems: 'center',
          padding: 0,
        }}
      >
        <Current style={{ fontSize: 14 }} />
      </Button>
    </Popover>
  );
}
