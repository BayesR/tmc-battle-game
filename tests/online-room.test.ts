import test from 'node:test';
import assert from 'node:assert/strict';
import { Room, type RoomEnv, type RoomSnapshot } from '../src/online/room';
import type { ServerMessage } from '../src/online/protocol';
import type { OnlineView } from '../src/online/types';
import {
  DECK_TIME_MS,
  DISCONNECT_GRACE_MS,
  LOBBY_DISCONNECT_GRACE_MS,
  LOBBY_EXPIRE_MS,
  MAX_SPECTATORS,
  PICK_TIME_MS,
  REVEAL_AUTO_ADVANCE_MS,
} from '../src/online/constants';
import type { CardMaster } from '../src/types/card';
import { deckOf, seededRandom } from './helpers';

const TOKEN_A = 'token-A-0123456789abcdef';
const TOKEN_B = 'token-B-0123456789abcdef';
const T0 = 1_000_000;

/** 偽の時計・偽の接続で Room を動かすための道具 */
class Harness {
  now = T0;
  inbox = new Map<string, ServerMessage[]>();
  closed = new Set<string>();
  room: Room;

  constructor(opts: { pool?: CardMaster[]; allowSpectators?: boolean; snapshot?: RoomSnapshot; rng?: () => number; startAt?: number } = {}) {
    if (opts.startAt !== undefined) this.now = opts.startAt;
    const env: RoomEnv = {
      now: () => this.now,
      rng: opts.rng ?? seededRandom(42),
      pool: opts.pool ?? [],
      allowSpectators: opts.allowSpectators,
    };
    this.room = new Room(
      env,
      {
        send: (id, m) => {
          if (!this.inbox.has(id)) this.inbox.set(id, []);
          this.inbox.get(id)!.push(m);
        },
        close: (id) => this.closed.add(id),
      },
      opts.snapshot
    );
  }

  open(id: string) {
    this.room.handleOpen(id);
  }
  send(id: string, msg: object) {
    this.room.handleMessage(id, JSON.stringify(msg));
  }
  close(id: string) {
    this.room.handleClose(id);
  }
  hello(id: string, token: string, extra: object = {}) {
    this.open(id);
    this.send(id, { t: 'hello', token, ...extra });
  }
  advance(ms: number) {
    this.now += ms;
    this.room.tick();
  }

  messages(id: string): ServerMessage[] {
    return this.inbox.get(id) ?? [];
  }
  lastState(id: string) {
    const states = this.messages(id).filter((m): m is Extract<ServerMessage, { t: 'state' }> => m.t === 'state');
    assert.ok(states.length > 0, `${id} に state が届いていない`);
    return states[states.length - 1];
  }
  view(id: string): OnlineView {
    return this.lastState(id).view;
  }
  errorCodes(id: string): string[] {
    return this.messages(id).flatMap((m) => (m.t === 'error' ? [m.code] : []));
  }
}

const idsOf = (cards: CardMaster[]) => cards.map((c) => c.id);

/** A（c1）とB（c2）が参加してデッキを提出し、pick フェーズに入った状態 */
function startedRoom(dA = deckOf('a', [3, 3, 3, 3, 3]), dB = deckOf('b', [2, 2, 2, 2, 2]), opts: Partial<ConstructorParameters<typeof Harness>[0]> = {}) {
  const h = new Harness({ pool: [...dA, ...dB], ...opts });
  h.hello('c1', TOKEN_A);
  h.hello('c2', TOKEN_B);
  h.send('c1', { t: 'submit_deck', cardIds: idsOf(dA) });
  h.send('c2', { t: 'submit_deck', cardIds: idsOf(dB) });
  return h;
}

