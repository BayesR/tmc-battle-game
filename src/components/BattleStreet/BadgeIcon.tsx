interface Props {
  size?: number;
}

/** バッジを円形のコイン/バッジ風アイコンで表現する共通コンポーネント */
export function BadgeIcon({ size = 20 }: Props) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full border-2"
      style={{
        width: size,
        height: size,
        background: 'radial-gradient(circle at 35% 30%, #fde68a 0%, #f59e0b 55%, #b45309 100%)',
        borderColor: '#78350f',
        boxShadow: '0 2px 4px rgba(0,0,0,0.4), inset 0 1px 3px rgba(255,255,255,0.55)',
      }}
    >
      <span style={{ fontSize: size * 0.52, color: '#78350f', fontWeight: 900, lineHeight: 1 }}>★</span>
    </span>
  );
}
