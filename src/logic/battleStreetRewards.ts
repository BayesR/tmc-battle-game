import type { CardMaster, BattleStreetRarity } from '../types/card';

export const PACK_COST = 5;

function pickUnownedByTier(pool: CardMaster[], ownedIds: string[], tier: BattleStreetRarity): CardMaster | null {
  const candidates = pool.filter((c) => c.battleStreetRarity === tier && !ownedIds.includes(c.id));
  if (candidates.length === 0) return null;
  return candidates[Math.floor(Math.random() * candidates.length)];
}

function pickRandomFrom(arr: CardMaster[]): CardMaster {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** 確定枠：未所持のR/SRから、R80%・SR20%の重みでランダムに1枚選ぶ（両方コンプ済みならノーマルへ） */
function fallbackWeightedRSR(pool: CardMaster[], ownedIds: string[]): CardMaster {
  const primaryTier: BattleStreetRarity = Math.random() < 0.9 ? 'R' : 'SR';
  const secondaryTier: BattleStreetRarity = primaryTier === 'R' ? 'SR' : 'R';
  return (
    pickUnownedByTier(pool, ownedIds, primaryTier) ||
    pickUnownedByTier(pool, ownedIds, secondaryTier) ||
    pickRandomFrom(pool.filter((c) => c.battleStreetRarity === 'N'))
  );
}

/** パックの確定枠：通常は未所持R/SR（R80%・SR20%の重み）だが、ごく低確率でUR/SUR/SSURに格上げされる */
function rollPackGuaranteedSlot(pool: CardMaster[], ownedIds: string[]): CardMaster {
  const r = Math.random();
  if (r < 0.00001) return pickUnownedByTier(pool, ownedIds, 'SSUR') || fallbackWeightedRSR(pool, ownedIds);
  if (r < 0.0005) return pickUnownedByTier(pool, ownedIds, 'SUR') || fallbackWeightedRSR(pool, ownedIds);
  if (r < 0.001) return pickUnownedByTier(pool, ownedIds, 'UR') || fallbackWeightedRSR(pool, ownedIds);
  return fallbackWeightedRSR(pool, ownedIds);
}

/** パックを1個開封する（ノーマル4枚＋確定枠1枚の計5枚を返す） */
export function openPack(pool: CardMaster[], ownedIds: string[]): CardMaster[] {
  const normalPool = pool.filter((c) => c.battleStreetRarity === 'N');
  const normals = Array.from({ length: 4 }).map(() => pickRandomFrom(normalPool));
  const guaranteed = rollPackGuaranteedSlot(pool, ownedIds);
  return [...normals, guaranteed];
}

interface RareRewardTable {
  UR: number;
  SUR: number;
  SSUR: number;
}

export function getRareRewardTable(bet: number): RareRewardTable {
  if (bet >= 30) return { UR: 0.3, SUR: 0.1, SSUR: 0.001 };
  if (bet >= 20) return { UR: 0.2, SUR: 0.08, SSUR: 0 };
  if (bet >= 10) return { UR: 0.1, SUR: 0.05, SSUR: 0 };
  if (bet >= 5) return { UR: 0.05, SUR: 0, SSUR: 0 };
  return { UR: 0.01, SUR: 0, SSUR: 0 };
}

/** レアキャラに勝利した際の報酬抽選（外れた場合は未所持のSR/Rを付与） */
export function rollRareWinReward(pool: CardMaster[], ownedIds: string[], bet: number): CardMaster {
  const table = getRareRewardTable(bet);
  const r = Math.random();
  if (r < table.SSUR) {
    return (
      pickUnownedByTier(pool, ownedIds, 'SSUR') ||
      pickUnownedByTier(pool, ownedIds, 'SUR') ||
      pickUnownedByTier(pool, ownedIds, 'UR') ||
      fallbackWeightedRSR(pool, ownedIds)
    );
  }
  if (r < table.SSUR + table.SUR) {
    return pickUnownedByTier(pool, ownedIds, 'SUR') || pickUnownedByTier(pool, ownedIds, 'UR') || fallbackWeightedRSR(pool, ownedIds);
  }
  if (r < table.SSUR + table.SUR + table.UR) {
    return pickUnownedByTier(pool, ownedIds, 'UR') || fallbackWeightedRSR(pool, ownedIds);
  }
  return fallbackWeightedRSR(pool, ownedIds);
}

export const EAT_EVENT_SCENARIOS: string[] = [
  'お金を支払おうとサイフを開いたらバッジが中から出てきた！',
  'コーヒーを飲んでいると知らない男性が近づいて声をかけてきた。「まだ戦うんだろ？俺の分も勝ってくれ」バッジを手渡された！',
  'たこ焼きを食べながらさっきの勝負の事を考えていた。「まだ全てを失ったわけではない…」ポケットに隠していた最後のバッジを取り出した！',
];
