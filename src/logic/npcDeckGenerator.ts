import type { CardMaster, Legacy, NpcLevel } from '../types/card';
import { NPC_LEVELS } from '../types/card';
import { DECK_SIZE, RESTRICTED_TOTAL_LIMIT, VOID_LIMIT, validateDeck } from './deckRules';

/**
 * NPCレベルに応じて「使用可能なカードプール」を絞り込む。
 *
 * Phase 1の暫定仕様：NPCレベルは累積方式にしている
 * （例：Lv3のNPCは Lv1〜Lv3 のカードを使える）。
 * Phase 3のストーリーモードで「このNPCはこのカードプールのみ」という
 * 個別指定に差し替えたくなった場合も、この関数の呼び出し側を
 * 差し替えるだけで対応できるように、pool・level 以外の外部状態には依存しない。
 */
export function getPoolForNpcLevel(allCards: CardMaster[], level: NpcLevel): CardMaster[] {
  const levelIndex = NPC_LEVELS.indexOf(level);
  const allowedLevels = new Set(NPC_LEVELS.slice(0, levelIndex + 1));
  return allCards.filter((c) => allowedLevels.has(c.suggestedNpcLevel));
}

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

const MAX_ATTEMPTS = 3000;

/**
 * カードプールから、BATTLE RULES（聖・邪・Void合計3枚、Monster Pride合計15以下）
 * を満たすデッキ5枚をランダム抽選する。
 * 「条件を満たすまで抽選し直す」方式（引き継ぎドキュメント 4章の想定通り）。
 *
 * 抽選しきれない場合（プールが小さすぎる等）は null を返すので、
 * 呼び出し側でエラーハンドリングすること。
 */
export function generateNpcDeck(
  allCards: CardMaster[],
  level: NpcLevel
): CardMaster[] | null {
  const pool = getPoolForNpcLevel(allCards, level);
  if (pool.length < DECK_SIZE) return null;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const candidate = shuffle(pool).slice(0, DECK_SIZE);
    if (validateDeck(candidate).isValid) {
      return candidate;
    }
  }

  // 完全ランダムで見つからない場合のフォールバック：
  // 制約を優先しながら貪欲に組み立てる（最低限、動く対戦は成立させる）
  return greedyFallbackDeck(pool);
}

function greedyFallbackDeck(pool: CardMaster[]): CardMaster[] | null {
  const shuffled = shuffle(pool);
  const deck: CardMaster[] = [];

  for (const card of shuffled) {
    if (deck.length >= DECK_SIZE) break;
    const trial = [...deck, card];
    // 途中段階でも「採用済み分だけ」で上限を超えないかをチェック
    const restrictedCount = trial.filter((c) => c.legacy === '聖' || c.legacy === '邪' || c.hasVoid).length;
    const voidCount = trial.filter((c) => c.hasVoid).length;
    const mpTotal = trial.reduce((s, c) => s + c.monsterPride, 0);
    // 残り枠で最小Monster Pride(1)を積んでも15を超えないよう、緩めの見積りでガード
    const remainingSlots = DECK_SIZE - trial.length;
    if (restrictedCount > 3 || voidCount > 1) continue;
    if (mpTotal + remainingSlots * 1 > 15 && trial.length < DECK_SIZE) {
      if (mpTotal > 15) continue;
    }
    deck.push(card);
  }

  return validateDeck(deck).isValid ? deck : null;
}

/* ---------------------------------------------------------------
   NPCレベル別プロファイル（デッキ構築ルール＋対戦時の出し方）
   ------------------------------------------------------------------
   要件（テスト実装）：
   Lv1：聖・邪不使用／MP合計12〜13／MP5不使用／Void不使用／出し方は完全ランダム
   Lv2：邪不使用／MP合計14〜15／MP5とVoidを必ず使用／出し方は完全ランダム
   Lv3：邪不使用／MP合計15／MP5・MP1・Voidを必ず使用／PPが高いものを優先／
        初手はMP5・MP1・Voidのいずれかをランダムに、以降はランダム
   Lv4：聖・邪を積極的に使用／MP合計15／MP5か6・MP1・Voidを必ず使用／PPが高いものを優先／
        初手はMP5か6・MP1・Voidのいずれかをランダムに、以降は相手のLegacyを予測して相性の良いカードを出す
--------------------------------------------------------------- */
export type NpcPlayStyle = 'random' | 'openSpecialThenRandom' | 'openSpecialThenMatchup' | 'reaperAI';

