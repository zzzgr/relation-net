import { useState } from 'react';
import { Button, Popover } from 'antd';
import { PICKABLE_COLORS } from '@/lib/icon-picker';

interface Props {
  value: string | null;
  onChange: (color: string | null) => void;
}

export function ColorPicker({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const current = value ?? '#6b7280';

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      trigger="click"
      placement="bottomLeft"
      content={
        <div
          className="grid gap-1.5"
          style={{ gridTemplateColumns: 'repeat(6, 1fr)', width: 200 }}
        >
          {PICKABLE_COLORS.map((c) => {
            const active = c === value;
            return (
              <button
                key={c}
                type="button"
                onClick={() => {
                  onChange(c);
                  setOpen(false);
                }}
                style={{
                  width: 28,
                  height: 28,
                  background: c,
                  border: active
                    ? '2px solid var(--color-foreground)'
                    : '1px solid var(--color-border)',
                  borderRadius: 6,
                  cursor: 'pointer',
                }}
              />
            );
          })}
        </div>
      }
    >
      <Button
        size="small"
        style={{
          width: 32,
          height: 32,
          padding: 0,
          background: current,
          border: '1px solid var(--color-border)',
        }}
      />
    </Popover>
  );
}