// ---------------------------------------------------------------------------
// 参加
// ---------------------------------------------------------------------------
test('1人目は席A、2人目は席Bに着き、2人揃うとデッキ構築に進む', () => {
  const h = new Harness();
  h.hello('c1', TOKEN_A);
  assert.equal(h.view('c1').phase, 'lobby');
  assert.equal(h.view('c1').viewer, 'A');
  h.hello('c2', TOKEN_B);
  assert.equal(h.view('c2').viewer, 'B');
  assert.equal(h.view('c1').phase, 'deck');
  assert.equal(h.view('c2').phase, 'deck');
  // 相手が参加したことが、先にいた人にも通知される
  assert.ok(h.view('c1').enemyPlayer);
  assert.equal(h.lastState('c1').connected.enemy, true);
});

test('表示名はサーバーが自動生成し、クライアントが送った名前は使われない', () => {
  const h = new Harness();
  h.hello('c1', TOKEN_A, { name: '<img src=x onerror=alert(1)>' });
  const name = h.view('c1').selfPlayer!.name;
  assert.ok(!name.includes('<'), name);
  assert.ok(name.endsWith('ジャナー'), name);
});

test('2人の表示名は必ず異なる（乱数が同じ値を返し続けても）', () => {
  const h = new Harness({ rng: () => 0 });
  h.hello('c1', TOKEN_A);
  h.hello('c2', TOKEN_B);
  assert.notEqual(h.view('c1').selfPlayer!.name, h.view('c1').enemyPlayer!.name);
});

test('満員のルームには入れない。観戦は無効の間は断られる', () => {
  const h = new Harness();
  h.hello('c1', TOKEN_A);
  h.hello('c2', TOKEN_B);
  h.hello('c3', 'token-C-0123456789abcdef');
  assert.deepEqual(h.errorCodes('c3'), ['room-full']);
  h.hello('c4', 'token-D-0123456789abcdef', { spectate: true });
  assert.deepEqual(h.errorCodes('c4'), ['spectating-disabled']);
  // 満員でも、席Aの人が見ている内容は変わらない
  assert.equal(h.view('c1').phase, 'deck');
});

test('hello より前の操作・不正なメッセージ・二重の hello は拒否される', () => {
  const h = new Harness();
  h.open('c1');
  h.send('c1', { t: 'pick', instanceId: 'A:x' });
  assert.deepEqual(h.errorCodes('c1'), ['hello-required']);
  h.room.handleMessage('c1', 'これはJSONではない');
  h.room.handleMessage('c1', JSON.stringify({ t: 'unknown' }));
  assert.deepEqual(h.errorCodes('c1'), ['hello-required', 'bad-message', 'bad-message']);
  h.send('c1', { t: 'hello', token: TOKEN_A });
  h.send('c1', { t: 'hello', token: TOKEN_A });
  assert.ok(h.errorCodes('c1').includes('already-hello'));
  // 存在しない接続からのメッセージは、例外にならず無視される
  assert.doesNotThrow(() => h.room.handleMessage('ghost', JSON.stringify({ t: 'leave' })));
});

test('拒否された操作のエラーは、送った本人にだけ届く', () => {
  const h = new Harness({ pool: [...deckOf('a', [3, 3, 3, 3, 3])] });
  h.hello('c1', TOKEN_A);
  h.hello('c2', TOKEN_B);
  h.send('c1', { t: 'submit_deck', cardIds: ['a1', 'a2'] });
  assert.deepEqual(h.errorCodes('c1'), ['invalid-deck']);
  assert.deepEqual(h.errorCodes('c2'), []);
});

// ---------------------------------------------------------------------------
// 試合の進行と制限時間
// ---------------------------------------------------------------------------
test('メッセージだけで試合を最後まで進められ、終了後は期限が残らない', () => {
  const h = startedRoom();
  assert.equal(h.view('c1').phase, 'pick');
  for (let round = 1; round <= 5; round++) {
    h.send('c1', { t: 'pick', instanceId: h.view('c1').selfRemaining[0].instanceId });
    h.send('c2', { t: 'pick', instanceId: h.view('c2').selfRemaining[0].instanceId });
    assert.equal(h.view('c1').phase, 'reveal');
    h.send('c1', { t: 'ack_reveal' });
    h.send('c2', { t: 'ack_reveal' });
  }
  assert.equal(h.view('c1').phase, 'finished');
  assert.equal(h.view('c1').matchWinner, 'self');
  assert.equal(h.view('c2').matchWinner, 'enemy');
  assert.equal(h.room.nextDeadline(), null, '終了後はタイマーが残らない');
});

