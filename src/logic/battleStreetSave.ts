import type { CardMaster } from '../types/card';
import { validateDeck } from './deckRules';

const BATTLE_STREET_SAVE_KEY = 'tmc_battle_street_save';
const STARTER_BADGES = 2;

export interface BattleStreetSave {
  badges: number;
  ownedCardIds: string[];
}

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * 初回プレイ時の所持カード：NカードからMonster Pride 4・3・2・1を各2〜3枚、合計10枚をランダムに選ぶ。
 * （4段階×2〜3枚の組み合わせは常に合計10枚になるよう、2枚の段階を3枚に、残り2段階を2枚にする）
 */
export function computeStarterOwnedIds(pool: CardMaster[]): string[] {
  const mpTiers = [4, 3, 2, 1];
  const counts: Record<number, number> = { 1: 2, 2: 2, 3: 2, 4: 2 };
  const bumped = shuffle(mpTiers).slice(0, 2);
  bumped.forEach((mp) => {
    counts[mp] = 3;
  });

  const picked: CardMaster[] = [];
  mpTiers.forEach((mp) => {
    const candidates = pool.filter((c) => c.battleStreetRarity === 'N' && c.monsterPride === mp);
    const chosen = shuffle(candidates).slice(0, counts[mp]);
    picked.push(...chosen);
  });
  return picked.map((c) => c.id);
}

export function loadBattleStreetSave(pool: CardMaster[]): BattleStreetSave {
  try {
    const raw = window.localStorage.getItem(BATTLE_STREET_SAVE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (typeof parsed.badges === 'number' && Array.isArray(parsed.ownedCardIds)) {
        return parsed;
      }
    }
  } catch {
    // 読み込み失敗時は初期状態にフォールバック
  }
  return { badges: STARTER_BADGES, ownedCardIds: computeStarterOwnedIds(pool) };
}

export function persistBattleStreetSave(save: BattleStreetSave): void {
  try {
    window.localStorage.setItem(BATTLE_STREET_SAVE_KEY, JSON.stringify(save));
  } catch {
    // 保存できない環境では静かに諦める
  }
}

export function resetBattleStreetSave(): void {
  try {
    window.localStorage.removeItem(BATTLE_STREET_SAVE_KEY);
  } catch {
    // noop
  }
}

// deckRules は他モジュールから battleStreet 機能内でも使うため re-export しておく
export { validateDeck };