export interface NpcLevelProfile {
  excludeLegacies: Legacy[];
  excludeMP: number[];
  allowVoid: boolean;
  requireVoid: boolean;
  /** 各要素は「そのMonster Prideを持つカードを1枚以上含む」制約。配列を渡すといずれか一致でOK（例：[5,6]） */
  requireMP: (number | number[])[];
  requireLegacies: Legacy[];
  mpTotalRange: [number, number];
  preferHighPP: boolean;
  playStyle: NpcPlayStyle;
}

export const NPC_LEVEL_PROFILE: Partial<Record<NpcLevel, NpcLevelProfile>> = {
  Lv1: {
    excludeLegacies: ['聖', '邪'],
    excludeMP: [5],
    allowVoid: false,
    requireVoid: false,
    requireMP: [],
    requireLegacies: [],
    mpTotalRange: [12, 13],
    preferHighPP: false,
    playStyle: 'random',
  },
  Lv2: {
    excludeLegacies: ['邪'],
    excludeMP: [],
    allowVoid: true,
    requireVoid: true,
    requireMP: [5],
    requireLegacies: [],
    mpTotalRange: [14, 15],
    preferHighPP: false,
    playStyle: 'random',
  },
  Lv3: {
    excludeLegacies: ['邪'],
    excludeMP: [],
    allowVoid: true,
    requireVoid: true,
    requireMP: [5, 1],
    requireLegacies: [],
    mpTotalRange: [15, 15],
    preferHighPP: true,
    playStyle: 'openSpecialThenRandom',
  },
  Lv4: {
    excludeLegacies: [],
    excludeMP: [],
    allowVoid: true,
    requireVoid: true,
    requireMP: [[5, 6], 1],
    requireLegacies: ['聖', '邪'],
    mpTotalRange: [15, 15],
    preferHighPP: true,
    playStyle: 'openSpecialThenMatchup',
  },
  // Lv5：ボス級カード用に温存されていた枠。ストリートの死神の出し方（reaperAI）に使用。
  // デッキ自体は generateReaperDeck() で別途生成するため、ここでは出し方の情報のみ使う。
  Lv5: {
    excludeLegacies: [],
    excludeMP: [],
    allowVoid: true,
    requireVoid: false,
    requireMP: [[5, 6], 1],
    requireLegacies: [],
    mpTotalRange: [15, 15],
    preferHighPP: true,
    playStyle: 'reaperAI',
  },
};

function ppTotal(card: CardMaster): number {
  return card.potentialPoints.reduce((sum, pp) => sum + pp.value, 0);
}

/** PP合計が高いカードを優先的に前方へ寄せた順序を作る（完全な固定順ではなく上位群内でランダム性を残す） */
function biasedOrder(pool: CardMaster[], preferHighPP: boolean): CardMaster[] {
  if (!preferHighPP) return shuffle(pool);
  const sorted = [...pool].sort((a, b) => ppTotal(b) - ppTotal(a));
  const cut = Math.max(1, Math.ceil(sorted.length * 0.6));
  return [...shuffle(sorted.slice(0, cut)), ...shuffle(sorted.slice(cut))];
}

/** 残り枠を、Monster Pride合計が目標範囲に収まるようランダム探索で埋める */
function searchFillForSum(
  fillPool: CardMaster[],
  count: number,
  minSum: number,
  maxSum: number,
  existingDeck: CardMaster[],
  preferHighPP: boolean,
  orderFn?: (pool: CardMaster[]) => CardMaster[]
): CardMaster[] | null {
  if (count === 0) return minSum <= 0 && 0 <= maxSum ? [] : null;

  for (let attempt = 0; attempt < 300; attempt++) {
    const order = orderFn ? orderFn(fillPool) : biasedOrder(fillPool, preferHighPP);
    const picked: CardMaster[] = [];
    let restrictedCount = existingDeck.filter((c) => c.legacy === '聖' || c.legacy === '邪' || c.hasVoid).length;
    let voidCount = existingDeck.filter((c) => c.hasVoid).length;

    for (const card of order) {
      if (picked.length >= count) break;
      const isRestricted = card.legacy === '聖' || card.legacy === '邪' || card.hasVoid;
      const nextRestricted = restrictedCount + (isRestricted ? 1 : 0);
      const nextVoid = voidCount + (card.hasVoid ? 1 : 0);
      if (nextRestricted > RESTRICTED_TOTAL_LIMIT || nextVoid > VOID_LIMIT) continue;
      picked.push(card);
      restrictedCount = nextRestricted;
      voidCount = nextVoid;
    }

    if (picked.length !== count) continue;
    const sum = picked.reduce((s, c) => s + c.monsterPride, 0);
    if (sum >= minSum && sum <= maxSum) return picked;
  }
  return null;
}

