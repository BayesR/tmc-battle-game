/**
 * 対戦ログの集計（運営者用）。D1 は SQLite なので、SQLite の標準の関数（json_each など）だけを使っている。
 * 実行は `npm run stats`（scripts/stats.mjs）。SQL の内容は、実際の SQLite に対するテストで確認している。
 *
 * 数え方：
 *   - カードごとの集計は、通常の決着（end_reason = 'normal'）の試合だけが対象（途中で終わった試合は、全てのカードが出ていないため）
 *   - 「デッキ勝率」＝そのカードを入れたデッキが、試合に勝った割合
 *   - 「ラウンド勝率」＝そのカードを出したラウンドに、勝った割合（引き分けは勝ちに含めない）。サドンデスの再戦ラウンドは含めない
 */
export interface StatsReport {
  key: string;
  title: string;
  /** 列の表示名（SQL の列名 → 表示名）。名前を引ける列（card・deck_key）は、カード名に置き換えて表示する */
  columns: { key: string; label: string }[];
  sql: string;
}

const NORMAL_DECKS = `d AS (
  SELECT deck_a AS deck, deck_a_key AS deck_key, CASE WHEN winner = 'A' THEN 1 ELSE 0 END AS win FROM matches WHERE end_reason = 'normal'
  UNION ALL
  SELECT deck_b, deck_b_key, CASE WHEN winner = 'B' THEN 1 ELSE 0 END FROM matches WHERE end_reason = 'normal'
)`;

export const STATS_REPORTS: StatsReport[] = [
  {
    key: 'summary',
    title: '日別の試合数（直近14日・日本時間）',
    columns: [
      { key: 'day', label: '日付' },
      { key: 'matches', label: '試合数' },
      { key: 'normal', label: '通常決着' },
      { key: 'forfeit', label: '不戦' },
      { key: 'sudden_death', label: 'サドンデス' },
      { key: 'rematches', label: '再戦' },
    ],
    sql: `SELECT date(finished_at, 'unixepoch', '+9 hours') AS day,
       COUNT(*) AS matches,
       SUM(end_reason = 'normal') AS normal,
       SUM(end_reason = 'forfeit') AS forfeit,
       SUM(sudden_death_rounds > 0) AS sudden_death,
       SUM(match_number > 1) AS rematches
FROM matches
WHERE finished_at >= CAST(strftime('%s', 'now') AS INTEGER) - 14 * 86400
GROUP BY day
ORDER BY day DESC`,
  },
  {
    key: 'reasons',
    title: '終わり方の内訳（全期間）',
    columns: [
      { key: 'end_reason', label: '終わり方' },
      { key: 'matches', label: '試合数' },
      { key: 'avg_rounds', label: '平均ラウンド数' },
    ],
    sql: `SELECT end_reason, COUNT(*) AS matches, ROUND(AVG(json_array_length(rounds)), 1) AS avg_rounds
FROM matches
GROUP BY end_reason
ORDER BY matches DESC`,
  },
  {
    key: 'cards',
    title: 'カードごとの採用数と勝率（採用数の多い順・上位100）',
    columns: [
      { key: 'card', label: 'カード' },
      { key: 'decks', label: '採用デッキ数' },
      { key: 'deck_win_pct', label: 'デッキ勝率%' },
      { key: 'plays', label: '出た回数' },
      { key: 'round_win_pct', label: 'ラウンド勝率%' },
    ],
    sql: `WITH ${NORMAL_DECKS},
deck_cards AS (
  SELECT je.value AS card, COUNT(*) AS decks, SUM(d.win) AS deck_wins
  FROM d, json_each(d.deck) AS je
  GROUP BY je.value
),
r AS (
  SELECT json_extract(je.value, '$.a') AS a, json_extract(je.value, '$.b') AS b, json_extract(je.value, '$.w') AS w
  FROM matches m, json_each(m.rounds) AS je
  WHERE m.end_reason = 'normal' AND json_extract(je.value, '$.sd') IS NULL
),
plays AS (
  SELECT a AS card, CASE WHEN w = 'A' THEN 1 ELSE 0 END AS win FROM r
  UNION ALL
  SELECT b, CASE WHEN w = 'B' THEN 1 ELSE 0 END FROM r
),
play_cards AS (
  SELECT card, COUNT(*) AS plays, SUM(win) AS round_wins FROM plays GROUP BY card
)
SELECT dc.card AS card,
       dc.decks AS decks,
       ROUND(100.0 * dc.deck_wins / dc.decks, 1) AS deck_win_pct,
       COALESCE(pc.plays, 0) AS plays,
       ROUND(100.0 * COALESCE(pc.round_wins, 0) / NULLIF(pc.plays, 0), 1) AS round_win_pct
FROM deck_cards dc
LEFT JOIN play_cards pc ON pc.card = dc.card
ORDER BY dc.decks DESC, dc.card
LIMIT 100`,
  },
  {
    key: 'decks',
    title: 'よく使われたデッキ（同じ5枚の組み合わせ・上位10）',
    columns: [
      { key: 'deck_key', label: 'デッキ' },
      { key: 'uses', label: '使用回数' },
      { key: 'win_pct', label: '勝率%' },
    ],
    sql: `WITH ${NORMAL_DECKS}
SELECT deck_key, COUNT(*) AS uses, ROUND(100.0 * SUM(win) / COUNT(*), 1) AS win_pct
FROM d
GROUP BY deck_key
ORDER BY uses DESC, deck_key
LIMIT 10`,
  },
];

export function findReports(key: string | undefined): StatsReport[] {
  if (!key || key === 'all') return STATS_REPORTS;
  return STATS_REPORTS.filter((r) => r.key === key);
}
