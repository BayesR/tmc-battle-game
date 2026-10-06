import type { RoundRecord } from '../types/game';
import type { OnlineMatchState } from './types';

/**
 * 対戦ログ（運営者用の匿名統計）
 * ------------------------------------------------------------------
 * 試合が終わるたびに、1試合を1行として記録する。目的は、カードごとの勝率やよく使われるデッキを知り、
 * バランス調整や不具合の調査に使うこと。
 *
 * 保存するのは「使われたカードと勝敗」だけ。個人を特定できる情報は、一切保存しない：
 *   - 保存しない：表示名、再接続用の token、ルームコード、IPアドレス、接続情報
 *   - 保存する　：終了時刻（秒）、何戦目か、終了の理由、勝者の席（A/B）、両者のデッキ（カードID）、各ラウンドの結果
 * このファイルの buildMatchLog が「保存してよい項目」の唯一の入口になっている（新しい項目を足す時は、
 * 個人の特定につながらないかを確認すること）。
 */

/** ログを残す日数の既定値（これより古い記録は、毎日の掃除で削除する） */
export const LOG_RETENTION_DAYS_DEFAULT = 90;

export interface MatchLogRound {
  /** 席Aが出したカードID */
  a: string;
  /** 席Bが出したカードID */
  b: string;
  /** 勝者：A／B／D（引き分け） */
  w: 'A' | 'B' | 'D';
  /** Root Counterが発動したラウンドのみ 1 */
  rc?: 1;
  /** サドンデスのラウンドのみ 1 */
  sd?: 1;
}

export interface MatchLogRecord {
  /** 終了時刻（UNIX秒） */
  finishedAt: number;
  /** 何戦目か（1が最初の対戦。2以上は再戦） */
  matchNumber: number;
  endReason: 'normal' | 'forfeit' | 'abandoned';
  /** 勝者の席。勝者なしは null */
  winner: 'A' | 'B' | null;
  suddenDeathRounds: number;
  deckA: string[];
  deckB: string[];
  /** デッキの並びを問わずに同じデッキを数えるための、ID順に並べて連結したキー */
  deckAKey: string;
  deckBKey: string;
  rounds: MatchLogRound[];
}

const letter = (w: RoundRecord['result']['winner']): 'A' | 'B' | 'D' => (w === 'self' ? 'A' : w === 'enemy' ? 'B' : 'D');

/**
 * 終了した試合から、記録する内容を作る。
 * 両者のデッキが揃う前に終わった（ロビーでの退出・デッキ構築中の不戦敗など）場合は、記録しない（null）。
 */
export function buildMatchLog(state: OnlineMatchState, nowMs: number): MatchLogRecord | null {
  if (state.endReason === null) return null;
  if (!state.deckSubmitted.A || !state.deckSubmitted.B) return null;

  const toRound = (r: RoundRecord, suddenDeath: boolean): MatchLogRound => {
    const round: MatchLogRound = { a: r.selfCard.id, b: r.enemyCard.id, w: letter(r.result.winner) };
    if (r.result.rootCounter) round.rc = 1;
    if (suddenDeath) round.sd = 1;
    return round;
  };

  const deckA = state.hands.A.map((c) => c.id);
  const deckB = state.hands.B.map((c) => c.id);
  return {
    finishedAt: Math.floor(nowMs / 1000),
    matchNumber: state.matchNumber,
    endReason: state.endReason,
    winner: state.winner,
    suddenDeathRounds: state.suddenDeathRounds.length,
    deckA,
    deckB,
    deckAKey: [...deckA].sort().join(','),
    deckBKey: [...deckB].sort().join(','),
    rounds: [...state.rounds.map((r) => toRound(r, false)), ...state.suddenDeathRounds.map((r) => toRound(r, true))],
  };
}

// ---------------------------------------------------------------------------
// 保存（Cloudflare D1）。D1 の API のうち、使う部分だけを型にしてある（テストでは偽物に差し替える）
// ---------------------------------------------------------------------------
export interface D1Like {
  prepare(sql: string): { bind(...values: unknown[]): { run(): Promise<unknown> } };
}

/** テーブルの定義。worker/schema.sql と同じ内容（テストで一致を確認している） */
export const LOG_SCHEMA_SQL = `CREATE TABLE IF NOT EXISTS matches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  finished_at INTEGER NOT NULL,
  match_number INTEGER NOT NULL,
  end_reason TEXT NOT NULL,
  winner TEXT,
  sudden_death_rounds INTEGER NOT NULL DEFAULT 0,
  deck_a TEXT NOT NULL,
  deck_b TEXT NOT NULL,
  deck_a_key TEXT NOT NULL,
  deck_b_key TEXT NOT NULL,
  rounds TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_matches_finished_at ON matches (finished_at);
`;

export const INSERT_MATCH_SQL =
  'INSERT INTO matches (finished_at, match_number, end_reason, winner, sudden_death_rounds, deck_a, deck_b, deck_a_key, deck_b_key, rounds) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';

export const DELETE_OLD_MATCHES_SQL = 'DELETE FROM matches WHERE finished_at < ?';

export async function saveMatchLog(db: D1Like, rec: MatchLogRecord): Promise<void> {
  await db
    .prepare(INSERT_MATCH_SQL)
    .bind(
      rec.finishedAt,
      rec.matchNumber,
      rec.endReason,
      rec.winner,
      rec.suddenDeathRounds,
      JSON.stringify(rec.deckA),
      JSON.stringify(rec.deckB),
      rec.deckAKey,
      rec.deckBKey,
      JSON.stringify(rec.rounds)
    )
    .run();
}

/** 設定値（文字列）を、ログを残す日数にする。不正な値・未設定は既定値 */
export function parseRetentionDays(raw: string | undefined): number {
  const n = Number(raw);
  return Number.isFinite(n) && n >= 1 && n <= 3650 ? Math.floor(n) : LOG_RETENTION_DAYS_DEFAULT;
}

/** 保存期間を過ぎた記録を削除する */
export async function deleteOldMatchLogs(db: D1Like, nowMs: number, retentionDays: number): Promise<void> {
  const cutoff = Math.floor(nowMs / 1000) - retentionDays * 86_400;
  await db.prepare(DELETE_OLD_MATCHES_SQL).bind(cutoff).run();
}