test('各フェーズの期限が正しく設定される', () => {
  const h = new Harness({ pool: [...deckOf('a', [3, 3, 3, 3, 3]), ...deckOf('b', [2, 2, 2, 2, 2])] });
  h.hello('c1', TOKEN_A);
  assert.equal(h.room.nextDeadline(), T0 + LOBBY_EXPIRE_MS, 'ロビーの最大待ち時間');
  h.hello('c2', TOKEN_B);
  assert.equal(h.room.nextDeadline(), T0 + DECK_TIME_MS, 'デッキ構築の制限時間');
  h.send('c1', { t: 'submit_deck', cardIds: idsOf(deckOf('a', [3, 3, 3, 3, 3])) });
  h.send('c2', { t: 'submit_deck', cardIds: idsOf(deckOf('b', [2, 2, 2, 2, 2])) });
  assert.equal(h.room.nextDeadline(), T0 + PICK_TIME_MS, '選択の制限時間');
  assert.equal(h.lastState('c1').timers.pickDeadlineAt, T0 + PICK_TIME_MS);
  assert.equal(h.lastState('c1').timers.serverNow, T0);

  h.advance(5_000);
  h.send('c1', { t: 'pick', instanceId: 'A:a1' });
  h.send('c2', { t: 'pick', instanceId: 'B:b1' });
  assert.equal(h.room.nextDeadline(), T0 + 5_000 + REVEAL_AUTO_ADVANCE_MS, '公開後の自動進行');
  assert.equal(h.lastState('c1').timers.pickDeadlineAt, null);
});

test('選択の時間切れ：ちょうど期限で、未選択の席だけが自動選択される', () => {
  const h = startedRoom();
  h.send('c1', { t: 'pick', instanceId: 'A:a2' });
  h.advance(PICK_TIME_MS - 1);
  assert.equal(h.view('c1').phase, 'pick', '期限の1ミリ秒前はまだ選択中');
  h.advance(1);
  assert.equal(h.view('c1').phase, 'reveal');
  assert.equal(h.view('c1').lastRound!.selfCard.id, 'a2', '選択済みの選択は保たれる');
  assert.equal(h.view('c1').rounds.length, 1);
});

test('結果公開の自動進行と、次のラウンドの期限の付け直し', () => {
  const h = startedRoom();
  h.send('c1', { t: 'pick', instanceId: 'A:a1' });
  h.send('c2', { t: 'pick', instanceId: 'B:b1' });
  h.advance(REVEAL_AUTO_ADVANCE_MS);
  assert.equal(h.view('c1').phase, 'pick');
  assert.equal(h.lastState('c1').timers.pickDeadlineAt, T0 + REVEAL_AUTO_ADVANCE_MS + PICK_TIME_MS, '選択の期限は毎ラウンド新しく付く');
});

test('放置すると、時間切れの自動選択と自動進行で試合が最後まで進む', () => {
  const h = startedRoom();
  for (let i = 0; i < 20 && h.view('c1').phase !== 'finished'; i++) h.advance(PICK_TIME_MS + REVEAL_AUTO_ADVANCE_MS);
  assert.equal(h.view('c1').phase, 'finished');
  assert.equal(h.view('c1').endReason, 'normal');
});

test('デッキ構築の時間切れ：未提出の1人が不戦敗、両者未提出なら勝者なし', () => {
  const dA = deckOf('a', [3, 3, 3, 3, 3]);
  const h = new Harness({ pool: dA });
  h.hello('c1', TOKEN_A);
  h.hello('c2', TOKEN_B);
  h.send('c1', { t: 'submit_deck', cardIds: idsOf(dA) });
  h.advance(DECK_TIME_MS);
  assert.equal(h.view('c1').phase, 'finished');
  assert.equal(h.view('c1').matchWinner, 'self');
  assert.equal(h.view('c1').forfeitedBy, 'enemy');

  const h2 = new Harness();
  h2.hello('c1', TOKEN_A);
  h2.hello('c2', TOKEN_B);
  h2.advance(DECK_TIME_MS);
  assert.equal(h2.view('c1').endReason, 'abandoned');
  assert.equal(h2.view('c1').matchWinner, null);
});

