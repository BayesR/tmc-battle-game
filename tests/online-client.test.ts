import test from 'node:test';
import assert from 'node:assert/strict';
import { OnlineClient, type ClientClock, type SocketLike } from '../src/online/client';
import { Room } from '../src/online/room';
import { parseServerMessage } from '../src/online/protocol';
import { DISCONNECT_GRACE_MS, FINISHED_LINGER_MS } from '../src/online/constants';
import type { CardMaster } from '../src/types/card';
import { deckOf, seededRandom } from './helpers';

// ---------------------------------------------------------------------------
// 偽の時計（クライアント側）と、Room に直結した偽のWebSocket
// ---------------------------------------------------------------------------
class ManualClock implements ClientClock {
  t = 4_000;
  private timers: { id: number; at: number; fn: () => void }[] = [];
  private nextId = 1;
  delays: number[] = [];
  now() {
    return this.t;
  }
  setTimeout(fn: () => void, ms: number) {
    this.delays.push(ms);
    const id = this.nextId++;
    this.timers.push({ id, at: this.t + ms, fn });
    return id;
  }
  clearTimeout(h: unknown) {
    this.timers = this.timers.filter((x) => x.id !== h);
  }
  advance(ms: number) {
    const target = this.t + ms;
    for (;;) {
      const due = this.timers.filter((x) => x.at <= target).sort((a, b) => a.at - b.at)[0];
      if (!due) break;
      this.timers = this.timers.filter((x) => x !== due);
      this.t = due.at;
      due.fn();
    }
    this.t = target;
  }
  pending() {
    return this.timers.length;
  }
}

class FakeSocket implements SocketLike {
  onopen: SocketLike['onopen'] = null;
  onmessage: SocketLike['onmessage'] = null;
  onclose: SocketLike['onclose'] = null;
  onerror: SocketLike['onerror'] = null;
  closed = false;
  connId = '';
  sent: string[] = [];
  constructor(private net: Loopback) {}
  send(data: string) {
    if (this.closed) throw new Error('closed');
    this.sent.push(data);
    this.net.toServer(this, data);
  }
  close() {
    if (this.closed) return;
    this.closed = true;
    this.net.room.handleClose(this.connId);
    this.net.bySocket.delete(this.connId);
  }
}

/** クライアントと Room をつなぐ偽のネットワーク */
class Loopback {
  serverNow = 10_000;
  room: Room;
  bySocket = new Map<string, FakeSocket>();
  sockets: FakeSocket[] = [];
  private seq = 0;
  /** true にすると、新しい接続が開けずに失敗する */
  refuse = false;

  constructor(pool: CardMaster[]) {
    this.room = new Room(
      { now: () => this.serverNow, rng: seededRandom(3), pool },
      {
        send: (id, msg) => {
          const s = this.bySocket.get(id);
          if (s && !s.closed) s.onmessage?.({ data: JSON.stringify(msg) });
        },
        close: (id) => {
          const s = this.bySocket.get(id);
          if (s) this.drop(s);
        },
      }
    );
  }
  create = (_url: string): SocketLike => {
    const s = new FakeSocket(this);
    this.sockets.push(s);
    s.connId = `conn${++this.seq}`;
    queueMicrotask(() => {
      if (s.closed) return;
      if (this.refuse) {
        s.closed = true;
        s.onclose?.();
        return;
      }
      this.bySocket.set(s.connId, s);
      this.room.handleOpen(s.connId);
      s.onopen?.();
    });
    return s;
  };
  toServer(s: FakeSocket, data: string) {
    this.room.handleMessage(s.connId, data);
  }
  /** ネットワークが切れた（サーバーとクライアントの両方に close が届く） */
  drop(s: FakeSocket) {
    if (s.closed) return;
    s.closed = true;
    this.bySocket.delete(s.connId);
    this.room.handleClose(s.connId);
    s.onclose?.();
  }
}

const tick = () => new Promise<void>((r) => setImmediate(r));
const mkClient = (net: Loopback, clock: ManualClock, token: string, extra: Partial<ConstructorParameters<typeof OnlineClient>[0]> = {}) =>
  new OnlineClient({ url: 'ws://test/parties/room/ABCDEF', token, createSocket: net.create, clock, ...extra });

const dA = deckOf('a', [3, 3, 3, 3, 3]);
const dB = deckOf('b', [2, 2, 2, 2, 2]);
const ids = (d: CardMaster[]) => d.map((c) => c.id);
const TOKEN_A = 'token-A-0123456789abcdef';
const TOKEN_B = 'token-B-0123456789abcdef';

