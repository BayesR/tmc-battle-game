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

/**
 * ロビー（相手の参加待ち）で切断した場合の猶予。
 * 招待リンクをLINEなどで送るためにアプリを切り替えると、ブラウザの接続が切れることがあるため、
 * 対戦中（DISCONNECT_GRACE_MS）より長くしてある。
 */
export const LOBBY_DISCONNECT_GRACE_MS = 300_000;

/** 相手が参加しないままロビーを維持できる最大時間。過ぎるとルームは勝者なしで終了する */
export const LOBBY_EXPIRE_MS = 1_800_000;