// ---------------------------------------------------------------------------
// 切断・再接続
// ---------------------------------------------------------------------------
test('切断すると相手に通知され、猶予内に同じ token で戻れば席も選択も保たれる', () => {
  const h = startedRoom(); // 選択の期限は T0+60秒、切断の猶予は切断から60秒
  h.send('c1', { t: 'pick', instanceId: 'A:a1' });
  h.advance(10_000);
  h.close('c1');
  assert.equal(h.lastState('c2').connected.enemy, false);
  assert.equal(h.lastState('c2').timers.graceDeadlineAt, T0 + 10_000 + DISCONNECT_GRACE_MS, '相手が戻らなければ不戦敗になる時刻');

  h.advance(30_000); // 開始から40秒。選択の期限（60秒）にも猶予の期限（70秒）にもまだ達していない
  assert.equal(h.view('c2').phase, 'pick');

  h.hello('c3', TOKEN_A); // 新しい接続（リロードなど）が同じ token で戻る
  assert.equal(h.view('c3').viewer, 'A');
  assert.equal(h.view('c3').selfPickId, 'A:a1', '選択済みのカードが復元される');
  assert.equal(h.view('c3').selfRemaining.length, 5);
  assert.equal(h.lastState('c2').connected.enemy, true);
  assert.equal(h.lastState('c2').timers.graceDeadlineAt, null, '猶予は解除される');

  h.advance(DISCONNECT_GRACE_MS * 2); // 戻ったので、以後は不戦敗にならない
  assert.notEqual(h.room.getState().endReason, 'forfeit');
});

test('猶予を過ぎても戻らなければ不戦敗になる（境界：1ミリ秒前はまだ対戦中）', () => {
  const h = startedRoom();
  h.close('c1');
  h.advance(DISCONNECT_GRACE_MS - 1);
  assert.equal(h.view('c2').phase, 'pick');
  h.advance(1);
  assert.equal(h.view('c2').phase, 'finished');
  assert.equal(h.view('c2').matchWinner, 'self');
  assert.equal(h.view('c2').forfeitedBy, 'enemy');
  assert.equal(h.room.nextDeadline(), null);
});

test('切断の猶予切れは、選択の時間切れより優先される（切断者は自動選択されない）', () => {
  const h = startedRoom(); // 選択の期限は T0+60秒
  h.close('c1'); // 猶予の期限も T0+60秒
  h.advance(PICK_TIME_MS);
  assert.equal(h.view('c2').endReason, 'forfeit');
  assert.equal(h.view('c2').rounds.length, 0, '自動選択でラウンドが進んでいない');
});

test('両者が切断したまま猶予が切れたら、勝者なしで終わる', () => {
  const h = startedRoom();
  h.close('c1');
  h.close('c2');
  h.advance(DISCONNECT_GRACE_MS);
  assert.equal(h.room.getState().endReason, 'abandoned');
  assert.equal(h.room.getState().winner, null);
});

test('同じ token で別の接続が来たら、古い接続は切り離される（二重接続）', () => {
  const h = startedRoom();
  h.hello('c3', TOKEN_A);
  assert.deepEqual(h.errorCodes('c1'), ['replaced']);
  assert.ok(h.closed.has('c1'));
  assert.equal(h.view('c3').viewer, 'A');
  // 古い接続が閉じられても、猶予（不戦敗のカウント）は始まらない
  h.close('c1');
  assert.equal(h.lastState('c2').connected.enemy, true);
  assert.equal(h.lastState('c2').timers.graceDeadlineAt, null);
});