/** プロファイルの必須条件（MP指定・Void必須・Legacy必須）を満たすカードを1枚ずつ埋めていく */
function buildLevelDeck(pool: CardMaster[], profile: NpcLevelProfile): CardMaster[] | null {
  const deck: CardMaster[] = [];
  const usedIds = new Set<string>();

  function addCard(card: CardMaster) {
    deck.push(card);
    usedIds.add(card.id);
  }
  function available(predicate: (c: CardMaster) => boolean): CardMaster[] {
    return pool.filter((c) => !usedIds.has(c.id) && predicate(c));
  }

  for (const req of profile.requireMP) {
    const mpSet = Array.isArray(req) ? req : [req];
    if (deck.some((c) => mpSet.includes(c.monsterPride))) continue;
    const candidates = available((c) => mpSet.includes(c.monsterPride));
    if (candidates.length === 0) return null;
    addCard(biasedOrder(candidates, profile.preferHighPP)[0]);
  }

  if (profile.requireVoid && !deck.some((c) => c.hasVoid)) {
    const candidates = available((c) => c.hasVoid);
    if (candidates.length === 0) return null;
    addCard(biasedOrder(candidates, profile.preferHighPP)[0]);
  }

  for (const legacy of profile.requireLegacies) {
    if (deck.some((c) => c.legacy === legacy)) continue;
    const candidates = available((c) => c.legacy === legacy);
    if (candidates.length === 0) return null;
    addCard(biasedOrder(candidates, profile.preferHighPP)[0]);
  }

  if (deck.length > DECK_SIZE) return null;

  const [mpMin, mpMax] = profile.mpTotalRange;
  const currentSum = deck.reduce((s, c) => s + c.monsterPride, 0);
  const remainingSlots = DECK_SIZE - deck.length;
  const filled = searchFillForSum(
    available(() => true),
    remainingSlots,
    mpMin - currentSum,
    mpMax - currentSum,
    deck,
    profile.preferHighPP
  );
  if (!filled) return null;
  filled.forEach(addCard);

  const validation = validateDeck(deck);
  if (!validation.isValid) return null;
  const totalMP = deck.reduce((s, c) => s + c.monsterPride, 0);
  if (totalMP < mpMin || totalMP > mpMax) return null;

  return deck;
}

/**
 * NPCレベルごとのデッキ構築プロファイルを考慮したデッキ生成。
 * 条件を満たせなかった場合は、既存の汎用ランダム生成（BATTLE RULESのみ考慮）にフォールバックする。
 */
export function generateLevelTunedNpcDeck(allCards: CardMaster[], level: NpcLevel): CardMaster[] | null {
  const profile = NPC_LEVEL_PROFILE[level];
  if (!profile) return generateNpcDeck(allCards, level);

  let pool = getPoolForNpcLevel(allCards, level);
  if (profile.excludeLegacies.length) pool = pool.filter((c) => !profile.excludeLegacies.includes(c.legacy));
  if (profile.excludeMP.length) pool = pool.filter((c) => !profile.excludeMP.includes(c.monsterPride));
  if (!profile.allowVoid) pool = pool.filter((c) => !c.hasVoid);
  if (pool.length < DECK_SIZE) return generateNpcDeck(allCards, level);

  for (let attempt = 0; attempt < 80; attempt++) {
    const deck = buildLevelDeck(pool, profile);
    if (deck) return shuffle(deck);
  }
  // レベル別条件で見つからない場合は、既存の汎用ランダム生成にフォールバック
  return generateNpcDeck(allCards, level);
}

/** NPCの表示名を軽く生成する（Phase 3のストーリーモードで固有名に差し替え予定） */
export function generateNpcName(level: NpcLevel): string {
  const prefixes: Record<NpcLevel, string[]> = {
    Lv1: ['見習いの', '駆け出しの', '新米'],
    Lv2: ['腕利きの', '経験豊富な', '慣れた'],
    Lv3: ['熟練の', '手練れの', '選ばれし'],
    Lv4: ['伝説の', '最強クラスの', '無敗の'],
    Lv5: ['未知なる', '規格外の', '禁断の'],
  };
  const list = prefixes[level];
  const prefix = list[Math.floor(Math.random() * list.length)];
  return `${prefix}ジャナー`;
}

