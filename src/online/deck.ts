import type { CardMaster } from '../types/card';
import { DECK_SIZE, validateDeck } from '../logic/deckRules';

export type OnlineDeckValidation =
  | { ok: true; cards: CardMaster[] }
  | { ok: false; errors: string[] };

/**
 * サーバー側で行うデッキ検証。クライアントから届いた内容は一切信用せず、
 * 「カードIDの配列」だけを受け取り、サーバーが持つカードプールから実体を引き直す
 * （クライアントがMonster Prideなどを書き換えたカードを送り込む不正を防ぐ）。
 *
 * 検証内容：
 *   - 文字列IDの配列で、ちょうど5枚
 *   - 同じカードの重複なし
 *   - 全てカードプールに実在するID
 *   - 既存のBATTLE RULES（Monster Pride合計15以下／聖・邪・Voidは合計3枚まで／Voidは1枚まで）
 *
 * 使えるカードは「カードプール全体」（ストーリーモードの所持カード制限とは無関係）。
 */
export function validateOnlineDeck(cardIds: unknown, pool: readonly CardMaster[]): OnlineDeckValidation {
  if (!Array.isArray(cardIds) || !cardIds.every((id) => typeof id === 'string')) {
    return { ok: false, errors: ['デッキの形式が正しくありません'] };
  }
  if (cardIds.length !== DECK_SIZE) {
    return { ok: false, errors: [`デッキは${DECK_SIZE}枚である必要があります（現在${cardIds.length}枚）`] };
  }
  if (new Set(cardIds).size !== cardIds.length) {
    return { ok: false, errors: ['同じカードを複数枚入れることはできません'] };
  }

  const byId = new Map(pool.map((c) => [c.id, c] as const));
  const cards: CardMaster[] = [];
  for (const id of cardIds as string[]) {
    const card = byId.get(id);
    if (!card) return { ok: false, errors: ['存在しないカードが含まれています'] };
    cards.push(card);
  }

  const result = validateDeck(cards);
  if (!result.isValid) return { ok: false, errors: result.errors };
  return { ok: true, cards };
}
