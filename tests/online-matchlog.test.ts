import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  DELETE_OLD_MATCHES_SQL,
  INSERT_MATCH_SQL,
  LOG_RETENTION_DAYS_DEFAULT,
  LOG_SCHEMA_SQL,
  buildMatchLog,
  deleteOldMatchLogs,
  parseRetentionDays,
  saveMatchLog,
  type D1Like,
  type MatchLogRecord,
} from '../src/online/matchLog';
import { STATS_REPORTS, findReports } from '../src/online/statsQueries';
import { buildCardLabeler, describeCard, displayWidth, parseWranglerD1Json, renderTable } from '../src/online/statsFormat';
import { CARD_POOL } from './helpers';
import { createInitialOnlineState, makeInstanceId, onlineReducer, type OnlineAction, type OnlineContext } from '../src/online/match';
import type { OnlineMatchState } from '../src/online/types';
import { deckOf, seededRandom } from './helpers';

// ---------------------------------------------------------------------------
// 試合を終わらせた状態を作る道具（合成カード：強さだけで勝敗が決まる）
// ---------------------------------------------------------------------------
const dA = deckOf('a', [3, 3, 3, 3, 3]);
const dB = deckOf('b', [2, 2, 2, 2, 2]);
const ctx: OnlineContext = { pool: [...dA, ...dB], rng: seededRandom(1) };
const ids = (d: { id: string }[]) => d.map((c) => c.id);

function run(state: OnlineMatchState, ...actions: OnlineAction[]): OnlineMatchState {
  let s = state;
  for (const a of actions) {
    const r = onlineReducer(s, a, ctx);
    assert.equal(r.error, null, `${a.type}: ${r.error?.message}`);
    s = r.state;
  }
  return s;
}
const seated = () => run(createInitialOnlineState(), { type: 'SEAT', seat: 'A', name: 'アキ' }, { type: 'SEAT', seat: 'B', name: 'ボブ' });
const decked = () => run(seated(), { type: 'SUBMIT_DECK', seat: 'A', cardIds: ids(dA) }, { type: 'SUBMIT_DECK', seat: 'B', cardIds: ids(dB) });
const playRound = (s: OnlineMatchState, a: string, b: string) =>
  run(s, { type: 'PICK', seat: 'A', instanceId: makeInstanceId('A', a) }, { type: 'PICK', seat: 'B', instanceId: makeInstanceId('B', b) }, { type: 'ACK_REVEAL', seat: 'A' }, { type: 'ACK_REVEAL', seat: 'B' });
function finishedNormally(): OnlineMatchState {
  let s = decked();
  for (let i = 1; i <= 5; i++) s = playRound(s, `a${i}`, `b${i}`);
  assert.equal(s.phase, 'finished');
  return s;
}

// ---------------------------------------------------------------------------
// 記録の内容
// ---------------------------------------------------------------------------
test('通常の決着：デッキ・各ラウンドの結果・勝者が記録される', () => {
  const rec = buildMatchLog(finishedNormally(), 1_700_000_123_456)!;
  assert.equal(rec.finishedAt, 1_700_000_123, '終了時刻は秒単位');
  assert.equal(rec.matchNumber, 1);
  assert.equal(rec.endReason, 'normal');
  assert.equal(rec.winner, 'A');
  assert.equal(rec.suddenDeathRounds, 0);
  assert.deepEqual(rec.deckA, ['a1', 'a2', 'a3', 'a4', 'a5']);
  assert.deepEqual(rec.deckB, ['b1', 'b2', 'b3', 'b4', 'b5']);
  assert.equal(rec.rounds.length, 5);
  assert.deepEqual(rec.rounds[0], { a: 'a1', b: 'b1', w: 'A' });
});

test('デッキのキーは、並びを問わず同じデッキを同じ値にする', () => {
  const rec = buildMatchLog(finishedNormally(), 0)!;
  assert.equal(rec.deckAKey, 'a1,a2,a3,a4,a5');
  const shuffled = buildMatchLog({ ...finishedNormally(), hands: { A: [...dA].reverse().map((c) => ({ ...c, instanceId: `A:${c.id}` })), B: finishedNormally().hands.B } }, 0)!;
  assert.equal(shuffled.deckAKey, rec.deckAKey);
  assert.deepEqual(shuffled.deckA, ['a5', 'a4', 'a3', 'a2', 'a1'], 'デッキの並び自体は、提出された順のまま');
});

