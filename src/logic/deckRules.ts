import type { CardMaster } from '../types/card';

/** 1デッキの必要枚数（Phase 1固定。将来ルール可変にする場合はここを起点に拡張） */
export const DECK_SIZE = 5;

/** 聖・邪・Void 合計の上限枚数 */
export const RESTRICTED_TOTAL_LIMIT = 3;
/** Void自体の上限枚数（RESTRICTED_TOTAL_LIMIT の内数） */
export const VOID_LIMIT = 1;
/** Monster Pride合計の上限 */
export const MONSTER_PRIDE_TOTAL_LIMIT = 15;

export interface DeckValidationResult {
  isValid: boolean;
  errors: string[];
  monsterPrideTotal: number;
  restrictedCount: number; // 聖・邪・Void の合計（重複カードは1枚として数える）
  voidCount: number;
}

/**
 * デッキ構築ルールの検証（プレイヤー・NPC共通で使用）
 *
 * BATTLE RULES:
 * 1. 聖・邪・Voidは1デッキ合計3枚（Void1枚）
 * 2. Monster Pride合計は1デッキ15以下
 * 3. 同一カード内でPotential Pointの重複Legacy不可 → これはカードデータ自体の制約
 *    （カードマスターの時点で保証されている前提のため、ここではデッキ内の
 *    重複カード採用のチェックは行わない）
 */
export function validateDeck(cards: CardMaster[]): DeckValidationResult {
  const errors: string[] = [];

  if (cards.length !== DECK_SIZE) {
    errors.push(`デッキは${DECK_SIZE}枚である必要があります（現在${cards.length}枚）`);
  }

  const monsterPrideTotal = cards.reduce((sum, c) => sum + c.monsterPride, 0);
  if (monsterPrideTotal > MONSTER_PRIDE_TOTAL_LIMIT) {
    errors.push(
      `Monster Pride合計は${MONSTER_PRIDE_TOTAL_LIMIT}以下である必要があります（現在${monsterPrideTotal}）`
    );
  }

  // 聖・邪・Void はカード単位で重複カウントしない（例：邪 かつ Void の1枚は1枚として数える）
  const restrictedCards = cards.filter(
    (c) => c.legacy === '聖' || c.legacy === '邪' || c.hasVoid
  );
  const restrictedCount = restrictedCards.length;
  if (restrictedCount > RESTRICTED_TOTAL_LIMIT) {
    errors.push(
      `聖・邪・Voidのカードは合計${RESTRICTED_TOTAL_LIMIT}枚までです（現在${restrictedCount}枚）`
    );
  }

  const voidCount = cards.filter((c) => c.hasVoid).length;
  if (voidCount > VOID_LIMIT) {
    errors.push(`Voidを持つカードは${VOID_LIMIT}枚までです（現在${voidCount}枚）`);
  }

  return {
    isValid: errors.length === 0,
    errors,
    monsterPrideTotal,
    restrictedCount,
    voidCount,
  };
}
