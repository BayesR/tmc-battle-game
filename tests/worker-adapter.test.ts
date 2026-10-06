import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { generateLevelTunedNpcDeck } from '../src/logic/npcDeckGenerator';
import { DECK_TIME_MS, DISCONNECT_GRACE_MS, FINISHED_LINGER_MS, HELLO_TIMEOUT_MS, PICK_TIME_MS, REVEAL_AUTO_ADVANCE_MS } from '../src/online/constants';
import { CARD_POOL, withSeededMath } from './helpers';
import { FakeConnection } from './stubs/partyserver';

// 'partyserver' を、このテスト用の代用品に差し替えてから worker を読み込む
const Module = require('node:module');
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request: string, ...rest: unknown[]) {
  if (request === 'partyserver') return path.join(__dirname, 'stubs', 'partyserver.ts');
  return originalResolve.call(this, request, ...rest);
};
const worker = require('../worker/index');
const RoomDO = worker.Room as new (ctx: unknown, env: unknown) => any;
const handler = worker.default as { fetch(req: Request, env: unknown): Promise<Response> };

// --- Date.now を差し替えて時間を進められるようにする ---
const realNow = Date.now;
let fakeNow = 5_000_000;
Date.now = () => fakeNow;
test.after(() => {
  Date.now = realNow;
});

const TOKEN_A = 'token-A-0123456789abcdef';
const TOKEN_B = 'token-B-0123456789abcdef';

/** Durable Object のストレージの代用品（保存時にJSONを経由して、保存できる形かどうかも確かめる） */
class FakeStorage {
  data = new Map<string, unknown>();
  alarm: number | null = null;
  async get(key: string) {
    return this.data.has(key) ? JSON.parse(JSON.stringify(this.data.get(key))) : undefined;
  }
  async put(key: string, value: unknown) {
    this.data.set(key, JSON.parse(JSON.stringify(value)));
  }
  async setAlarm(at: number) {
    this.alarm = at;
  }
  async deleteAlarm() {
    this.alarm = null;
  }
  async deleteAll() {
    this.data.clear();
  }
}

const ENV: Record<string, unknown> = { ALLOWED_ORIGINS: 'https://example.test', ALLOW_SPECTATORS: 'false' };

async function boot(storage: FakeStorage, env: Record<string, unknown> = ENV) {
  // waitUntil に渡された処理（対戦ログの保存など）を、テストから待てるように溜めておく
  const ctx = {
    storage,
    pending: [] as Promise<unknown>[],
    waitUntil(p: Promise<unknown>) {
      this.pending.push(p);
    },
  };
  const d = new RoomDO(ctx, env);
  await d.onStart();
  return d;
}
async function connect(d: any, id: string) {
  const conn = new FakeConnection(id);
  d.conns.set(id, conn);
  await d.onConnect(conn);
  return conn;
}
async function say(d: any, conn: FakeConnection, msg: object) {
  await d.onMessage(conn, JSON.stringify(msg));
}
async function drop(d: any, conn: FakeConnection) {
  d.conns.delete(conn.id);
  await d.onClose(conn);
}
function lastState(conn: FakeConnection) {
  const states = conn.sent.map((s) => JSON.parse(s)).filter((m) => m.t === 'state');
  assert.ok(states.length > 0, `${conn.id} に state が届いていない`);
  return states[states.length - 1];
}
const deckIds = (seed: number) => withSeededMath(seed, () => (generateLevelTunedNpcDeck(CARD_POOL, 'Lv1') ?? []).map((c) => c.id));

/** 2人が参加してデッキを提出し、pick フェーズに入った状態 */
async function startedRoom(storage = new FakeStorage(), env: Record<string, unknown> = ENV) {
  const d = await boot(storage, env);
  const a = await connect(d, 'a');
  const b = await connect(d, 'b');
  await say(d, a, { t: 'hello', token: TOKEN_A });
  await say(d, b, { t: 'hello', token: TOKEN_B });
  await say(d, a, { t: 'submit_deck', cardIds: deckIds(1) });
  await say(d, b, { t: 'submit_deck', cardIds: deckIds(2) });
  return { d, a, b, storage };
}