test('個人を特定できる情報（表示名・token・ルームコードなど）は、記録に含まれない', () => {
  const state = finishedNormally();
  const json = JSON.stringify(buildMatchLog(state, 1_700_000_000_000));
  for (const secret of ['アキ', 'ボブ', 'ジャナー', 'token', 'tok-secret']) assert.ok(!json.includes(secret), `記録に「${secret}」が含まれている`);
  // 記録の項目は、決めた項目だけ（新しい項目が増えたら、このテストで気づける）
  assert.deepEqual(Object.keys(buildMatchLog(state, 0)!).sort(), [
    'deckA', 'deckAKey', 'deckB', 'deckBKey', 'endReason', 'finishedAt', 'matchNumber', 'rounds', 'suddenDeathRounds', 'winner',
  ]);
});

test('サドンデスのラウンドには、印が付く', () => {
  // サドンデス：A:[3,3,3,3,2] B:[3,3,3,3,2] で、1勝1敗の引き分け＋サドンデスで決着
  const da = deckOf('a', [3, 3, 3, 3, 2]);
  const db = deckOf('b', [3, 3, 3, 3, 2]);
  const c: OnlineContext = { pool: [...da, ...db], rng: seededRandom(1) };
  const go = (s: OnlineMatchState, ...acts: OnlineAction[]) => acts.reduce((st, a) => {
    const r = onlineReducer(st, a, c);
    assert.equal(r.error, null);
    return r.state;
  }, s);
  let s = go(seated(), { type: 'SUBMIT_DECK', seat: 'A', cardIds: ids(da) }, { type: 'SUBMIT_DECK', seat: 'B', cardIds: ids(db) });
  const round = (st: OnlineMatchState, a: string, b: string) =>
    go(st, { type: 'PICK', seat: 'A', instanceId: `A:${a}` }, { type: 'PICK', seat: 'B', instanceId: `B:${b}` }, { type: 'ACK_REVEAL', seat: 'A' }, { type: 'ACK_REVEAL', seat: 'B' });
  s = round(s, 'a5', 'b1'); // Bの勝ち
  s = round(s, 'a1', 'b5'); // Aの勝ち
  s = round(s, 'a2', 'b2');
  s = round(s, 'a3', 'b3');
  s = round(s, 'a4', 'b4');
  s = round(s, 'a1', 'b5'); // サドンデス：Aの勝ちで決着
  assert.equal(s.phase, 'finished');
  const rec = buildMatchLog(s, 0)!;
  assert.equal(rec.suddenDeathRounds, 1);
  assert.equal(rec.rounds.length, 6);
  assert.equal(rec.rounds.filter((r) => r.sd === 1).length, 1);
  assert.deepEqual(rec.rounds[5], { a: 'a1', b: 'b5', w: 'A', sd: 1 });
  assert.equal(rec.rounds[0].sd, undefined, '通常のラウンドには、サドンデスの印が付かない');
});

test('Root Counter（MP1がMP5に勝つ）が発動したラウンドには、印が付く', () => {
  const da = deckOf('a', [1, 3, 3, 3, 3]);
  const db = deckOf('b', [5, 2, 2, 2, 1]);
  const c: OnlineContext = { pool: [...da, ...db], rng: seededRandom(1) };
  const go = (s: OnlineMatchState, ...acts: OnlineAction[]) => acts.reduce((st, a) => {
    const r = onlineReducer(st, a, c);
    assert.equal(r.error, null, r.error?.message);
    return r.state;
  }, s);
  let s = go(seated(), { type: 'SUBMIT_DECK', seat: 'A', cardIds: ids(da) }, { type: 'SUBMIT_DECK', seat: 'B', cardIds: ids(db) });
  const round = (st: OnlineMatchState, a: string, b: string) =>
    go(st, { type: 'PICK', seat: 'A', instanceId: `A:${a}` }, { type: 'PICK', seat: 'B', instanceId: `B:${b}` }, { type: 'ACK_REVEAL', seat: 'A' }, { type: 'ACK_REVEAL', seat: 'B' });
  s = round(s, 'a1', 'b1'); // MP1 vs MP5：Root Counter
  s = round(s, 'a2', 'b2');
  s = round(s, 'a3', 'b3');
  s = round(s, 'a4', 'b4');
  s = round(s, 'a5', 'b5');
  const rec = buildMatchLog(s, 0)!;
  assert.deepEqual(rec.rounds[0], { a: 'a1', b: 'b1', w: 'A', rc: 1 });
  assert.equal(rec.rounds[1].rc, undefined, 'Root Counter でないラウンドには、印が付かない');
});

