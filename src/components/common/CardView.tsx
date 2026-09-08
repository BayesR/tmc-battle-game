import type { CSSProperties } from 'react';
import type { CardMaster } from '../../types/card';
import type { RoundEffect } from '../../logic/battleEffects';
import { LEGACY_COLOR, hexToRgba, potentialLegacyColor, holoGlowColor } from '../../data/legacyTheme';
import { LegacyBadge } from './LegacyBadge';
import { rarityEffectClass } from './RarityEffects';

interface Props {
  card: CardMaster;
  size?: 'sm' | 'md' | 'lg' | 'board';
  selected?: boolean;
  disabled?: boolean;
  highlight?: 'win' | 'lose' | 'draw' | null;
  /** true の場合、裏面（TMCロゴ＋縁飾り）を表示する（盤面で負けたカード用） */
  faceDown?: boolean;
  /** オーバーレイスタンプの文字列（選択中は"JANO"、盤面公開後は"WIN"/"LOSE"/"DRAW"など） */
  stampText?: string | null;
  /** スタンプの色。省略時は水色 */
  stampColor?: string;
  /** 対戦演出（雷／Root Counterの光／切り裂き爪）。1回きりで自動的に消える */
  roundEffect?: RoundEffect;
  onClick?: () => void;
}

/** カードサイズ：縦長・角丸（5:7比率）。boardは対戦盤面専用（自分・相手で共通サイズ） */
const CARD_WIDTH: Record<'sm' | 'md' | 'lg' | 'board', number> = { sm: 104, md: 118, lg: 160, board: 96 };

const HIGHLIGHT_STYLE: Record<string, CSSProperties> = {
  win: { boxShadow: '0 0 0 2px #34d399, 0 6px 14px rgba(0,0,0,0.45)' },
  lose: { boxShadow: '0 0 0 2px #f43f5e, 0 6px 14px rgba(0,0,0,0.45)' },
  draw: { boxShadow: '0 0 0 2px #94a3b8, 0 6px 14px rgba(0,0,0,0.45)' },
};

const CORNER_OFFSETS: CSSProperties[] = [
  { top: 6, left: 6 },
  { top: 6, right: 6 },
  { bottom: 6, left: 6 },
  { bottom: 6, right: 6 },
];

/**
 * カード1枚の見た目（表・裏）
 * 表：左上=モンスター名（帯背景で視認性確保）／右上=Legacy（大きめ）／
 *     右端中央=Void（「V」の丸バッジ、ある場合のみ）／左下=PP（「Legacy+数値」表記・高コントラスト）／
 *     右下=MP（数字）
 * 名前とLegacyバッジはflexの横並びにしており、名前が長くても構造的に重ならない。
 * オーバーレイスタンプ：選択中は「JANO」、盤面公開後は「WIN/LOSE/DRAW」を重ねて表示できる。
 * 裏：TMCロゴ（太字・仮）＋縁飾りのある枠デザイン
 * ※表向きのときのみ、battleStreetRarityに応じたレアリティ演出（R=金縁／SR=キラキラ／UR以上=虹ホロ）を重ねる。
 */