/** waitUntil に渡された処理を、全て待つ */
const settle = (d: any) => Promise.all(d.ctx.pending);

test('状態が変わるたびに保存され、フェーズに合わせて alarm が設定される', async () => {
  fakeNow = 5_000_000;
  const storage = new FakeStorage();
  const d = await boot(storage);
  const a = await connect(d, 'a');
  const b = await connect(d, 'b');
  await say(d, a, { t: 'hello', token: TOKEN_A });
  await say(d, b, { t: 'hello', token: TOKEN_B });
  assert.equal((storage.data.get('snapshot') as any).state.phase, 'deck');
  assert.equal(storage.alarm, fakeNow + DECK_TIME_MS, 'デッキ構築の制限時間の alarm');

  await say(d, a, { t: 'submit_deck', cardIds: deckIds(1) });
  await say(d, b, { t: 'submit_deck', cardIds: deckIds(2) });
  assert.equal((storage.data.get('snapshot') as any).state.phase, 'pick');
  assert.equal(storage.alarm, fakeNow + PICK_TIME_MS, '選択の制限時間の alarm');
});

test('alarm が来ると期限の処理が行われ、次の期限に alarm が付け替えられる', async () => {
  fakeNow = 5_000_000;
  const { d, a, storage } = await startedRoom();
  fakeNow += PICK_TIME_MS; // 選択の期限
  await d.onAlarm();
  assert.equal(lastState(a).view.phase, 'reveal');
  assert.equal(storage.alarm, fakeNow + REVEAL_AUTO_ADVANCE_MS, '公開後の自動進行の alarm に付け替わる');
});

test('サーバーがメモリから消えても、保存した状態から復元して対戦を続けられる', async () => {
  fakeNow = 5_000_000;
  const { d, a, storage } = await startedRoom();
  await say(d, a, { t: 'pick', instanceId: lastState(a).view.selfRemaining[0].instanceId });
  const pickedId = lastState(a).view.selfPickId;
  assert.ok(pickedId);

  // 両者が切断（スマホのロックなど）し、サーバーがメモリから消えた想定
  await drop(d, a);
  fakeNow += 8_000;
  // 新しいインスタンス（同じストレージ）が起動して復元する
  const d2 = await boot(storage);
  assert.equal(d2.logic.getState().phase, 'pick');
  const a2 = await connect(d2, 'a2');
  const b2 = await connect(d2, 'b2');
  await say(d2, a2, { t: 'hello', token: TOKEN_A });
  await say(d2, b2, { t: 'hello', token: TOKEN_B });
  assert.equal(lastState(a2).view.selfPickId, pickedId, '選択済みのカードが復元されている');
  await say(d2, b2, { t: 'pick', instanceId: lastState(b2).view.selfRemaining[0].instanceId });
  assert.equal(lastState(a2).view.phase, 'reveal');
  assert.equal(lastState(a2).view.rounds.length, 1);

  // 他人は入れない
  const c2 = await connect(d2, 'c2');
  await say(d2, c2, { t: 'hello', token: 'token-stranger-0123456789' });
  assert.equal(JSON.parse(c2.sent[c2.sent.length - 1]).code, 'room-full');
});

test('復元後に誰も戻らなければ、猶予の経過で勝者なしとして終了する', async () => {
  fakeNow = 5_000_000;
  const { d, a, b, storage } = await startedRoom();
  await drop(d, a);
  await drop(d, b);
  const d2 = await boot(storage); // 復元
  assert.ok(storage.alarm !== null, '猶予の期限の alarm が設定されている');
  fakeNow = storage.alarm!;
  await d2.onAlarm();
  assert.equal(d2.logic.getState().endReason, 'abandoned');
});

