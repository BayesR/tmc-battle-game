import type { Legacy } from '../../types/card';
import { LEGACY_COLOR, legacyTextColor } from '../../data/legacyTheme';

interface Props {
  legacy: Legacy;
  size?: 'sm' | 'md';
  /** 明示的な直径(px)。指定するとsizeプリセットより優先される（CardViewでカード幅に応じて拡大縮小する用） */
  px?: number;
}

/** Legacyのテーマカラーを使った丸バッジ表示（視認性重視：太めの縁取り＋影） */
export function LegacyBadge({ legacy, size = 'md', px }: Props) {
  const preset = size === 'sm' ? 20 : 28;
  const diameter = px ?? preset;
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full border-2 font-black"
      style={{
        width: diameter,
        height: diameter,
        fontSize: Math.round(diameter * 0.5),
        backgroundColor: LEGACY_COLOR[legacy],
        color: legacyTextColor(legacy),
        borderColor: 'rgba(255,255,255,0.85)',
        boxShadow: '0 1px 4px rgba(0,0,0,0.6)',
        textShadow:
          legacy === '邪' ? '0 0 3px rgba(255,255,255,0.9), 0 1px 2px rgba(0,0,0,0.9)' : '0 1px 2px rgba(0,0,0,0.5)',
      }}
      title={legacy}
    >
      {legacy}
    </span>
  );
}
