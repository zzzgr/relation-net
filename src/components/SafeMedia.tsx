// 加载失败时显示友好兜底的 <img> / <video> 包装。
//
// 用法：
//   <SafeImage src={url} className="..." style={...} />
//   <SafeVideo src={url} className="..." style={...} muted preload="metadata" />
//
// 失败时会渲染一块带图标 + 「加载失败」文字的灰底占位，复用父容器的尺寸。

import { FileImageOutlined, VideoCameraOutlined } from '@ant-design/icons';
import { useEffect, useState } from 'react';

interface BrokenPlaceholderProps {
  kind: 'image' | 'video';
  className?: string;
  style?: React.CSSProperties;
}

function BrokenPlaceholder({ kind, className, style }: BrokenPlaceholderProps) {
  const Icon = kind === 'video' ? VideoCameraOutlined : FileImageOutlined;
  return (
    <div
      className={className}
      style={{
        width: '100%',
        height: '100%',
        display: 'grid',
        placeItems: 'center',
        background: '#f5f5f5',
        color: '#9ca3af',
        ...style,
      }}
    >
      <div style={{ textAlign: 'center', lineHeight: 1.2 }}>
        <Icon style={{ fontSize: 20, opacity: 0.7 }} />
        <div style={{ marginTop: 4, fontSize: 11 }}>加载失败</div>
      </div>
    </div>
  );
}

interface SafeImageProps
  extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'onError'> {
  src: string;
  fallbackClassName?: string;
  fallbackStyle?: React.CSSProperties;
}

export function SafeImage({
  src,
  fallbackClassName,
  fallbackStyle,
  ...rest
}: SafeImageProps) {
  const [errored, setErrored] = useState(false);
  useEffect(() => {
    setErrored(false);
  }, [src]);

  if (errored || !src) {
    return (
      <BrokenPlaceholder
        kind="image"
        className={fallbackClassName}
        style={fallbackStyle}
      />
    );
  }
  return <img src={src} {...rest} onError={() => setErrored(true)} />;
}

interface SafeVideoProps
  extends Omit<React.VideoHTMLAttributes<HTMLVideoElement>, 'onError'> {
  src: string;
  fallbackClassName?: string;
  fallbackStyle?: React.CSSProperties;
}

export function SafeVideo({
  src,
  fallbackClassName,
  fallbackStyle,
  ...rest
}: SafeVideoProps) {
  const [errored, setErrored] = useState(false);
  useEffect(() => {
    setErrored(false);
  }, [src]);

  if (errored || !src) {
    return (
      <BrokenPlaceholder
        kind="video"
        className={fallbackClassName}
        style={fallbackStyle}
      />
    );
  }
  return <video src={src} {...rest} onError={() => setErrored(true)} />;
}