test('不戦敗でも、両者のデッキが揃っていれば記録される（それまでのラウンドと、終わり方つき）', () => {
  let s = playRound(decked(), 'a1', 'b1');
  s = run(s, { type: 'FORFEIT', seat: 'B', cause: 'disconnect' });
  const rec = buildMatchLog(s, 0)!;
  assert.equal(rec.endReason, 'forfeit');
  assert.equal(rec.winner, 'A');
  assert.equal(rec.rounds.length, 1);
});

test('両者のデッキが揃う前に終わった試合は、記録しない', () => {
  assert.equal(buildMatchLog(run(seated(), { type: 'ABANDON' }), 0), null, 'デッキ構築前の中止');
  const oneDeck = run(seated(), { type: 'SUBMIT_DECK', seat: 'A', cardIds: ids(dA) }, { type: 'FORFEIT', seat: 'B', cause: 'deck-timeout' });
  assert.equal(buildMatchLog(oneDeck, 0), null, 'デッキが片方しか無い');
  assert.equal(buildMatchLog(createInitialOnlineState(), 0), null, 'まだ終わっていない');
  assert.equal(buildMatchLog(decked(), 0), null, '対戦中');
});

test('再戦の2戦目は、何戦目かが記録される', () => {
  let s = finishedNormally();
  s = run(s, { type: 'REMATCH_VOTE', seat: 'A' }, { type: 'REMATCH_VOTE', seat: 'B' }, { type: 'SUBMIT_DECK', seat: 'A', cardIds: ids(dA) }, { type: 'SUBMIT_DECK', seat: 'B', cardIds: ids(dB) });
  for (let i = 1; i <= 5; i++) s = playRound(s, `a${i}`, `b${i}`);
  assert.equal(buildMatchLog(s, 0)!.matchNumber, 2);
});

// ---------------------------------------------------------------------------
// 保存（D1は偽物に差し替える）
// ---------------------------------------------------------------------------
function fakeD1() {
  const calls: { sql: string; values: unknown[] }[] = [];
  const db: D1Like = {
    prepare: (sql) => ({
      bind: (...values) => ({
        run: async () => {
          calls.push({ sql, values });
        },
      }),
    }),
  };
  return { db, calls };
}

test('saveMatchLog：決まったSQLで、値が過不足なく渡される（デッキと各ラウンドはJSON文字列）', async () => {
  const { db, calls } = fakeD1();
  const rec = buildMatchLog(finishedNormally(), 1_700_000_000_000)!;
  await saveMatchLog(db, rec);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].sql, INSERT_MATCH_SQL);
  assert.equal(calls[0].values.length, (INSERT_MATCH_SQL.match(/\?/g) ?? []).length, '? の数と、渡す値の数が一致');
  assert.equal(calls[0].values[0], 1_700_000_000);
  assert.equal(calls[0].values[5], JSON.stringify(rec.deckA));
  assert.equal(calls[0].values[9], JSON.stringify(rec.rounds));
});

test('deleteOldMatchLogs：保存期間より古いものだけを消す境界の時刻を渡す', async () => {
  const { db, calls } = fakeD1();
  await deleteOldMatchLogs(db, 1_700_000_000_000, 90);
  assert.equal(calls[0].sql, DELETE_OLD_MATCHES_SQL);
  assert.deepEqual(calls[0].values, [1_700_000_000 - 90 * 86_400]);
});

test('保存日数の設定値：不正な値や未設定は、既定の90日', () => {
  assert.equal(LOG_RETENTION_DAYS_DEFAULT, 90);
  assert.equal(parseRetentionDays(undefined), 90);
  assert.equal(parseRetentionDays(''), 90);
  assert.equal(parseRetentionDays('abc'), 90);
  assert.equal(parseRetentionDays('0'), 90);
  assert.equal(parseRetentionDays('-5'), 90);
  assert.equal(parseRetentionDays('999999'), 90);
  assert.equal(parseRetentionDays('30'), 30);
  assert.equal(parseRetentionDays('7.9'), 7);
});

