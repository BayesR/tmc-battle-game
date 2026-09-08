import type { CardMaster, NpcLevel } from '../types/card';
import { generateLevelTunedNpcDeck, generateNpcName, generateReaperDeck } from './npcDeckGenerator';

export type OpponentDrawKey = 'Lv1' | 'Lv2' | 'Lv3' | 'Lv4' | 'RARE_REAPER';

/**
 * 対戦相手抽選テーブル。
 * ▼神・チャンピオンは実装を一旦ストップし、ストリートの死神のみをレアキャラとして統合（合計1%）
 */
const OPPONENT_DRAW_TABLE: { key: OpponentDrawKey; prob: number }[] = [
  { key: 'Lv1', prob: 0.4 },
  { key: 'Lv2', prob: 0.3 },
  { key: 'Lv3', prob: 0.2 },
  { key: 'Lv4', prob: 0.09 },
  { key: 'RARE_REAPER', prob: 0.01 },
];

const RARE_CHARACTER_INFO: Record<string, { name: string }> = {
  RARE_REAPER: { name: 'ストリートの死神' },
};

export function isRareKey(key: OpponentDrawKey): boolean {
  return key.startsWith('RARE_');
}

export function drawOpponentKey(): OpponentDrawKey {
  const r = Math.random();
  let acc = 0;
  for (const entry of OPPONENT_DRAW_TABLE) {
    acc += entry.prob;
    if (r < acc) return entry.key;
  }
  return 'Lv1';
}

export interface BattleStreetOpponent {
  id: string;
  key: OpponentDrawKey;
  isRare: boolean;
  name: string;
  deck: CardMaster[] | null;
  /** 死神は専用のビジュアル（Lv5枠を流用）。それ以外は既存Lv1〜4のポートレートをそのまま使う */
  portraitLevel: NpcLevel;
}

/** 対戦相手のレベルに応じた、賭けられるバッジ数の上限（レアキャラは無制限） */
const OPPONENT_BET_CAP: Partial<Record<OpponentDrawKey, number>> = { Lv1: 1, Lv2: 3, Lv3: 5, Lv4: 10 };

export function getMaxBetForOpponent(opponent: BattleStreetOpponent): number {
  if (opponent.isRare) return Infinity;
  return OPPONENT_BET_CAP[opponent.key] ?? Infinity;
}

/** 対戦相手1名分のデータを組み立てる */
function buildOpponent(key: OpponentDrawKey, pool: CardMaster[], index: number): BattleStreetOpponent {
  const rare = isRareKey(key);
  // ストリートの死神は専用のデッキ構築・見た目を使う（他のレアキャラは実装を一旦ストップ）
  const deck = key === 'RARE_REAPER' ? generateReaperDeck(pool) : generateLevelTunedNpcDeck(pool, key as NpcLevel);
  const name = rare ? RARE_CHARACTER_INFO[key].name : generateNpcName(key as NpcLevel);
  return {
    id: `opp_${Date.now()}_${index}_${Math.floor(Math.random() * 100000)}`,
    key,
    isRare: rare,
    name,
    deck,
    // Lv5は「ボス級カード用に温存」されていた枠。ストリートの死神の専用ビジュアル・出し方に使う
    portraitLevel: rare ? 'Lv5' : (key as NpcLevel),
  };
}

/** 対戦相手4名を独立抽選する（1人と対戦するまで再抽選しない想定） */
export function generateOpponentRoster(pool: CardMaster[]): BattleStreetOpponent[] {
  return Array.from({ length: 4 }).map((_, i) => buildOpponent(drawOpponentKey(), pool, i));
}