test('ロビーで切断した場合の猶予は長く、最大待ち時間を過ぎるとルームは終了する', () => {
  const h = new Harness();
  h.hello('c1', TOKEN_A);
  h.close('c1');
  h.advance(DISCONNECT_GRACE_MS + 1);
  assert.equal(h.room.getState().phase, 'lobby', '対戦中の猶予（60秒）では終了しない');
  h.hello('c2', TOKEN_A); // 招待リンクを送って戻ってきた
  assert.equal(h.view('c2').viewer, 'A');

  const h2 = new Harness();
  h2.hello('c1', TOKEN_A);
  h2.close('c1');
  h2.advance(LOBBY_DISCONNECT_GRACE_MS);
  assert.equal(h2.room.getState().endReason, 'abandoned');

  const h3 = new Harness();
  h3.hello('c1', TOKEN_A); // 接続したままでも、誰も来なければ最大時間で終了する
  h3.advance(LOBBY_EXPIRE_MS);
  assert.equal(h3.room.getState().endReason, 'abandoned');
});

test('退出（leave）：対戦中は不戦敗になり、接続が閉じられる。ロビーでは勝者なし', () => {
  const h = startedRoom();
  h.send('c1', { t: 'leave' });
  assert.ok(h.closed.has('c1'));
  assert.equal(h.view('c2').matchWinner, 'self');
  assert.equal(h.view('c2').forfeitedBy, 'enemy');
  assert.equal(h.room.nextDeadline(), null);

  const lobby = new Harness();
  lobby.hello('c1', TOKEN_A);
  lobby.send('c1', { t: 'leave' });
  assert.equal(lobby.room.getState().endReason, 'abandoned');
});

// ---------------------------------------------------------------------------
// 情報の秘匿
// ---------------------------------------------------------------------------
test('相手に送られる全てのメッセージに、公開前の選択・相手の手札が含まれない', () => {
  const h = startedRoom();
  h.send('c1', { t: 'pick', instanceId: 'A:a3' }); // Aだけが選択済み
  const toB = JSON.stringify(h.messages('c2'));
  assert.ok(!toB.includes('A:a3'), '未公開の選択が漏れている');
  assert.ok(!toB.includes('"A:a'), '席Aのカード情報が漏れている');
  assert.equal(h.view('c2').enemyHasPicked, true, '「選択済み」という事実だけは伝わる');
  assert.ok(JSON.stringify(h.messages('c1')).includes('A:a3'), '本人には見える');
  // 再接続しても、相手の情報は増えない
  h.close('c2');
  h.hello('c4', TOKEN_B);
  assert.ok(!JSON.stringify(h.messages('c4')).includes('A:a3'));
});

test('他人の token では席に入れず、token は他の人へのメッセージに含まれない', () => {
  const h = startedRoom();
  h.hello('c5', 'token-attacker-0123456789');
  assert.deepEqual(h.errorCodes('c5'), ['room-full']);
  for (const id of ['c1', 'c2', 'c5']) {
    const all = JSON.stringify(h.messages(id));
    assert.ok(!all.includes(TOKEN_A) && !all.includes(TOKEN_B), `${id} 宛のメッセージに token が含まれている`);
  }
});

// ---------------------------------------------------------------------------
// 観戦
// ---------------------------------------------------------------------------
test('観戦（有効時）：途中から入っても今の状態を受け取れ、未公開の情報と操作権限は無い', () => {
  const h = startedRoom(undefined, undefined, { allowSpectators: true });
  h.send('c1', { t: 'pick', instanceId: 'A:a1' });
  h.send('c2', { t: 'pick', instanceId: 'B:b1' }); // 1ラウンド公開
  h.send('c1', { t: 'ack_reveal' });
  h.send('c2', { t: 'ack_reveal' });
  h.send('c1', { t: 'pick', instanceId: 'A:a2' }); // 2ラウンド目はAだけ選択済み（未公開）
  assert.equal(h.view('c1').phase, 'pick');
  h.hello('s1', 'token-spectator-0123456789', { spectate: true });
  const v = h.view('s1');
  assert.equal(v.viewer, 'spectator');
  assert.equal(v.rounds.length, 1, '公開済みのラウンドは見える');
  assert.deepEqual(v.selfRemaining, []);
  assert.ok(!JSON.stringify(h.messages('s1')).includes('A:a2'), '未公開の選択は見えない');
  assert.equal(h.lastState('s1').spectators, 1);
  assert.equal(h.lastState('c1').spectators, 1, 'プレイヤーにも観戦者数が伝わる');

  h.send('s1', { t: 'pick', instanceId: 'A:a3' });
  assert.deepEqual(h.errorCodes('s1'), ['not-a-player']);

  // 観戦者の入退室で、試合の進行は変わらない
  h.close('s1');
  assert.equal(h.lastState('c1').spectators, 0);
  assert.equal(h.view('c1').phase, 'pick');
});