test('終了済みで誰もいなくなったら、保存データと alarm が片付く', async () => {
  fakeNow = 5_000_000;
  const { d, a, b, storage } = await startedRoom();
  await say(d, a, { t: 'leave' }); // Aが退出して終了
  assert.equal(lastState(b).view.phase, 'finished');
  assert.ok(storage.data.has('snapshot'), 'まだBが接続中なので保存されたまま');
  await drop(d, a);
  await drop(d, b);
  assert.equal(storage.data.size, 0, '保存データが消える');
  assert.equal(storage.alarm, null, 'alarm も消える');
});

test('切断（onClose / onError）はルームに伝わり、相手に通知され、不戦敗の猶予が保存される', async () => {
  for (const kind of ['onClose', 'onError'] as const) {
    fakeNow = 5_000_000;
    const { d, a, b, storage } = await startedRoom();
    fakeNow += 10_000;
    d.conns.delete(a.id);
    await d[kind](a);
    assert.equal(lastState(b).connected.enemy, false, `${kind}: 相手に切断が通知される`);
    assert.equal(
      (storage.data.get('snapshot') as any).deadlines.graceAt.A,
      fakeNow + DISCONNECT_GRACE_MS,
      `${kind}: 猶予の期限が保存される`
    );
  }
});

test('接続した直後にも alarm が設定され、hello を送らない接続は期限で切られる', async () => {
  fakeNow = 5_000_000;
  const storage = new FakeStorage();
  const d = await boot(storage);
  const idle = await connect(d, 'idle');
  assert.equal(storage.alarm, fakeNow + HELLO_TIMEOUT_MS, 'helloの期限の alarm');
  fakeNow = storage.alarm!;
  await d.onAlarm();
  assert.ok(idle.closed, '期限が来た接続は閉じられる');
  assert.equal(JSON.parse(idle.sent[idle.sent.length - 1]).code, 'hello-timeout');
});

test('終了後2分で alarm が来ると、接続が閉じられ、プラットフォームが閉じを通知すると保存データが片付く', async () => {
  fakeNow = 5_000_000;
  const { d, a, b, storage } = await startedRoom();
  await say(d, a, { t: 'leave' }); // Aが退出して終了
  assert.ok(a.closed);
  await drop(d, a); // サーバーが閉じた接続について、プラットフォームから閉じの通知が来る
  assert.equal(lastState(b).view.phase, 'finished');
  assert.equal(storage.alarm, fakeNow + FINISHED_LINGER_MS, '閉じる時刻の alarm');
  fakeNow = storage.alarm!;
  await d.onAlarm();
  assert.ok(b.closed, '期限が来たら、残っている接続も閉じられる');
  assert.ok(storage.data.has('snapshot'), 'プラットフォームから閉じの通知が来るまでは、保存したまま');
  await drop(d, b);
  assert.equal(storage.data.size, 0);
  assert.equal(storage.alarm, null);
});

test('再戦の操作が、保存と alarm の更新を伴って動く', async () => {
  fakeNow = 5_000_000;
  const { d, a, b, storage } = await startedRoom();
  // 速く終わらせる：時間切れの自動進行を繰り返す
  for (let i = 0; i < 40 && lastState(a).view.phase !== 'finished'; i++) {
    fakeNow = storage.alarm!;
    await d.onAlarm();
  }
  assert.equal(lastState(a).view.phase, 'finished');
  await say(d, a, { t: 'rematch' });
  await say(d, b, { t: 'rematch' });
  assert.equal(lastState(a).view.phase, 'deck');
  assert.equal(lastState(a).view.matchNumber, 2);
  assert.equal(storage.alarm, fakeNow + DECK_TIME_MS, '再戦のデッキ構築の期限に付け替わる');
  assert.equal((storage.data.get('snapshot') as any).state.phase, 'deck');
});

// ---------------------------------------------------------------------------
// 対戦ログ（運営者用の匿名統計）：D1への記録と、毎日の掃除
// ---------------------------------------------------------------------------
function fakeD1(opts: { fail?: boolean } = {}) {
  const calls: { sql: string; values: unknown[] }[] = [];
  const db = {
    prepare: (sql: string) => ({
      bind: (...values: unknown[]) => ({
        run: async () => {
          if (opts.fail) throw new Error('D1が応答しません');
          calls.push({ sql, values });
        },
      }),
    }),
  };
  return { db, calls };
}