test('worker/schema.sql は、コードの中のテーブル定義と同じ内容（コメント行を除く）', () => {
  const file = fs.readFileSync(path.join(__dirname, '..', 'worker', 'schema.sql'), 'utf8');
  const body = file.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
  assert.equal(body.trim(), LOG_SCHEMA_SQL.trim());
});

// ---------------------------------------------------------------------------
// 実際のSQLite（D1と同じ仕組み）での確認。node:sqlite が使えない環境では、自動で飛ばす
// ---------------------------------------------------------------------------
let sqlite: typeof import('node:sqlite') | null = null;
try {
  sqlite = require('node:sqlite');
} catch {
  sqlite = null;
}
const skipSql = sqlite ? false : 'この環境では node:sqlite が使えないため、実際のSQLでの確認を飛ばす';

function openDb() {
  const raw = new sqlite!.DatabaseSync(':memory:');
  raw.exec(LOG_SCHEMA_SQL);
  const d1: D1Like = {
    prepare: (sql) => ({
      bind: (...v) => ({
        run: async () => {
          raw.prepare(sql).run(...(v as never[]));
        },
      }),
    }),
  };
  return { raw, d1 };
}

const NOW = Date.now();
const rec = (over: Partial<MatchLogRecord> & Pick<MatchLogRecord, 'deckA' | 'deckB' | 'rounds'>): MatchLogRecord => ({
  finishedAt: Math.floor(NOW / 1000),
  matchNumber: 1,
  endReason: 'normal',
  winner: 'A',
  suddenDeathRounds: 0,
  deckAKey: [...over.deckA].sort().join(','),
  deckBKey: [...over.deckB].sort().join(','),
  ...over,
});
const C = ['c1', 'c2', 'c3', 'c4', 'c5'];
const D = ['d1', 'd2', 'd3', 'd4', 'd5'];
const E = ['e1', 'e2', 'e3', 'e4', 'e5'];
const r = (a: string, b: string, w: 'A' | 'B' | 'D', extra: object = {}) => ({ a, b, w, ...extra }) as MatchLogRecord['rounds'][number];

async function seedMatches(d1: D1Like) {
  // 試合1：Aの勝ち（3-2）
  await saveMatchLog(d1, rec({ deckA: C, deckB: D, winner: 'A', rounds: [r('c1', 'd1', 'A'), r('c2', 'd2', 'A'), r('c3', 'd3', 'B'), r('c4', 'd4', 'A'), r('c5', 'd5', 'B')] }));
  // 試合2（再戦）：Bの勝ち。Aは c5 の代わりに c6
  await saveMatchLog(d1, rec({ deckA: ['c1', 'c2', 'c3', 'c4', 'c6'], deckB: D, winner: 'B', matchNumber: 2, rounds: [r('c1', 'd1', 'B'), r('c2', 'd2', 'B'), r('c3', 'd3', 'B'), r('c4', 'd4', 'A'), r('c6', 'd5', 'D')] }));
  // 試合3：1勝1敗3引き分け → サドンデスでAの勝ち（サドンデスのラウンドは、ラウンド勝率に含めない）
  await saveMatchLog(d1, rec({ deckA: C, deckB: E, winner: 'A', suddenDeathRounds: 1, rounds: [r('c1', 'e1', 'A'), r('c2', 'e2', 'B'), r('c3', 'e3', 'D'), r('c4', 'e4', 'D'), r('c5', 'e5', 'D'), r('c1', 'e1', 'A', { sd: 1 })] }));
  // 試合4：不戦敗（カードごとの集計には含めない）
  await saveMatchLog(d1, rec({ deckA: C, deckB: D, winner: 'A', endReason: 'forfeit', rounds: [r('c1', 'd1', 'A')] }));
}

const report = (key: string) => STATS_REPORTS.find((x) => x.key === key)!;
const sumOf = (rows: Record<string, unknown>[], key: string) => rows.reduce((n, row) => n + Number(row[key]), 0);

