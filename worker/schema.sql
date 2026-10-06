-- 対戦ログ（運営者用の匿名統計）のテーブル定義。
-- 個人を特定できる情報（表示名・token・IPアドレスなど）は含めない。
-- 内容は src/online/matchLog.ts の LOG_SCHEMA_SQL と同じ（テストで一致を確認している）。
CREATE TABLE IF NOT EXISTS matches (
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
