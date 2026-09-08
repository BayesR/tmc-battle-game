import type { BattleStreetRarity } from '../../types/card';

/**
 * カードのレアリティ（battleStreetRarity）に応じた視覚エフェクト用CSS。
 * アプリ全体で1回だけ読み込めばよいので、App.tsxのトップレベルで一度だけレンダリングする。
 *   R：少し控えめなキラキラ（シャイン＋小さな瞬き。縁取りなし）
 *   SR：カード自身のLegacy色を基調にした煌めくシャイン＋星の瞬き
 *   UR・SUR・SSUR：カード自身のLegacy色を基調にしたギラっとしたホログラフィック効果＋キラキラ
 */
export function RarityEffectsStyle() {
  return (
    <style>{`
      @keyframes tmcShimmerSweep {
        0% { transform: translateX(-160%) rotate(20deg); }
        100% { transform: translateX(160%) rotate(20deg); }
      }
      @keyframes tmcHoloShift {
        0% { background-position: 0% 50%; }
        100% { background-position: 300% 50%; }
      }
      @keyframes tmcSparkleTwinkle {
        0%, 100% { opacity: 0.15; transform: scale(0.7); }
        50% { opacity: 1; transform: scale(1.2); }
      }
      .tmc-rarity-r-shine {
        position: absolute;
        inset: 0;
        border-radius: inherit;
        overflow: hidden;
        pointer-events: none;
      }
      .tmc-rarity-r-shine::after {
        content: "";
        position: absolute;
        top: -40%;
        left: -20%;
        width: 26%;
        height: 180%;
        background: linear-gradient(120deg, transparent 35%, rgba(255,255,255,0.35) 48%, rgba(255,255,255,0.5) 50%, rgba(255,255,255,0.35) 52%, transparent 65%);
        animation: tmcShimmerSweep 3.6s ease-in-out infinite;
      }
      .tmc-rarity-sr {
        box-shadow: 0 0 0 2px var(--legacy-glow, #fff), 0 0 12px 2px var(--legacy-glow-soft, rgba(255,255,255,0.6));
      }
      .tmc-rarity-sr-shine {
        position: absolute;
        inset: 0;
        border-radius: inherit;
        overflow: hidden;
        pointer-events: none;
      }
      .tmc-rarity-sr-shine::after {
        content: "";
        position: absolute;
        top: -40%;
        left: -20%;
        width: 40%;
        height: 180%;
        background: linear-gradient(120deg, transparent 20%, var(--legacy-glow-soft, rgba(255,255,255,0.75)) 48%, #ffffff 50%, var(--legacy-glow-soft, rgba(255,255,255,0.75)) 52%, transparent 80%);
        animation: tmcShimmerSweep 2.4s ease-in-out infinite;
      }
      .tmc-rarity-sparkle {
        position: absolute;
        color: #ffd873;
        text-shadow: 0 0 4px rgba(255,216,115,0.95), 0 0 2px rgba(255,255,255,0.8);
        animation: tmcSparkleTwinkle 1.6s ease-in-out infinite;
        pointer-events: none;
      }
      .tmc-rarity-sparkle-r {
        position: absolute;
        color: #fff;
        text-shadow: 0 0 3px rgba(255,255,255,0.7);
        animation: tmcSparkleTwinkle 2.2s ease-in-out infinite;
        pointer-events: none;
        opacity: 0.7;
      }
      .tmc-rarity-holo {
        box-shadow: 0 0 0 2px var(--legacy-glow, #fff), 0 0 14px 3px var(--legacy-glow-soft, rgba(255,255,255,0.5));
      }
      .tmc-rarity-holo-overlay {
        position: absolute;
        inset: 0;
        border-radius: inherit;
        overflow: hidden;
        pointer-events: none;
        mix-blend-mode: screen;
        opacity: 0.8;
        background: linear-gradient(120deg, transparent 15%, var(--legacy-glow, #fff) 42%, #ffffff 50%, var(--legacy-glow, #fff) 58%, transparent 85%);
        background-size: 250% 250%;
        animation: tmcHoloShift 2.6s ease-in-out infinite;
      }

      /* --- 対戦演出（1回きり・出たら消える） --- */
      @keyframes tmcLightningFlash {
        0% { opacity: 0; transform: scale(0.5) rotate(-8deg); }
        15% { opacity: 1; transform: scale(1.2) rotate(-8deg); }
        30% { opacity: 0.3; }
        45% { opacity: 1; }
        70% { opacity: 0.7; }
        100% { opacity: 0; transform: scale(1) rotate(-8deg); }
      }
      .tmc-effect-lightning {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        pointer-events: none;
        z-index: 8;
        animation: tmcLightningFlash 0.9s ease-out forwards;
      }
      .tmc-effect-lightning span {
        filter: drop-shadow(0 0 6px #fef08a) drop-shadow(0 0 14px #facc15);
      }

      @keyframes tmcRootGlowFlash {
        0%, 100% { opacity: 0; }
        10%, 32%, 54% { opacity: 0.95; }
        21%, 43% { opacity: 0.15; }
        75% { opacity: 0.5; }
      }
      .tmc-effect-rootglow {
        position: absolute;
        inset: 0;
        border-radius: inherit;
        pointer-events: none;
        z-index: 8;
        background: radial-gradient(circle, rgba(255,255,255,0.95) 0%, rgba(255,247,200,0.5) 55%, transparent 75%);
        animation: tmcRootGlowFlash 0.9s ease-in-out forwards;
      }

      @keyframes tmcClawSlashReveal {
        0% { opacity: 0; transform: scale(0.85); }
        20% { opacity: 1; transform: scale(1.05); }
        65% { opacity: 0.9; }
        100% { opacity: 0; transform: scale(1); }
      }
      .tmc-effect-claw {
        position: absolute;
        inset: 0;
        border-radius: inherit;
        overflow: hidden;
        pointer-events: none;
        z-index: 8;
        animation: tmcClawSlashReveal 0.7s ease-out forwards;
      }
      .tmc-claw-line {
        position: absolute;
        width: 150%;
        height: 3px;
        background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.9) 15%, rgba(220,38,38,0.95) 50%, rgba(255,255,255,0.9) 85%, transparent 100%);
        box-shadow: 0 0 5px rgba(220,38,38,0.85);
        transform: rotate(-28deg);
      }
    `}</style>
  );
}

export function rarityEffectClass(rarity: BattleStreetRarity): string {
  if (rarity === 'SR') return 'tmc-rarity-sr';
  if (rarity === 'UR' || rarity === 'SUR' || rarity === 'SSUR') return 'tmc-rarity-holo';
  return '';
}