test('D1が用意されていれば、試合が終わるたびに1行記録される。表示名・tokenは含まれない', async () => {
  fakeNow = 5_000_000;
  const { db, calls } = fakeD1();
  const { d, a, b } = await startedRoom(new FakeStorage(), { ...ENV, DB: db });
  assert.equal(calls.length, 0, '対戦中は記録しない');
  await say(d, a, { t: 'leave' }); // Aが退出して不戦敗（両者のデッキは提出済み）
  await settle(d);
  assert.equal(calls.length, 1);
  assert.match(calls[0].sql, /INSERT INTO matches/);
  assert.equal(calls[0].values[2], 'forfeit');
  assert.equal(calls[0].values[3], 'B', '勝者の席');
  const all = JSON.stringify(calls[0].values);
  assert.ok(!all.includes(TOKEN_A) && !all.includes(TOKEN_B), 'tokenが含まれていない');
  assert.ok(!all.includes('ジャナー'), '表示名が含まれていない');
  void b;
});

test('LOG_MATCHES=false なら、D1があっても記録しない', async () => {
  fakeNow = 5_000_000;
  const { db, calls } = fakeD1();
  const { d, a } = await startedRoom(new FakeStorage(), { ...ENV, DB: db, LOG_MATCHES: 'false' });
  await say(d, a, { t: 'leave' });
  await settle(d);
  assert.equal(calls.length, 0);
});

test('D1が用意されていなくても、今までどおり動く', async () => {
  fakeNow = 5_000_000;
  const { d, a, b } = await startedRoom(new FakeStorage(), ENV);
  await say(d, a, { t: 'leave' });
  assert.equal(lastState(b).view.phase, 'finished');
  assert.equal(d.ctx.pending.length, 0);
});

test('D1への保存が失敗しても、対戦は止まらず、結果も伝わる', async () => {
  fakeNow = 5_000_000;
  const { db } = fakeD1({ fail: true });
  const original = console.error;
  const errors: unknown[][] = [];
  console.error = (...args: unknown[]) => void errors.push(args);
  try {
    const { d, a, b } = await startedRoom(new FakeStorage(), { ...ENV, DB: db });
    await say(d, a, { t: 'leave' });
    await settle(d); // 失敗は、保存の処理の内側で受け止められ、ここまで例外が出てこない
    assert.equal(lastState(b).view.phase, 'finished');
    assert.equal(lastState(b).view.matchWinner, 'self');
    assert.equal(errors.length, 1, '失敗は、記録として残る（利用者には見えない）');
  } finally {
    console.error = original;
  }
});

test('毎日の掃除（scheduled）：保存期間を過ぎた記録の削除を実行する。D1が無ければ何もしない', async () => {
  const { db, calls } = fakeD1();
  const waiting: Promise<unknown>[] = [];
  const ctx = { waitUntil: (p: Promise<unknown>) => void waiting.push(p) };
  const realDateNow = Date.now;
  Date.now = () => 1_700_000_000_000;
  try {
    await (handler as any).scheduled({}, { ...ENV, DB: db, LOG_RETENTION_DAYS: '30' }, ctx);
    await Promise.all(waiting);
    assert.equal(calls.length, 1);
    assert.match(calls[0].sql, /DELETE FROM matches/);
    assert.deepEqual(calls[0].values, [1_700_000_000 - 30 * 86_400], '設定した日数（30日）で計算される');

    calls.length = 0;
    await (handler as any).scheduled({}, { ...ENV, DB: db }, ctx);
    await Promise.all(waiting);
    assert.deepEqual(calls[0].values, [1_700_000_000 - 90 * 86_400], '未設定なら、既定の90日');

    // D1が無ければ、何も試みない（エラーを記録することもない）
    const before = waiting.length;
    const errors: unknown[][] = [];
    const originalError = console.error;
    console.error = (...a: unknown[]) => void errors.push(a);
    try {
      await assert.doesNotReject((handler as any).scheduled({}, ENV, ctx), 'D1が無くても、例外にならない');
      await Promise.all(waiting);
    } finally {
      console.error = originalError;
    }
    assert.equal(waiting.length, before, 'D1が無ければ、削除の処理を始めない');
    assert.equal(errors.length, 0, 'D1が無くても、毎日エラーが記録されることはない');
  } finally {
    Date.now = realDateNow;
  }
});