export function CardView({
  card,
  size = 'md',
  selected,
  disabled,
  highlight,
  faceDown,
  stampText,
  stampColor,
  roundEffect,
  onClick,
}: Props) {
  const width = CARD_WIDTH[size];
  const height = Math.round(width * 1.4);
  const baseStyle: CSSProperties = {
    width,
    height,
    transform: selected ? 'translateY(-6px)' : undefined,
    opacity: disabled && !selected ? 0.4 : 1,
    cursor: onClick ? (disabled ? 'not-allowed' : 'pointer') : 'default',
    transition: 'transform 120ms ease, box-shadow 120ms ease',
    ...(selected
      ? { boxShadow: '0 0 0 2px #38bdf8, 0 6px 14px rgba(0,0,0,0.45)' }
      : highlight
      ? HIGHLIGHT_STYLE[highlight]
      : {}),
  };

  if (faceDown) {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className="relative flex shrink-0 items-center justify-center rounded-2xl"
        style={{
          ...baseStyle,
          background: 'linear-gradient(150deg, #3b2f1e 0%, #241a10 60%, #150f09 100%)',
          border: '3px double #c9a35f',
          ...(onClick ? { boxShadow: '0 0 0 2px rgba(251,191,36,0.55), 0 6px 14px rgba(0,0,0,0.5)' } : {}),
        }}
      >
        {CORNER_OFFSETS.map((pos, i) => (
          <span
            key={i}
            className="absolute"
            style={{ ...pos, width: 6, height: 6, background: '#c9a35f', transform: 'rotate(45deg)', opacity: 0.85 }}
          />
        ))}
        <span
          style={{
            fontWeight: 900,
            fontStyle: 'italic',
            letterSpacing: 2,
            color: '#e9d8ab',
            fontSize: Math.max(12, width * 0.22),
            textShadow: '0 1px 2px rgba(0,0,0,0.6)',
          }}
        >
          TMC
        </span>

        {stampText && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center" style={{ zIndex: 5 }}>
            <span
              style={{
                transform: 'rotate(-10deg)',
                border: `3px solid ${stampColor || '#fbbf24'}`,
                color: stampColor || '#fbbf24',
                fontWeight: 900,
                fontStyle: 'italic',
                fontSize: Math.max(11, width * 0.145),
                padding: '2px 8px',
                borderRadius: 6,
                background: 'rgba(10,10,12,0.75)',
                letterSpacing: 1,
                textShadow: '0 1px 3px rgba(0,0,0,0.8)',
                whiteSpace: 'nowrap',
              }}
            >
              {stampText}
            </span>
          </div>
        )}
      </button>
    );
  }

  const usedPP = card.potentialPoints.filter((pp) => pp.legacy !== '未使用');
  const nameSize = Math.max(9, width * 0.115);
  const legacyDiameter = Math.max(20, width * 0.26);
  // 邪(Darkness)はほぼ黒のためダーク背景に溶け込みやすい。枠線を明るくして視認性を確保する
  const borderColor = card.legacy === '邪' ? '#9ca3af' : LEGACY_COLOR[card.legacy];
  const rarityClass = rarityEffectClass(card.battleStreetRarity);
  const isHolo = card.battleStreetRarity === 'UR' || card.battleStreetRarity === 'SUR' || card.battleStreetRarity === 'SSUR';
  const needsGlowVars = isHolo || card.battleStreetRarity === 'SR';
  const glow = holoGlowColor(card.legacy);

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`relative shrink-0 overflow-hidden rounded-2xl text-left ${rarityClass}`}
      style={
        {
          ...baseStyle,
          background: `linear-gradient(165deg, ${hexToRgba(LEGACY_COLOR[card.legacy], 0.55)} 0%, #17171a 62%)`,
          border: `2px solid ${borderColor}`,
          ...(needsGlowVars ? { '--legacy-glow': glow, '--legacy-glow-soft': hexToRgba(glow, 0.5) } : {}),
        } as CSSProperties
      }
    >
      {card.battleStreetRarity === 'R' && (
        <>
          <span className="tmc-rarity-r-shine" />
          <span className="tmc-rarity-sparkle-r" style={{ top: '22%', left: '68%', fontSize: 8, animationDelay: '0.3s' }}>
            ✦
          </span>
        </>
      )}
      {card.battleStreetRarity === 'SR' && (
        <>
          <span className="tmc-rarity-sr-shine" />
          <span className="tmc-rarity-sparkle" style={{ top: '18%', left: '70%', fontSize: 10, animationDelay: '0s' }}>
            ✦
          </span>
          <span className="tmc-rarity-sparkle" style={{ top: '55%', left: '12%', fontSize: 8, animationDelay: '0.5s' }}>
            ✦
          </span>
          <span className="tmc-rarity-sparkle" style={{ top: '75%', left: '60%', fontSize: 9, animationDelay: '1s' }}>
            ✦
          </span>
        </>
      )}
      {isHolo && (
        <>
          <span className="tmc-rarity-holo-overlay" />
          <span className="tmc-rarity-sparkle" style={{ top: '16%', left: '72%', fontSize: 11, animationDelay: '0s', color: '#fff' }}>
            ✦
          </span>
          <span className="tmc-rarity-sparkle" style={{ top: '50%', left: '10%', fontSize: 9, animationDelay: '0.4s', color: '#fff' }}>
            ✦
          </span>
          <span className="tmc-rarity-sparkle" style={{ top: '78%', left: '55%', fontSize: 10, animationDelay: '0.8s', color: '#fff' }}>
            ✦
          </span>
        </>
      )}
      {/* 左上：モンスター名／右上：Legacy（flexで横並びにし、重なりを構造的に防止） */}
      <div
        className="absolute flex items-start justify-between gap-1"
        style={{
          top: 0,
          left: 0,
          right: 0,
          padding: '4px 6px',
          background: 'linear-gradient(180deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0) 100%)',
        }}
      >
        <span
          className="block min-w-0 font-extrabold text-white"
          style={{
            fontSize: nameSize,
            lineHeight: 1.15,
            textShadow: '0 1px 3px rgba(0,0,0,0.9)',
            display: '-webkit-box',
            WebkitLineClamp: 3,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            wordBreak: 'break-word',
            overflowWrap: 'anywhere',
          }}
        >
          {card.name}
        </span>
        <span className="shrink-0">
          <LegacyBadge legacy={card.legacy} px={legacyDiameter} />
        </span>
      </div>

      {/* 右端中央：Void（ある場合のみ、「V」の丸バッジで表示） */}
      {card.hasVoid && (
        <span
          className="absolute inline-flex items-center justify-center rounded-full border-2 font-black text-white"
          style={{
            top: '50%',
            right: 4,
            transform: 'translateY(-50%)',
            width: Math.max(18, width * 0.22),
            height: Math.max(18, width * 0.22),
            fontSize: Math.max(11, width * 0.14),
            background: '#c026d3',
            borderColor: 'rgba(255,255,255,0.6)',
            boxShadow: '0 1px 4px rgba(0,0,0,0.5)',
          }}
          title="Void"
        >
          V
        </span>
      )}

      {/* 左下：Potential Point（「Legacy+数値」表記。邪は白文字で視認性を確保） */}
      <div className="absolute flex flex-col gap-1" style={{ bottom: 5, left: 5 }}>
        {usedPP.length === 0 ? (
          <span style={{ fontSize: Math.max(9, width * 0.09), color: '#9ca3af', fontWeight: 700 }}>-</span>
        ) : (
          usedPP.map((pp, i) => (
            <span
              key={i}
              className="rounded font-mono font-black"
              style={{
                fontSize: Math.max(10, width * 0.11),
                padding: '2px 5px',
                color: pp.legacy === '邪' ? '#ffffff' : 'rgba(0,0,0,0.88)',
                textShadow: pp.legacy === '邪' ? '0 1px 2px rgba(0,0,0,0.9)' : 'none',
                backgroundColor: potentialLegacyColor(pp.legacy),
                border: '1px solid rgba(255,255,255,0.5)',
                lineHeight: 1.25,
              }}
            >
              {pp.legacy}+{pp.value}
            </span>
          ))
        )}
      </div>

      {/* 右下：Monster Pride（数字で表示） */}
      <div
        className="absolute flex items-center justify-center rounded-full font-black"
        style={{
          bottom: 5,
          right: 4,
          minWidth: Math.max(20, width * 0.26),
          height: Math.max(20, width * 0.26),
          padding: '0 4px',
          background: 'rgba(0,0,0,0.55)',
          border: '1px solid rgba(253,224,71,0.7)',
          color: '#fde047',
          fontSize: Math.max(11, width * 0.16),
          textShadow: '0 1px 2px rgba(0,0,0,0.85)',
        }}
      >
        {card.monsterPride}
      </div>

      {/* オーバーレイスタンプ：選択中は「JANO」、盤面公開後は「WIN/LOSE/DRAW」 */}
      {stampText && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center" style={{ zIndex: 5 }}>
          <span
            style={{
              transform: 'rotate(-14deg)',
              border: `3px solid ${stampColor || '#38bdf8'}`,
              color: stampColor || '#38bdf8',
              fontWeight: 900,
              fontStyle: 'italic',
              fontSize: Math.max(14, width * 0.2),
              padding: '2px 10px',
              borderRadius: 6,
              background: 'rgba(10,10,12,0.6)',
              letterSpacing: 2,
              textShadow: '0 1px 3px rgba(0,0,0,0.8)',
            }}
          >
            {stampText}
          </span>
        </div>
      )}

      {/* 対戦演出（1回きり）：雷／Root Counterの光／切り裂き爪 */}
      {roundEffect === 'lightning' && (
        <div className="tmc-effect-lightning">
          <span style={{ fontSize: width * 0.7 }}>⚡</span>
        </div>
      )}
      {roundEffect === 'rootGlow' && <div className="tmc-effect-rootglow" />}
      {roundEffect === 'claw' && (
        <div className="tmc-effect-claw">
          <span className="tmc-claw-line" style={{ top: '22%', left: '-14%' }} />
          <span className="tmc-claw-line" style={{ top: '42%', left: '-10%' }} />
          <span className="tmc-claw-line" style={{ top: '62%', left: '-6%' }} />
        </div>
      )}
    </button>
  );
}
