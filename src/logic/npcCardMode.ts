import type { CardMaster } from '../types/card';

/**
 * NPC対戦で使えるカードの切り替え
 * ------------------------------------------------------------------
 *   - owned：所持カード（バトルストリートで集めたカード）だけ。今までどおりで、標準
 *   - all  ：全カード（練習）。保存済みデッキは、オンライン対戦と共通の保存枠を使う
 *            （練習で作ったデッキを、そのままオンライン対戦で選べるようにするため）
 * バトルストリートは、この切り替えの影響を受けず、常に所持カードだけで、保存枠も別。
 */
export type NpcCardMode = 'owned' | 'all';

export const NPC_CARD_MODE_KEY = 'tmc_battle_game_npc_card_mode';
export const DECK_SIZE_LIMIT = 5;

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** 保存された値を、モードにする。不正な値や未保存は、標準の「所持カード」 */
export function parseNpcCardMode(raw: string | null | undefined): NpcCardMode {
  return raw === 'all' ? 'all' : 'owned';
}

export function loadNpcCardMode(storage: StorageLike | null): NpcCardMode {
  try {
    return parseNpcCardMode(storage?.getItem(NPC_CARD_MODE_KEY));
  } catch {
    return 'owned';
  }
}

export function saveNpcCardMode(storage: StorageLike | null, mode: NpcCardMode): void {
  try {
    storage?.setItem(NPC_CARD_MODE_KEY, mode);
  } catch {
    // 保存できない環境（プライベートモード等）では、次回は標準に戻るだけ
  }
}

/** 今のモードで使えるカードのプール */
export function poolForMode(mode: NpcCardMode, owned: readonly CardMaster[], full: readonly CardMaster[]): CardMaster[] {
  return [...(mode === 'all' ? full : owned)];
}

/** 選んでいたデッキのうち、新しいプールで使えるカードだけを、順番を保って残す（最大5枚、重複なし） */
export function keepUsableIds(ids: readonly string[], pool: readonly CardMaster[]): string[] {
  const usable = new Set(pool.map((c) => c.id));
  const kept: string[] = [];
  for (const id of ids) {
    if (usable.has(id) && !kept.includes(id)) kept.push(id);
    if (kept.length >= DECK_SIZE_LIMIT) break;
  }
  return kept;
}

/** モードを切り替えて、外れたカードがあった時の案内文（なければ null） */
export function describeModeSwitch(before: readonly string[], after: readonly string[], to: NpcCardMode): string | null {
  const dropped = before.length - after.length;
  if (dropped <= 0) return null;
  return to === 'owned'
    ? `所持していないカード${dropped}枚を、デッキから外しました`
    : `使えないカード${dropped}枚を、デッキから外しました`;
}
