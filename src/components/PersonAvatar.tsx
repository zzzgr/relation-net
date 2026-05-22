import { Avatar } from 'antd';
import type { Person } from '../types';

// 缺省头像剪影路径：与 family-chart personIcon 保持一致
const SILHOUETTE_PATH =
  'M256 288c79.5 0 144-64.5 144-144S335.5 0 256 0 112 64.5 112 144s64.5 144 144 144zm128 32h-55.1c-22.2 10.2-46.9 16-72.9 16s-50.6-5.8-72.9-16H128C57.3 320 0 377.3 0 448v16c0 26.5 21.5 48 48 48h416c26.5 0 48-21.5 48-48v-16c0-70.7-57.3-128-128-128z';

// 与 family-chart css 里 --male-color / --female-color 对应
// eslint-disable-next-line react-refresh/only-export-components
export const GENDER_SILHOUETTE_FILL: Record<string, string> = {
  male: 'rgb(120, 159, 172)',
  female: 'rgb(196, 138, 146)',
  unknown: '#9ca3af',
};

export interface PersonAvatarProps {
  person: Pick<Person, 'gender' | 'avatar_url' | 'avatar_char'>;
  size: number;
  shape?: 'circle' | 'rect';
  className?: string;
  borderColor?: string;
}

export function PersonAvatar({
  person,
  size,
  shape = 'circle',
  className,
  borderColor,
}: PersonAvatarProps) {
  const fill =
    GENDER_SILHOUETTE_FILL[person.gender ?? 'unknown'] ??
    GENDER_SILHOUETTE_FILL.unknown;

  const hasUrl = !!person.avatar_url;
  const charRaw = person.avatar_char ? Array.from(person.avatar_char.trim())[0] : null;
  const useChar = !hasUrl && !!charRaw;

  const style: React.CSSProperties = {
    width: size,
    height: size,
    flex: '0 0 auto',
    background: useChar ? fill : '#ffffff',
    border: `1px solid ${borderColor ?? 'var(--color-border)'}`,
    boxShadow: borderColor ? `0 0 0 1px ${borderColor}` : undefined,
    color: useChar ? '#ffffff' : undefined,
    fontWeight: useChar ? 600 : undefined,
    fontSize: useChar ? Math.round(size * 0.5) : undefined,
    lineHeight: useChar ? `${size}px` : undefined,
  };

  const fallbackIcon = (
    <svg
      viewBox="0 0 512 512"
      width={size * 0.6}
      height={size * 0.6}
      style={{ fill }}
      aria-hidden
    >
      <path d={SILHOUETTE_PATH} />
    </svg>
  );

  return (
    <Avatar
      shape={shape === 'circle' ? 'circle' : 'square'}
      size={size}
      src={person.avatar_url || undefined}
      className={className}
      style={style}
      icon={useChar ? undefined : fallbackIcon}
    >
      {useChar ? charRaw : null}
    </Avatar>
  );
}