async function twoPlayers() {
  const net = new Loopback([...dA, ...dB]);
  const ca = new ManualClock();
  const cb = new ManualClock();
  const a = mkClient(net, ca, TOKEN_A);
  const b = mkClient(net, cb, TOKEN_B);
  a.start();
  await tick();
  b.start();
  await tick();
  return { net, a, b, ca, cb };
}

// ---------------------------------------------------------------------------
test('接続すると hello が送られ、状態を受け取れる。サーバーとの時計のずれが分かる', async () => {
  const net = new Loopback([]);
  const clock = new ManualClock(); // クライアントの時計 4000、サーバーの時計 10000
  const c = mkClient(net, clock, TOKEN_A);
  assert.equal(c.getSnapshot().status, 'idle');
  c.start();
  assert.equal(c.getSnapshot().status, 'connecting');
  await tick();
  const s = c.getSnapshot();
  assert.equal(s.status, 'open');
  assert.equal(s.view?.phase, 'lobby');
  assert.equal(s.view?.viewer, 'A');
  assert.equal(s.clockOffsetMs, 6_000, 'サーバーの時計 − 自分の時計');
  assert.equal(c.toLocalTime(16_000), 10_000, 'サーバー時刻の期限を、自分の時計に直せる');
  assert.deepEqual(JSON.parse(net.sockets[0].sent[0]), { t: 'hello', token: TOKEN_A });
});

test('2人で参加してデッキを提出し、選択・確認まで進められる。変化は購読者に通知される', async () => {
  const { a, b } = await twoPlayers();
  assert.equal(a.getSnapshot().view?.phase, 'deck');
  let notified = 0;
  a.subscribe(() => notified++);

  assert.ok(a.submitDeck(ids(dA)));
  assert.ok(b.submitDeck(ids(dB)));
  assert.equal(a.getSnapshot().view?.phase, 'pick');
  assert.ok(notified > 0, '状態が変わるたびに購読者へ通知される');
  assert.equal(a.getSnapshot().view?.selfRemaining.length, 5);

  assert.ok(a.pick(a.getSnapshot().view!.selfRemaining[0].instanceId));
  assert.equal(b.getSnapshot().view?.enemyHasPicked, true);
  assert.ok(b.pick(b.getSnapshot().view!.selfRemaining[0].instanceId));
  assert.equal(a.getSnapshot().view?.phase, 'reveal');
  assert.ok(a.ackReveal());
  assert.ok(b.ackReveal());
  assert.equal(a.getSnapshot().view?.phase, 'pick');
  assert.equal(a.getSnapshot().view?.rounds.length, 1);
});

test('拒否された操作は lastError に入り、次の操作で消える', async () => {
  const { a } = await twoPlayers();
  a.submitDeck(['存在しないカード', 'x', 'y', 'z', 'w']);
  assert.equal(a.getSnapshot().lastError?.code, 'invalid-deck');
  a.submitDeck(ids(dA));
  assert.equal(a.getSnapshot().lastError, null);
});

test('切断されると自動で再接続し、同じ token で同じ席に戻って、選択も保たれる', async () => {
  const { net, a, b, ca } = await twoPlayers();
  a.submitDeck(ids(dA));
  b.submitDeck(ids(dB));
  a.pick(a.getSnapshot().view!.selfRemaining[0].instanceId); // Bより先に選択（未公開）
  const picked = a.getSnapshot().view!.selfPickId;
  assert.ok(picked, '選択が受理されている（テストの前提）');

  net.drop(net.sockets[0]); // ネットワーク断
  assert.equal(a.getSnapshot().status, 'reconnecting');
  assert.equal(a.getSnapshot().reconnectAttempts, 1);
  assert.equal(ca.pending(), 1, '再接続の予約が入っている');

  ca.advance(499);
  assert.equal(net.sockets.length, 2, '待ち時間の前には再接続しない');
  ca.advance(1);
  await tick();
  assert.equal(net.sockets.length, 3, '待ち時間が過ぎたら再接続する');
  const s = a.getSnapshot();
  assert.equal(s.status, 'open');
  assert.equal(s.reconnectAttempts, 0, '成功したら試行回数がリセットされる');
  assert.equal(s.view?.viewer, 'A');
  assert.equal(s.view?.selfPickId, picked, '選択済みのカードが復元される');
  assert.deepEqual(JSON.parse(net.sockets[2].sent[0]), { t: 'hello', token: TOKEN_A }, '同じ token で戻る');
});