test('毎日の掃除：削除に失敗しても、例外にならない', async () => {
  const { db } = fakeD1({ fail: true });
  const waiting: Promise<unknown>[] = [];
  const original = console.error;
  console.error = () => undefined;
  try {
    await (handler as any).scheduled({}, { ...ENV, DB: db }, { waitUntil: (p: Promise<unknown>) => void waiting.push(p) });
    await assert.doesNotReject(Promise.all(waiting));
  } finally {
    console.error = original;
  }
});

let sqliteForAdapter: typeof import('node:sqlite') | null = null;
try {
  sqliteForAdapter = require('node:sqlite');
} catch {
  sqliteForAdapter = null;
}

test(
  '通しの確認（実際のSQLite）：対戦を最後まで進めると、1行が記録され、集計に反映される',
  { skip: sqliteForAdapter ? false : 'この環境では node:sqlite が使えないため飛ばす' },
  async () => {
    const { LOG_SCHEMA_SQL } = require('../src/online/matchLog');
    const { STATS_REPORTS } = require('../src/online/statsQueries');
    const raw = new sqliteForAdapter!.DatabaseSync(':memory:');
    raw.exec(LOG_SCHEMA_SQL);
    const db = {
      prepare: (sql: string) => ({
        bind: (...v: unknown[]) => ({
          run: async () => {
            raw.prepare(sql).run(...(v as never[]));
          },
        }),
      }),
    };

    fakeNow = 5_000_000;
    const storage = new FakeStorage();
    const { d, a, b } = await startedRoom(storage, { ...ENV, DB: db });
    // 時間切れの自動選択・自動進行を繰り返して、最後まで進める
    for (let i = 0; i < 40 && lastState(a).view.phase !== 'finished'; i++) {
      fakeNow = storage.alarm!;
      await d.onAlarm();
    }
    assert.equal(lastState(a).view.phase, 'finished');
    await settle(d);

    const rows = raw.prepare('SELECT * FROM matches').all() as Record<string, unknown>[];
    assert.equal(rows.length, 1, '1試合につき1行');
    assert.equal(rows[0].end_reason, 'normal');
    assert.equal(rows[0].match_number, 1);
    assert.equal(JSON.parse(String(rows[0].deck_a)).length, 5);
    assert.equal(JSON.parse(String(rows[0].deck_b)).length, 5);
    assert.ok(JSON.parse(String(rows[0].rounds)).length >= 5);

    // 保存された記録が、集計に反映される（カードごとの集計に、10枚ぶんのカードが並ぶ）
    const cards = raw.prepare(STATS_REPORTS.find((r: { key: string }) => r.key === 'cards').sql).all();
    assert.ok(cards.length >= 5 && cards.length <= 10, `出てきたカードの種類: ${cards.length}`);

    // 再戦すると、2戦目も別の1行として記録される
    await say(d, a, { t: 'rematch' });
    await say(d, b, { t: 'rematch' });
    assert.equal(lastState(a).view.phase, 'deck');
    const ids = lastState(a).view.selfLastDeckIds;
    await say(d, a, { t: 'submit_deck', cardIds: ids });
    await say(d, b, { t: 'submit_deck', cardIds: lastState(b).view.selfLastDeckIds });
    for (let i = 0; i < 40 && lastState(a).view.phase !== 'finished'; i++) {
      fakeNow = storage.alarm!;
      await d.onAlarm();
    }
    await settle(d);
    const after = raw.prepare('SELECT match_number FROM matches ORDER BY id').all() as { match_number: number }[];
    assert.deepEqual(after.map((x) => x.match_number), [1, 2], '再戦の2戦目は、何戦目かつきで別の行');
  }
);