test('観戦者の人数には上限がある', () => {
  const h = startedRoom(undefined, undefined, { allowSpectators: true });
  for (let i = 0; i < MAX_SPECTATORS; i++) h.hello(`s${i}`, `token-spec-${i}-0123456789`, { spectate: true });
  h.hello('over', 'token-spec-over-0123456789', { spectate: true });
  assert.deepEqual(h.errorCodes('over'), ['room-full']);
});

// ---------------------------------------------------------------------------
// 保存と復元
// ---------------------------------------------------------------------------
test('保存した状態から復元でき、token で席に戻って試合を続けられる（JSONを経由しても同じ）', () => {
  const dA = deckOf('a', [3, 3, 3, 3, 3]);
  const dB = deckOf('b', [2, 2, 2, 2, 2]);
  const h = startedRoom(dA, dB);
  h.send('c1', { t: 'pick', instanceId: 'A:a1' });
  const saved = JSON.parse(JSON.stringify(h.room.snapshot())) as RoomSnapshot;

  // サーバーが再起動した想定：新しい Room を、同じ時刻付近で復元する
  const h2 = new Harness({ pool: [...dA, ...dB], snapshot: saved, startAt: T0 + 5_000 });
  assert.equal(h2.room.getState().phase, 'pick');
  assert.equal(h2.room.nextDeadline(), T0 + PICK_TIME_MS, '期限が復元されている');

  h2.hello('n1', TOKEN_A);
  h2.hello('n2', TOKEN_B);
  assert.equal(h2.view('n1').selfPickId, 'A:a1', '選択済みのカードが復元されている');
  h2.send('n2', { t: 'pick', instanceId: 'B:b1' });
  assert.equal(h2.view('n1').phase, 'reveal');
  assert.equal(h2.view('n1').rounds.length, 1);

  // 他人の token では入れない
  h2.hello('n3', 'token-stranger-0123456789');
  assert.deepEqual(h2.errorCodes('n3'), ['room-full']);
});

test('復元した直後は、着席済みの席に戻ってくるための猶予が与えられる', () => {
  const h = startedRoom();
  const saved = JSON.parse(JSON.stringify(h.room.snapshot())) as RoomSnapshot;
  const h2 = new Harness({ pool: [], snapshot: saved, startAt: T0 + 1_000 });
  h2.advance(DISCONNECT_GRACE_MS);
  assert.equal(h2.room.getState().endReason, 'abandoned', '誰も戻らなければ、両者切断として勝者なしで終わる');
});

test('未対応の形式のスナップショットは拒否される', () => {
  assert.throws(() => new Harness({ snapshot: { v: 2 } as unknown as RoomSnapshot }), /未対応/);
});

test('切断中の相手がいる状態で試合が終わっても、期限が残らない（alarmの無限ループ防止）', () => {
  const h = startedRoom();
  h.close('c1'); // Aが切断（猶予の期限が付く）
  assert.ok(h.room.nextDeadline() !== null);
  h.send('c2', { t: 'leave' }); // Bが退出して、試合が終了
  assert.equal(h.room.getState().phase, 'finished');
  assert.equal(h.room.nextDeadline(), null, '終了後に、過去になる期限が残っていると目覚ましが回り続ける');
  h.advance(DISCONNECT_GRACE_MS * 10);
  assert.equal(h.room.nextDeadline(), null);
});
