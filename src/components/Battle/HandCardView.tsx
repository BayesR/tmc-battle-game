import type { CSSProperties } from 'react';
import type { DeckCard } from '../../types/card';
import { LEGACY_COLOR, hexToRgba, potentialLegacyColor, holoGlowColor } from '../../data/legacyTheme';
import { rarityEffectClass } from '../common/RarityEffects';

interface Props {
  card: DeckCard;
  selected?: boolean;
  disabled?: boolean;
  stampText?: string | null;
  stampColor?: string;
  onClick?: () => void;
}

/** 手札用の簡易カード表示サイズ */
const HAND_CARD_WIDTH = 104;

/**
 * 手札選択用の簡易カード表示。
 * 左上=モンスター名／右上=Legacyを色付き丸のみで表現（文字なし。カード枠の色でも判別可）／
 * 右端中央=Void（Vバッジ、ある場合のみ）／左下=PP／右下=MPを数字で表示。
 */
export function HandCardView({ card, selected, disabled, stampText, stampColor, onClick }: Props) {
  const width = HAND_CARD_WIDTH;
  const height = Math.round(width * 1.4);
  const usedPP = card.potentialPoints.filter((pp) => pp.legacy !== '未使用');
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
          width,
          height,
          background: `linear-gradient(165deg, ${hexToRgba(LEGACY_COLOR[card.legacy], 0.5)} 0%, #17171a 62%)`,
          border: `2px solid ${borderColor}`,
          transform: selected ? 'translateY(-6px)' : undefined,
          opacity: disabled && !selected ? 0.4 : 1,
          cursor: onClick ? (disabled ? 'not-allowed' : 'pointer') : 'default',
          transition: 'transform 120ms ease, box-shadow 120ms ease',
          boxShadow: selected ? '0 0 0 2px #38bdf8, 0 6px 14px rgba(0,0,0,0.45)' : undefined,
          ...(needsGlowVars ? { '--legacy-glow': glow, '--legacy-glow-soft': hexToRgba(glow, 0.5) } : {}),
        } as CSSProperties
      }
    >
      {card.battleStreetRarity === 'R' && (
        <>
          <span className="tmc-rarity-r-shine" />
          <span className="tmc-rarity-sparkle-r" style={{ top: '24%', left: '66%', fontSize: 7, animationDelay: '0.3s' }}>
            ✦
          </span>
        </>
      )}
      {card.battleStreetRarity === 'SR' && (
        <>
          <span className="tmc-rarity-sr-shine" />
          <span className="tmc-rarity-sparkle" style={{ top: '18%', left: '70%', fontSize: 9, animationDelay: '0s' }}>
            ✦
          </span>
          <span className="tmc-rarity-sparkle" style={{ top: '60%', left: '14%', fontSize: 7, animationDelay: '0.5s' }}>
            ✦
          </span>
        </>
      )}
      {isHolo && (
        <>
          <span className="tmc-rarity-holo-overlay" />
          <span className="tmc-rarity-sparkle" style={{ top: '18%', left: '68%', fontSize: 9, animationDelay: '0s', color: '#fff' }}>
            ✦
          </span>
          <span className="tmc-rarity-sparkle" style={{ top: '62%', left: '12%', fontSize: 8, animationDelay: '0.5s', color: '#fff' }}>
            ✦
          </span>
        </>
      )}
      {/* 上段：モンスター名（左）／Legacy色丸（右・文字なし。flexで重なりを構造的に防止） */}
      <div
        className="absolute flex items-start justify-between gap-1"
        style={{
          top: 0,
          left: 0,
          right: 0,
          padding: '5px 6px',
          background: 'linear-gradient(180deg, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0) 100%)',
        }}
      >
        <span
          className="min-w-0 font-extrabold text-white"
          style={{
            fontSize: 11,
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
        <span
          className="shrink-0 rounded-full border-2"
          style={{
            width: 14,
            height: 14,
            background: LEGACY_COLOR[card.legacy],
            borderColor: 'rgba(255,255,255,0.85)',
          }}
          title={card.legacy}
        />
      </div>

      {/* 右端中央：Void */}
      {card.hasVoid && (
        <span
          className="absolute inline-flex items-center justify-center rounded-full border-2 font-black text-white"
          style={{
            top: '50%',
            right: 4,
            transform: 'translateY(-50%)',
            width: 20,
            height: 20,
            fontSize: 12,
            background: '#c026d3',
            borderColor: 'rgba(255,255,255,0.6)',
            boxShadow: '0 1px 4px rgba(0,0,0,0.5)',
          }}
          title="Void"
        >
          V
        </span>
      )}

      {/* 左下：PP */}
      <div className="absolute flex flex-col gap-1" style={{ bottom: 5, left: 5 }}>
        {usedPP.length === 0 ? (
          <span style={{ fontSize: 9, color: '#9ca3af', fontWeight: 700 }}>-</span>
        ) : (
          usedPP.map((pp, i) => (
            <span
              key={i}
              className="rounded font-mono font-black"
              style={{
                fontSize: 11,
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

      {/* 右下：MP（数字） */}
      <div
        className="absolute flex items-center justify-center rounded-full font-black"
        style={{
          bottom: 5,
          right: 4,
          minWidth: 24,
          height: 24,
          padding: '0 5px',
          background: 'rgba(0,0,0,0.55)',
          border: '1px solid rgba(253,224,71,0.7)',
          color: '#fde047',
          fontSize: 13,
          textShadow: '0 1px 2px rgba(0,0,0,0.85)',
        }}
      >
        {card.monsterPride}
      </div>

      {stampText && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center" style={{ zIndex: 5 }}>
          <span
            style={{
              transform: 'rotate(-14deg)',
              border: `3px solid ${stampColor || '#38bdf8'}`,
              color: stampColor || '#38bdf8',
              fontWeight: 900,
              fontStyle: 'italic',
              fontSize: 18,
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
    </button>
  );
}
