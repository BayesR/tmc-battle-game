/**
 * カードデータ構造の型定義
 * ------------------------------------------------------------------
 * 既存の TMC Battle Simulator（5×5総当たりマトリクス版）と共通のデータ構造。
 * `TMC_NPC_CardPool.xlsx`（convert_master.py の出力）をそのまま読み込む前提。
 *
 * Phase 2以降で列が増える見込み（ストーリー用NPC名・テーマLegacy・
 * 性格タグ・カード解放フラグ等）のため、CardMaster は横に拡張しやすいよう
 * フラットな構造のまま保っている。
 */

/** Legacyの並び順：環・愛・制・邪・聖（公式順） */
export type Legacy = '環' | '愛' | '制' | '邪' | '聖';

export const LEGACY_ORDER: Legacy[] = ['環', '愛', '制', '邪', '聖'];

/** Potential Pointの枠に設定できるLegacy（未使用を含む） */
export type PotentialLegacy = '未使用' | Legacy;

export type Rarity = 'N' | 'R' | 'SR' | 'UR';

/** バトルストリート（賭け×収集メタゲーム）用の独自レアリティ。本家レアリティ（rarity）とは別軸で手動割り当て */
export type BattleStreetRarity = 'N' | 'R' | 'SR' | 'UR' | 'SUR' | 'SSUR' | 'SSSUR';

/** NPCレベル（Lv5は現状未使用・ボス級カード等に温存） */
export type NpcLevel = 'Lv1' | 'Lv2' | 'Lv3' | 'Lv4' | 'Lv5';

export const NPC_LEVELS: NpcLevel[] = ['Lv1', 'Lv2', 'Lv3', 'Lv4', 'Lv5'];

/** レアリティ→NPCレベルの暫定マッピング（convert_master.py と揃えてある） */
export const RARITY_TO_LEVEL: Record<Rarity, NpcLevel> = {
  N: 'Lv1',
  R: 'Lv2',
  SR: 'Lv3',
  UR: 'Lv4',
};

export interface PotentialPoint {
  legacy: PotentialLegacy;
  value: number;
}

/** カードマスターデータ（カードプールに存在する1種類のカード） */
export interface CardMaster {
  /** 元CardID（TMC_Databaseの参照用） */
  id: string;
  name: string;
  legacy: Legacy;
  monsterPride: number;
  /** 常に3枠固定。同一カード内で同じLegacyは重複不可（データ制約） */
  potentialPoints: [PotentialPoint, PotentialPoint, PotentialPoint];
  hasVoid: boolean;
  rarity: Rarity;
  suggestedNpcLevel: NpcLevel;
  /** バトルストリート用の独自レアリティ（N〜SSSURの7段階。手動でリスト化・割り当て済み） */
  battleStreetRarity: BattleStreetRarity;
}

/**
 * デッキ・手札の中の1枚（対戦中に個体識別が必要なので instanceId を付与）。
 * 同じ CardMaster を複数回使うことは Phase 1 では想定していないが、
 * instanceId を分けておくことで将来同名カードを複数採用したくなっても
 * React の key 管理やアニメーション制御が壊れない。
 */
export interface DeckCard extends CardMaster {
  instanceId: string;
}

let instanceCounter = 0;
export function toDeckCard(card: CardMaster): DeckCard {
  instanceCounter += 1;
  return { ...card, instanceId: `${card.id}-${instanceCounter}-${Date.now()}` };
}