/* ---------------------------------------------------------------
   ストリートの死神　専用デッキ生成
   ------------------------------------------------------------------
   MP合計15固定・使用カードの制限なし（全Legacy使用可）・MP5か6とMP1を必須。
   カードの採用優先度はPotential Point合計と独自レアリティ（battleStreetRarity）の
   両方を加味し、SUR・UR・SRなど希少なカードを優先的に採用する。
--------------------------------------------------------------- */
const REAPER_RARITY_RANK: Record<string, number> = { N: 0, R: 1, SR: 2, UR: 3, SUR: 4, SSUR: 5, SSSUR: 6 };

/**
 * カードの採用優先度スコア（レアリティ＋PP合計）。
 * Void・聖・邪のカードは、低レアリティのものだと大きく減点し、高レアリティ（SR以上）のものは
 * 逆に加点することで、「Void/聖/邪を使う時は高レアリティのカードを使う」傾向を強める。
 */
function reaperCardScore(card: CardMaster): number {
  const rarityRank = REAPER_RARITY_RANK[card.battleStreetRarity] ?? 0;
  let score = rarityRank * 10 + ppTotal(card);
  const isRestricted = card.legacy === '聖' || card.legacy === '邪' || card.hasVoid;
  if (isRestricted) {
    score += rarityRank >= 2 ? 60 : -600; // SR未満のVoid/聖/邪は極力避ける
  }
  return score;
}

/** レアリティ優先度＋PP合計のスコアが高いカードを優先的に前方へ寄せた順序を作る */
export function reaperBiasedOrder<T extends CardMaster>(pool: T[]): T[] {
  const sorted = [...pool].sort((a, b) => reaperCardScore(b) - reaperCardScore(a));
  const cut = Math.max(1, Math.ceil(sorted.length * 0.5));
  return [...shuffle(sorted.slice(0, cut)), ...shuffle(sorted.slice(cut))];
}

function buildReaperDeckAttempt(pool: CardMaster[]): CardMaster[] | null {
  const deck: CardMaster[] = [];
  const usedIds = new Set<string>();
  function addCard(c: CardMaster) {
    deck.push(c);
    usedIds.add(c.id);
  }
  function available(pred: (c: CardMaster) => boolean): CardMaster[] {
    return pool.filter((c) => !usedIds.has(c.id) && pred(c));
  }

  if (!deck.some((c) => [5, 6].includes(c.monsterPride))) {
    const candidates = available((c) => [5, 6].includes(c.monsterPride));
    if (candidates.length === 0) return null;
    addCard(reaperBiasedOrder(candidates)[0]);
  }
  if (!deck.some((c) => c.monsterPride === 1)) {
    const candidates = available((c) => c.monsterPride === 1);
    if (candidates.length === 0) return null;
    addCard(reaperBiasedOrder(candidates)[0]);
  }
  if (deck.length > DECK_SIZE) return null;

  const currentSum = deck.reduce((s, c) => s + c.monsterPride, 0);
  const remainingSlots = DECK_SIZE - deck.length;
  const filled = searchFillForSum(available(() => true), remainingSlots, 15 - currentSum, 15 - currentSum, deck, false, reaperBiasedOrder);
  if (!filled) return null;
  filled.forEach(addCard);

  const validation = validateDeck(deck);
  if (!validation.isValid) return null;
  const totalMP = deck.reduce((s, c) => s + c.monsterPride, 0);
  if (totalMP !== 15) return null;
  return deck;
}

/**
 * ストリートの死神専用のデッキ生成。suggestedNpcLevelによる絞り込みは行わず、
 * 全カードプールから条件を満たすデッキを探す（レベル制限のない特別な相手のため）。
 */
export function generateReaperDeck(pool: CardMaster[]): CardMaster[] {
  for (let attempt = 0; attempt < 150; attempt++) {
    const deck = buildReaperDeckAttempt(pool);
    if (deck) return shuffle(deck);
  }
  // 条件を満たすデッキが見つからない場合は、既存のLv4プロファイルにフォールバック
  return generateLevelTunedNpcDeck(pool, 'Lv4') ?? [];
}
