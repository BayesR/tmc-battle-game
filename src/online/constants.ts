/**
 * オンライン対戦の時間・上限に関する設定値。
 * ※ 数値は暫定（テストプレイで調整する想定）。変更はこのファイルだけで済むようにしてある。
 */

/** カード選択の制限時間。時間切れになったら、未選択の席は残りカードからランダムに自動選択される */
export const PICK_TIME_MS = 60_000;

/** 結果公開後、両者が「次へ」を押さなくても自動で次へ進むまでの時間 */
export const REVEAL_AUTO_ADVANCE_MS = 8_000;

/** 切断してから不戦敗になるまでの猶予（この間に戻ってくれば席に復帰できる） */
export const DISCONNECT_GRACE_MS = 60_000;

/** デッキ構築の制限時間。過ぎても未提出の席は不戦敗 */
export const DECK_TIME_MS = 180_000;

/** 表示名の最大文字数 */
export const MAX_NAME_LENGTH = 20;

/** 1つのルームに同時接続できる観戦者の上限（フェーズ1.5で使用） */
export const MAX_SPECTATORS = 20;