test('実際のSQL：テーブルを作り、試合を保存して読み戻せる（JSONの中身も保たれる）', { skip: skipSql }, async () => {
  const { raw, d1 } = openDb();
  await saveMatchLog(d1, buildMatchLog(finishedNormally(), 1_700_000_000_000)!);
  const row = raw.prepare('SELECT * FROM matches').get() as Record<string, unknown>;
  assert.equal(row.end_reason, 'normal');
  assert.equal(row.winner, 'A');
  assert.deepEqual(JSON.parse(String(row.deck_a)), ['a1', 'a2', 'a3', 'a4', 'a5']);
  assert.equal(JSON.parse(String(row.rounds)).length, 5);
  assert.equal(row.deck_a_key, 'a1,a2,a3,a4,a5');
});

test('実際のSQL：テーブルの作成を2回実行しても壊れない（IF NOT EXISTS）', { skip: skipSql }, () => {
  const { raw } = openDb();
  assert.doesNotThrow(() => raw.exec(LOG_SCHEMA_SQL));
});

test('実際のSQL「日別の試合数」：合計が、保存した試合と一致する', { skip: skipSql }, async () => {
  const { raw, d1 } = openDb();
  await seedMatches(d1);
  const rows = raw.prepare(report('summary').sql).all() as Record<string, unknown>[];
  assert.equal(sumOf(rows, 'matches'), 4);
  assert.equal(sumOf(rows, 'normal'), 3);
  assert.equal(sumOf(rows, 'forfeit'), 1);
  assert.equal(sumOf(rows, 'sudden_death'), 1);
  assert.equal(sumOf(rows, 'rematches'), 1);
  assert.ok(rows.every((x) => /^\d{4}-\d{2}-\d{2}$/.test(String(x.day))), '日付の形式');
});

test('実際のSQL「日別の試合数」：15日以上前の記録は含めない', { skip: skipSql }, async () => {
  const { raw, d1 } = openDb();
  await saveMatchLog(d1, rec({ deckA: C, deckB: D, rounds: [], finishedAt: Math.floor(NOW / 1000) - 20 * 86400 }));
  assert.equal((raw.prepare(report('summary').sql).all() as unknown[]).length, 0);
});

test('実際のSQL「終わり方の内訳」', { skip: skipSql }, async () => {
  const { raw, d1 } = openDb();
  await seedMatches(d1);
  const rows = raw.prepare(report('reasons').sql).all() as Record<string, unknown>[];
  assert.deepEqual(rows.map((x) => [x.end_reason, x.matches]), [['normal', 3], ['forfeit', 1]]);
  assert.equal(rows[0].avg_rounds, 5.3, '通常の決着の平均ラウンド数（5・5・6）');
});

test('実際のSQL「カードごとの採用数と勝率」：手計算の数字と一致する', { skip: skipSql }, async () => {
  const { raw, d1 } = openDb();
  await seedMatches(d1);
  const rows = raw.prepare(report('cards').sql).all() as Record<string, unknown>[];
  const by = Object.fromEntries(rows.map((x) => [x.card, x]));
  // c1：3つのデッキ（勝ち・負け・勝ち）。ラウンドは3回（勝ち・負け・勝ち）。サドンデスの1回は数えない
  assert.deepEqual([by.c1.decks, by.c1.deck_win_pct, by.c1.plays, by.c1.round_win_pct], [3, 66.7, 3, 66.7]);
  // c3：デッキは3つ（勝ち・負け・勝ち）。ラウンドは負け・負け・引き分け → 勝率0
  assert.deepEqual([by.c3.decks, by.c3.plays, by.c3.round_win_pct], [3, 3, 0]);
  // c5：2つのデッキで2勝。ラウンドは負け・引き分け
  assert.deepEqual([by.c5.decks, by.c5.deck_win_pct, by.c5.plays, by.c5.round_win_pct], [2, 100, 2, 0]);
  // c6：1つのデッキで負け。ラウンドは引き分け
  assert.deepEqual([by.c6.decks, by.c6.deck_win_pct, by.c6.plays, by.c6.round_win_pct], [1, 0, 1, 0]);
  // d1：2つのデッキで1勝。ラウンドは負け・勝ち
  assert.deepEqual([by.d1.decks, by.d1.deck_win_pct, by.d1.plays, by.d1.round_win_pct], [2, 50, 2, 50]);
  // e2：1つのデッキで負け。ラウンドは勝ち（デッキが負けても、1ラウンドは勝てる）
  assert.deepEqual([by.e2.decks, by.e2.deck_win_pct, by.e2.plays, by.e2.round_win_pct], [1, 0, 1, 100]);
  assert.equal(rows.length, 5 + 1 + 5 + 5, '出てきたカードの種類（c1〜c6・d1〜d5・e1〜e5）');
  assert.ok(rows[0].decks >= rows[rows.length - 1].decks, '採用数の多い順');
});

