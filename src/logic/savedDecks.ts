const SAVED_DECKS_KEY = 'tmc_battle_game_saved_decks';

export interface SavedDeck {
  id: string;
  name: string;
  cardIds: string[];
}

/**
 * 自分のデッキの保存・読み込み（localStorage）。
 * Phase 2以降、ストーリーモードでも同じ保存枠を呼び出せるようにする想定のため、
 * UIコンポーネントに依存しない単体モジュールとして切り出してある。
 */
export function loadSavedDecks(): SavedDeck[] {
  try {
    const raw = window.localStorage.getItem(SAVED_DECKS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function persistSavedDecks(decks: SavedDeck[]): void {
  try {
    window.localStorage.setItem(SAVED_DECKS_KEY, JSON.stringify(decks));
  } catch {
    // 保存できない環境（プライベートモード等）では静かに諦める
  }
}

export function resetSavedDecks(): void {
  try {
    window.localStorage.removeItem(SAVED_DECKS_KEY);
  } catch {
    // noop
  }
}