test('再接続の待ち時間は倍々に増え、上限で頭打ちになり、回数を超えると諦める', async () => {
  const net = new Loopback([]);
  net.refuse = true;
  const clock = new ManualClock();
  const c = mkClient(net, clock, TOKEN_A, { reconnect: { baseMs: 500, maxMs: 5_000, maxAttempts: 7 } });
  c.start();
  for (let i = 0; i < 12 && c.getSnapshot().status !== 'ended'; i++) {
    await tick();
    clock.advance(10_000);
  }
  assert.deepEqual(clock.delays, [500, 1000, 2000, 4000, 5000, 5000, 5000]);
  assert.equal(c.getSnapshot().status, 'ended');
  assert.equal(c.getSnapshot().endedReason, 'gave-up');
});

test('reconnectNow：画面に戻ってきた時などに、待ち時間を飛ばして再接続できる', async () => {
  const { net, a, ca } = await twoPlayers();
  net.drop(net.sockets[0]);
  assert.equal(a.getSnapshot().status, 'reconnecting');
  a.reconnectNow();
  await tick();
  assert.equal(a.getSnapshot().status, 'open');
  assert.equal(ca.pending(), 0, '予約は取り消されている');
});

test('別の画面（同じ token）に席を奪われたら、再接続せずに終了する', async () => {
  const { net, a, ca } = await twoPlayers();
  const a2 = mkClient(net, new ManualClock(), TOKEN_A);
  a2.start();
  await tick();
  assert.equal(a2.getSnapshot().view?.viewer, 'A');
  assert.equal(a.getSnapshot().status, 'ended');
  assert.equal(a.getSnapshot().endedReason, 'replaced');
  assert.equal(ca.pending(), 0, '再接続の予約は入らない');
});

test('満員のルームでは、再接続せずに「満員」で終了する', async () => {
  const { net } = await twoPlayers();
  const c = mkClient(net, new ManualClock(), 'token-C-0123456789abcdef');
  c.start();
  await tick();
  assert.equal(c.getSnapshot().status, 'ended');
  assert.equal(c.getSnapshot().endedReason, 'room-full');
});

test('観戦の指定は hello に含まれ、無効なサーバーでは「利用できない」で終了する', async () => {
  const { net } = await twoPlayers();
  const c = mkClient(net, new ManualClock(), 'token-S-0123456789abcdef', { spectate: true });
  c.start();
  await tick();
  const hello = JSON.parse(net.sockets[net.sockets.length - 1].sent[0]);
  assert.equal(hello.spectate, true);
  assert.equal(c.getSnapshot().endedReason, 'spectating-disabled');
});

test('退出（leave）：サーバーに伝わって不戦敗になり、再接続しない', async () => {
  const { a, b, ca } = await twoPlayers();
  a.submitDeck(ids(dA));
  b.submitDeck(ids(dB));
  a.leave();
  assert.equal(a.getSnapshot().status, 'ended');
  assert.equal(a.getSnapshot().endedReason, 'left');
  assert.equal(b.getSnapshot().view?.matchWinner, 'self');
  assert.equal(b.getSnapshot().view?.forfeitedBy, 'enemy');
  assert.equal(ca.pending(), 0);
  assert.equal(a.pick('x'), false, '終了後は送信できない');
});

test('停止（stop）して再開（start）できる（開発時の二重実行でも接続が重複しない）', async () => {
  const net = new Loopback([]);
  const clock = new ManualClock();
  const c = mkClient(net, clock, TOKEN_A);
  c.start();
  c.stop();
  c.start();
  await tick();
  assert.equal(c.getSnapshot().status, 'open');
  assert.equal(c.getSnapshot().view?.viewer, 'A');
  // 停止した最初の接続の遅れて届く通知が、状態を壊さない
  assert.equal(net.sockets.filter((s) => !s.closed).length, 1, '生きている接続は1つだけ');
});

test('停止（stop）はサーバーから見ると切断で、猶予の間は席が保たれる', async () => {
  const { net, a } = await twoPlayers();
  a.submitDeck(ids(dA));
  a.stop();
  assert.equal(net.room.getState().phase, 'deck');
  assert.equal(net.room.nextDeadline() !== null, true);
  net.serverNow += DISCONNECT_GRACE_MS - 1;
  net.room.tick();
  assert.equal(net.room.getState().phase, 'deck', '猶予の間は不戦敗にならない');
});