test('実際のSQL「よく使われたデッキ」：同じ5枚の組み合わせを、並びを問わずまとめる', { skip: skipSql }, async () => {
  const { raw, d1 } = openDb();
  await seedMatches(d1);
  // 同じ5枚で、並びだけが違うデッキも、まとめて数える
  await saveMatchLog(d1, rec({ deckA: [...C].reverse(), deckB: E, winner: 'B', rounds: [] }));
  const rows = raw.prepare(report('decks').sql).all() as Record<string, unknown>[];
  assert.deepEqual({ ...rows[0] }, { deck_key: 'c1,c2,c3,c4,c5', uses: 3, win_pct: 66.7 }, 'c1〜c5：3回（勝ち・勝ち・負け）');
  assert.equal(rows[1].deck_key, 'd1,d2,d3,d4,d5');
  assert.deepEqual([rows[1].uses, rows[1].win_pct], [2, 50]);
});

test('実際のSQL：記録が空でも、どの集計も例外にならず、空の結果を返す', { skip: skipSql }, () => {
  const { raw } = openDb();
  for (const rp of STATS_REPORTS) assert.deepEqual(raw.prepare(rp.sql).all(), [], rp.key);
});

test('実際のSQL：保存期間を過ぎた記録だけが削除される', { skip: skipSql }, async () => {
  const { raw, d1 } = openDb();
  const day = 86_400;
  const t = Math.floor(NOW / 1000);
  await saveMatchLog(d1, rec({ deckA: C, deckB: D, rounds: [], finishedAt: t - 100 * day })); // 古い
  await saveMatchLog(d1, rec({ deckA: C, deckB: D, rounds: [], finishedAt: t - 91 * day })); // 古い
  await saveMatchLog(d1, rec({ deckA: C, deckB: D, rounds: [], finishedAt: t - 89 * day })); // 残る
  await saveMatchLog(d1, rec({ deckA: C, deckB: D, rounds: [], finishedAt: t })); // 残る
  await deleteOldMatchLogs(d1, NOW, 90);
  const left = raw.prepare('SELECT finished_at FROM matches ORDER BY finished_at').all() as { finished_at: number }[];
  assert.equal(left.length, 2);
  assert.ok(left.every((x) => x.finished_at > t - 90 * day));
});

// ---------------------------------------------------------------------------
// 集計の表示（wranglerの出力の読み取りと、表の整形）
// ---------------------------------------------------------------------------
test('wranglerの出力：結果の配列の形式と、単体の形式の両方を読める', () => {
  const rows = [{ card: 'c1', decks: 3 }];
  assert.deepEqual(parseWranglerD1Json(JSON.stringify([{ results: rows, success: true, meta: {} }])), rows);
  assert.deepEqual(parseWranglerD1Json(JSON.stringify({ results: rows, success: true })), rows);
  assert.deepEqual(parseWranglerD1Json(JSON.stringify([{ results: [], success: true }])), []);
});

test('wranglerの出力：壊れた形式や、失敗の出力は、分かりやすい例外にする', () => {
  assert.throws(() => parseWranglerD1Json('これはJSONではない'), /JSON/);
  assert.throws(() => parseWranglerD1Json('[]'), /形式/);
  assert.throws(() => parseWranglerD1Json('null'), /形式/);
  assert.throws(() => parseWranglerD1Json(JSON.stringify([{ success: false, error: 'no such table: matches' }])), /no such table/);
  assert.throws(() => parseWranglerD1Json(JSON.stringify([{ success: true }])), /results/);
});

