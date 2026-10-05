import type { SavedDeck } from '../logic/savedDecks';

/**
 * オンライン対戦用の保存済みデッキ（localStorage）。
 * ストーリーモード（NPC対戦・バトルストリート）の保存済みデッキとは、保存先のキーを分けてある。
 * オンライン対戦は全カードから組めるが、ストーリーモードは所持カードしか使えないため、
 * 同じ保存枠を共有すると、所持していないカードを含むデッキが混ざってしまう。
 */
const ONLINE_DECKS_KEY = 'tmc_battle_game_online_decks';

export function loadOnlineDecks(): SavedDeck[] {
  try {
    const raw = window.localStorage.getItem(ONLINE_DECKS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (d): d is SavedDeck =>
        typeof d === 'object' && d !== null && typeof d.id === 'string' && typeof d.name === 'string' && Array.isArray(d.cardIds)
    );
  } catch {
    return [];
  }
}

export function persistOnlineDecks(decks: SavedDeck[]): void {
  try {
    window.localStorage.setItem(ONLINE_DECKS_KEY, JSON.stringify(decks));
  } catch {
    // 保存できない環境では静かに諦める
  }
}