test('対戦が終了してサーバーが接続を閉じたら、再接続せずに「終了」にする（結果は残る）', async () => {
  const { net, a, b } = await twoPlayers();
  a.submitDeck(ids(dA));
  b.submitDeck(ids(dB));
  b.leave(); // Bの退出で試合終了
  assert.equal(a.getSnapshot().view?.phase, 'finished');
  net.drop(net.sockets[0]);
  assert.equal(a.getSnapshot().status, 'ended');
  assert.equal(a.getSnapshot().endedReason, 'finished');
  assert.equal(a.getSnapshot().view?.matchWinner, 'self', '結果の表示用に、最後の状態は残る');
});

test('再戦：希望を送ると相手に伝わり、両者が希望するとデッキ構築に戻り、前回のデッキのIDが届く', async () => {
  const { a, b } = await twoPlayers();
  a.submitDeck(ids(dA));
  b.submitDeck(ids(dB));
  // 速く終わらせる：Bが退出するのではなく、通常の決着まで進める
  for (let i = 0; i < 40 && a.getSnapshot().view?.phase !== 'finished'; i++) {
    for (const c of [a, b]) {
      const v = c.getSnapshot().view!;
      if (v.phase === 'pick' && !v.selfHasPicked) c.pick(v.selfRemaining[0].instanceId);
    }
    for (const c of [a, b]) if (c.getSnapshot().view?.phase === 'reveal') c.ackReveal();
  }
  assert.equal(a.getSnapshot().view?.phase, 'finished');

  assert.ok(a.rematch());
  assert.equal(b.getSnapshot().view?.rematchEnemyVoted, true);
  assert.ok(a.cancelRematch());
  assert.equal(b.getSnapshot().view?.rematchEnemyVoted, false);
  a.rematch();
  b.rematch();
  const v = a.getSnapshot().view!;
  assert.equal(v.phase, 'deck');
  assert.equal(v.matchNumber, 2);
  assert.deepEqual(v.selfLastDeckIds, ids(dA));
  assert.equal(a.getSnapshot().timers?.closeDeadlineAt, null);
});

test('終了後にサーバーが接続を閉じたら（ルームの終了）、結果は残したまま「終了」になる。以後の参加は「ルームは終了」で断られる', async () => {
  const { net, a, b } = await twoPlayers();
  a.submitDeck(ids(dA));
  b.submitDeck(ids(dB));
  b.leave();
  assert.equal(a.getSnapshot().view?.phase, 'finished');
  assert.ok(a.getSnapshot().timers?.closeDeadlineAt !== null, '閉じる時刻が届く');
  net.serverNow += FINISHED_LINGER_MS;
  net.room.tick(); // サーバーが、期限でルームを閉じる
  assert.equal(a.getSnapshot().status, 'ended');
  assert.equal(a.getSnapshot().endedReason, 'finished');
  assert.equal(a.getSnapshot().view?.matchWinner, 'self');

  const late = mkClient(net, new ManualClock(), 'token-late-0123456789abc');
  late.start();
  await tick();
  assert.equal(late.getSnapshot().status, 'ended');
  assert.equal(late.getSnapshot().endedReason, 'room-closed');
});

// ---------------------------------------------------------------------------
test('parseServerMessage：正しい形式は通り、壊れた形式は null', async () => {
  const { a } = await twoPlayers();
  const state = { t: 'state', view: a.getSnapshot().view, timers: a.getSnapshot().timers, connected: { self: true, enemy: true }, spectators: 0 };
  assert.equal(parseServerMessage(JSON.stringify(state))?.t, 'state');
  assert.deepEqual(parseServerMessage('{"t":"error","code":"x","message":"y"}'), { t: 'error', code: 'x', message: 'y' });
  const bad: unknown[] = [
    null, 42, '', 'not json', '[]', '{}', '{"t":"state"}', '{"t":"error"}', '{"t":"error","code":1,"message":"y"}',
    JSON.stringify({ ...state, view: null }),
    JSON.stringify({ ...state, view: { phase: 'x' } }),
    JSON.stringify({ ...state, timers: {} }),
    JSON.stringify({ ...state, connected: { self: true } }),
    JSON.stringify({ ...state, spectators: 'a' }),
  ];
  for (const input of bad) assert.equal(parseServerMessage(input), null, String(input).slice(0, 50));
});