test('表示の幅：全角は2、半角は1', () => {
  assert.equal(displayWidth('abc'), 3);
  assert.equal(displayWidth('カード'), 6);
  assert.equal(displayWidth('A勝'), 3);
  assert.equal(displayWidth(''), 0);
});

test('表：カードIDをカード名に置き換え、全角の名前があっても列がそろう', () => {
  const names: Record<string, string> = { c1: 'ネイチャーキング', c2: '愛' };
  const out = renderTable(
    [{ card: 'c1', decks: 12, win_pct: 66.7 }, { card: 'c2', decks: 3, win_pct: null }, { card: 'zz', decks: 1, win_pct: 0 }],
    [{ key: 'card', label: 'カード' }, { key: 'decks', label: '採用' }, { key: 'win_pct', label: '勝率%' }],
    (id) => names[id]
  );
  const lines = out.split('\n');
  assert.equal(lines.length, 5);
  assert.ok(lines[2].includes('ネイチャーキング') && lines[3].includes('愛') && lines[4].includes('zz'), '名前が引けなければ、IDのまま');
  assert.ok(lines[3].trimEnd().endsWith('-'), '値が無ければ「-」');
  const widths = lines.map((l) => displayWidth(l));
  assert.ok(widths.slice(1).every((w) => Math.abs(w - widths[0]) <= 0), `全ての行の表示幅がそろう: ${widths}`);
});

test('表：デッキのキーは、1枚ずつ縦に並び、デッキとデッキの間は空行で区切られる。空の結果は案内文になる', () => {
  const out = renderTable(
    [{ deck_key: 'c1,c2', uses: 2, win_pct: 50 }, { deck_key: 'c3,c4', uses: 1, win_pct: 0 }],
    [{ key: 'deck_key', label: 'デッキ' }, { key: 'uses', label: '回数' }, { key: 'win_pct', label: '勝率%' }],
    (id) => ({ c1: '甲', c2: '乙', c3: '丙', c4: '丁' })[id]
  );
  const lines = out.split('\n');
  assert.deepEqual(lines.map((l) => l.trimEnd()), [
    'デッキ  回数  勝率%',
    '------  ----  -----',
    '甲         2     50',
    '乙',
    '',
    '丙         1      0',
    '丁',
  ]);
  assert.equal(renderTable([], [{ key: 'a', label: 'a' }], () => undefined), '（記録がありません）');
});

test('カードの表示名：名前の後ろに、Legacy・MP・PP・Void が付く', () => {
  const base = { name: 'CHARLIE THE FROG', legacy: '環', monsterPride: 1, hasVoid: false } as const;
  const none = { legacy: '未使用', value: 0 } as const;
  assert.equal(describeCard({ ...base, potentialPoints: [{ legacy: '愛', value: 2 }, none, none] }), 'CHARLIE THE FROG（環・MP1・愛+2）');
  assert.equal(describeCard({ ...base, hasVoid: true, potentialPoints: [{ legacy: '愛', value: 3 }, none, none] }), 'CHARLIE THE FROG（環・MP1・愛+3・Void）');
  assert.equal(describeCard({ ...base, potentialPoints: [none, none, none] }), 'CHARLIE THE FROG（環・MP1）', 'PPが無ければ付けない');
  assert.equal(describeCard({ ...base, potentialPoints: [{ legacy: '愛', value: 2.5 }, { legacy: '制', value: 1 }, none] }), 'CHARLIE THE FROG（環・MP1・愛+2.5・制+1）', '小数や複数のPP');
});

test('カードの表示名：全てのカードで重複しない（同じ名前の別のカードも区別できる）', () => {
  const labels = CARD_POOL.map(describeCard);
  assert.equal(new Set(labels).size, CARD_POOL.length, '表示名が重複しているカードがある');
  // 同じ名前のカードが実際に多数あり、それらが区別されていることも確認する（確認が空振りしていないこと）
  const names = new Map<string, number>();
  CARD_POOL.forEach((c) => names.set(c.name, (names.get(c.name) ?? 0) + 1));
  assert.ok([...names.values()].filter((n) => n > 1).length > 50, '同じ名前のカードが、十分にある');
});

test('カードの表示名を引く関数：IDから引け、無ければ undefined', () => {
  const labelOf = buildCardLabeler(CARD_POOL);
  assert.equal(labelOf(CARD_POOL[0].id), describeCard(CARD_POOL[0]));
  assert.equal(labelOf('存在しないID'), undefined);
});