test('バイナリのメッセージは無視される', async () => {
  fakeNow = 5_000_000;
  const { d, a } = await startedRoom();
  const before = a.sent.length;
  await d.onMessage(a, new ArrayBuffer(8));
  assert.equal(a.sent.length, before);
  assert.equal(d.logic.getState().phase, 'pick');
});

// ---------------------------------------------------------------------------
// 入口（fetch）：ルームコードと接続元の検証
// ---------------------------------------------------------------------------
const wsRequest = (pathname: string, origin?: string) =>
  new Request(`https://tmc-online.example.workers.dev${pathname}`, {
    headers: { Upgrade: 'websocket', ...(origin ? { Origin: origin } : {}) },
  });

test('入口：不正な形式のルームコードは404で拒否される', async () => {
  for (const bad of ['abc', 'ABCDE', 'ABCDEFG', 'abcdef', 'ABCDE0', '..%2F..']) {
    const res = await handler.fetch(wsRequest(`/parties/room/${bad}`), ENV);
    assert.equal(res.status, 404, bad);
  }
  assert.equal((await handler.fetch(wsRequest('/parties/room/ABCDEF'), ENV)).status, 200, '正しいコードは通る');
});

test('入口：許可していないサイトからのブラウザ接続は403。Originの無い接続と許可済みサイトは通る', async () => {
  assert.equal((await handler.fetch(wsRequest('/parties/room/ABCDEF', 'https://evil.example'), ENV)).status, 403);
  assert.equal((await handler.fetch(wsRequest('/parties/room/ABCDEF', 'https://example.test'), ENV)).status, 200);
  assert.equal((await handler.fetch(wsRequest('/parties/room/ABCDEF'), ENV)).status, 200, 'Originなし（スクリプト等）');
  // 許可リストが空なら制限しない（開発時）
  assert.equal((await handler.fetch(wsRequest('/parties/room/ABCDEF', 'https://anything.example'), { ...ENV, ALLOWED_ORIGINS: '' })).status, 200);
});

test('入口：パターン（*）で、確認用デプロイのURLを許可し、他のアカウントのURLは403', async () => {
  const env = { ...ENV, ALLOWED_ORIGINS: 'https://tmc-battle-game.vercel.app,https://tmc-battle-game-*-bayes-r.vercel.app' };
  const ok = ['https://tmc-battle-game-git-online-battle-bayes-r.vercel.app', 'https://tmc-battle-game-duvn0y1np-bayes-r.vercel.app'];
  for (const origin of ok) assert.equal((await handler.fetch(wsRequest('/parties/room/ABCDEF', origin), env)).status, 200, origin);
  const ng = ['https://tmc-battle-game-x-someoneelse.vercel.app', 'https://tmc-battle-game-a.b-bayes-r.vercel.app'];
  for (const origin of ng) assert.equal((await handler.fetch(wsRequest('/parties/room/ABCDEF', origin), env)).status, 403, origin);
});

test('入口：緊急停止スイッチ（ONLINE_ENABLED=false）で、新しい接続を全て断る', async () => {
  const off = await handler.fetch(wsRequest('/parties/room/ABCDEF'), { ...ENV, ONLINE_ENABLED: 'false' });
  assert.equal(off.status, 503);
  assert.equal((await handler.fetch(wsRequest('/parties/room/ABCDEF'), { ...ENV, ONLINE_ENABLED: 'true' })).status, 200);
  assert.equal((await handler.fetch(wsRequest('/parties/room/ABCDEF'), ENV)).status, 200, '未設定なら有効');
});

test('入口：WebSocket以外のリクエストは404、それ以外のパスは案内文を返す', async () => {
  const plain = await handler.fetch(new Request('https://tmc-online.example.workers.dev/parties/room/ABCDEF'), ENV);
  assert.equal(plain.status, 404);
  const root = await handler.fetch(new Request('https://tmc-online.example.workers.dev/'), ENV);
  assert.equal(root.status, 200);
  assert.match(await root.text(), /TMC online server/);
});
