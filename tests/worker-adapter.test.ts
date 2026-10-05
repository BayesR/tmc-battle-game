import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { generateLevelTunedNpcDeck } from '../src/logic/npcDeckGenerator';
import { DECK_TIME_MS, DISCONNECT_GRACE_MS, PICK_TIME_MS, REVEAL_AUTO_ADVANCE_MS } from '../src/online/constants';
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

const ENV = { ALLOWED_ORIGINS: 'https://example.test', ALLOW_SPECTATORS: 'false' };

async function boot(storage: FakeStorage) {
  const d = new RoomDO({ storage }, ENV);
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
async function startedRoom(storage = new FakeStorage()) {
  const d = await boot(storage);
  const a = await connect(d, 'a');
  const b = await connect(d, 'b');
  await say(d, a, { t: 'hello', token: TOKEN_A });
  await say(d, b, { t: 'hello', token: TOKEN_B });
  await say(d, a, { t: 'submit_deck', cardIds: deckIds(1) });
  await say(d, b, { t: 'submit_deck', cardIds: deckIds(2) });
  return { d, a, b, storage };
}

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

test('入口：WebSocket以外のリクエストは404、それ以外のパスは案内文を返す', async () => {
  const plain = await handler.fetch(new Request('https://tmc-online.example.workers.dev/parties/room/ABCDEF'), ENV);
  assert.equal(plain.status, 404);
  const root = await handler.fetch(new Request('https://tmc-online.example.workers.dev/'), ENV);
  assert.equal(root.status, 200);
  assert.match(await root.text(), /TMC online server/);
});