test('集計の一覧：キーが重複せず、絞り込みと全件の指定ができる', () => {
  const keys = STATS_REPORTS.map((x) => x.key);
  assert.equal(new Set(keys).size, keys.length);
  assert.equal(findReports(undefined).length, STATS_REPORTS.length);
  assert.equal(findReports('all').length, STATS_REPORTS.length);
  assert.deepEqual(findReports('cards').map((x) => x.key), ['cards']);
  assert.deepEqual(findReports('nope'), []);
  for (const rp of STATS_REPORTS) assert.ok(rp.columns.length > 0 && rp.sql.trim().length > 0);
});

// ---------------------------------------------------------------------------
// 集計の実行（wranglerの代わりに、実際のSQLiteで SQL を実行して、表示までを確認する）
// ---------------------------------------------------------------------------
import { runStatsReports } from '../src/online/statsRunner';

/** wrangler の `d1 execute --json` と同じ形式で、実際のSQLiteの結果を返す実行役 */
function sqliteExec(raw: import('node:sqlite').DatabaseSync, noise = '') {
  return (sql: string) => `${noise}${JSON.stringify([{ results: raw.prepare(sql).all(), success: true, meta: {} }])}`;
}

test('wranglerの出力の先頭に案内文が付いていても、集計の結果を読める', () => {
  const rows = [{ card: 'c1', decks: 3 }];
  const out = `⛅️ wrangler 4.147.0\n------\n${JSON.stringify([{ results: rows, success: true }])}`;
  assert.deepEqual(parseWranglerD1Json(out), rows);
});

test('集計の実行：全ての集計が、カード名つきの表になって表示される', { skip: skipSql }, async () => {
  const { raw, d1 } = openDb();
  await seedMatches(d1);
  const names: Record<string, string> = { c1: 'ネイチャーキング', c2: '愛の使者', d1: '制の番人' };
  const { text, failures } = runStatsReports({ reports: STATS_REPORTS, exec: sqliteExec(raw, '⛅️ wrangler\n'), nameOf: (id) => names[id] });
  assert.equal(failures, 0);
  for (const rp of STATS_REPORTS) assert.ok(text.includes(`■ ${rp.title}`), rp.title);
  assert.ok(text.includes('ネイチャーキング') && text.includes('愛の使者') && text.includes('制の番人'), 'カード名に置き換わる');
  assert.ok(text.includes('c3'), '名前が分からないカードは、IDのまま');
  const deckLines = text.split('\n');
  const iDecks = deckLines.findIndex((l) => l.startsWith('■ よく使われたデッキ'));
  const firstDeck = deckLines.slice(iDecks + 3, iDecks + 8).join('\n');
  assert.ok(firstDeck.includes('ネイチャーキング') && firstDeck.includes('愛の使者'), 'デッキは、1枚ずつ縦に並ぶ');
  assert.equal(deckLines.slice(iDecks + 3, iDecks + 8).filter((l) => l.trim() !== '').length, 5, '1つ目のデッキの5枚が、5行に並ぶ');
  assert.ok(!text.includes('取得できませんでした'));
});

test('集計の実行：記録が空なら、各集計に「記録がありません」と表示される', { skip: skipSql }, () => {
  const { raw } = openDb();
  const { text, failures } = runStatsReports({ reports: STATS_REPORTS, exec: sqliteExec(raw), nameOf: () => undefined });
  assert.equal(failures, 0);
  assert.equal(text.split('（記録がありません）').length - 1, STATS_REPORTS.length);
});

test('集計の実行：1つが失敗しても、他の集計は続き、失敗の数が返る', () => {
  let n = 0;
  const { text, failures } = runStatsReports({
    reports: STATS_REPORTS,
    exec: () => {
      n += 1;
      if (n === 2) throw new Error('接続できません');
      return JSON.stringify([{ results: [], success: true }]);
    },
    nameOf: () => undefined,
  });
  assert.equal(failures, 1);
  assert.ok(text.includes('取得できませんでした: 接続できません'));
  assert.equal(text.split('■ ').length - 1, STATS_REPORTS.length, '全ての集計の見出しが出る');
});
