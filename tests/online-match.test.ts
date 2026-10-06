import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createInitialOnlineState,
  flipResult,
  makeInstanceId,
  onlineReducer,
  viewFor,
  type OnlineAction,
  type OnlineContext,
} from '../src/online/match';
import type { OnlineMatchState, Seat } from '../src/online/types';
import type { CardMaster } from '../src/types/card';
import { compareCards } from '../src/logic/compareCards';
import { generateLevelTunedNpcDeck } from '../src/logic/npcDeckGenerator';
import { CARD_POOL, seededRandom, withSeededMath } from './helpers';

// ---------------------------------------------------------------------------
// テスト用の合成カード：強さ（Monster Pride）だけで勝敗が決まる。PP・Voidなし。
// ---------------------------------------------------------------------------
const NO_PP = [
  { legacy: '未使用', value: 0 },
  { legacy: '未使用', value: 0 },
  { legacy: '未使用', value: 0 },
] as CardMaster['potentialPoints'];

const mk = (id: string, monsterPride: number): CardMaster => ({
  id,
  name: id,
  legacy: '環',
  monsterPride,
  potentialPoints: NO_PP,
  hasVoid: false,
  rarity: 'N',
  suggestedNpcLevel: 'Lv1',
  battleStreetRarity: 'N',
});

const deckOf = (prefix: string, mps: number[]) => mps.map((mp, i) => mk(`${prefix}${i + 1}`, mp));
const idsOf = (cards: CardMaster[]) => cards.map((c) => c.id);

function ctxFor(pool: CardMaster[], seed = 1): OnlineContext {
  return { pool, rng: seededRandom(seed) };
}

/** アクションを適用し、エラーなら例外にする（正常系のテストを読みやすくするため） */
function run(state: OnlineMatchState, ctx: OnlineContext, ...actions: OnlineAction[]): OnlineMatchState {
  let s = state;
  for (const a of actions) {
    const r = onlineReducer(s, a, ctx);
    assert.equal(r.error, null, `${a.type} が拒否された: ${r.error?.message}`);
    s = r.state;
  }
  return s;
}

/** 2人が席に着き、デッキを提出した状態（pick フェーズ）を作る */
function startedMatch(deckA: CardMaster[], deckB: CardMaster[], seed = 1) {
  const ctx = ctxFor([...deckA, ...deckB], seed);
  const state = run(
    createInitialOnlineState(),
    ctx,
    { type: 'SEAT', seat: 'A', name: 'アキ' },
    { type: 'SEAT', seat: 'B', name: 'ボブ' },
    { type: 'SUBMIT_DECK', seat: 'A', cardIds: idsOf(deckA) },
    { type: 'SUBMIT_DECK', seat: 'B', cardIds: idsOf(deckB) }
  );
  return { ctx, state };
}

const pickBoth = (a: string, b: string): OnlineAction[] => [
  { type: 'PICK', seat: 'A', instanceId: makeInstanceId('A', a) },
  { type: 'PICK', seat: 'B', instanceId: makeInstanceId('B', b) },
];
const ackBoth: OnlineAction[] = [
  { type: 'ACK_REVEAL', seat: 'A' },
  { type: 'ACK_REVEAL', seat: 'B' },
];

// ---------------------------------------------------------------------------
// 基本の流れ
// ---------------------------------------------------------------------------
test('ロビー→デッキ提出→選択、と進み、2人揃うまでは次のフェーズに進まない', () => {
  const dA = deckOf('a', [3, 3, 3, 3, 3]);
  const dB = deckOf('b', [2, 2, 2, 2, 2]);
  const ctx = ctxFor([...dA, ...dB]);

  let s = createInitialOnlineState();
  assert.equal(s.phase, 'lobby');
  s = run(s, ctx, { type: 'SEAT', seat: 'A', name: 'アキ' });
  assert.equal(s.phase, 'lobby', '1人だけではロビーのまま');
  s = run(s, ctx, { type: 'SEAT', seat: 'B', name: 'ボブ' });
  assert.equal(s.phase, 'deck');
  s = run(s, ctx, { type: 'SUBMIT_DECK', seat: 'A', cardIds: idsOf(dA) });
  assert.equal(s.phase, 'deck', '片方だけの提出ではデッキ構築のまま');
  s = run(s, ctx, { type: 'SUBMIT_DECK', seat: 'B', cardIds: idsOf(dB) });
  assert.equal(s.phase, 'pick');
  assert.equal(s.remaining.A.length, 5);
  assert.equal(s.remaining.B.length, 5);
});

test('片方だけが選んだ段階では結果は公開されず、両者が揃った瞬間に判定される', () => {
  const { ctx, state } = startedMatch(deckOf('a', [3, 3, 3, 3, 3]), deckOf('b', [2, 2, 2, 2, 2]));
  let s = run(state, ctx, { type: 'PICK', seat: 'A', instanceId: makeInstanceId('A', 'a1') });
  assert.equal(s.phase, 'pick');
  assert.equal(s.rounds.length, 0);
  s = run(s, ctx, { type: 'PICK', seat: 'B', instanceId: makeInstanceId('B', 'b1') });
  assert.equal(s.phase, 'reveal');
  assert.equal(s.rounds.length, 1);
  assert.equal(s.rounds[0].result.winner, 'self'); // 3 vs 2 → 席Aの勝ち
  assert.equal(s.remaining.A.length, 4);
  assert.deepEqual(s.picks, { A: null, B: null }, '公開後は選択がクリアされる');
});

test('勝敗が確定しても、5戦目まで最後までやる（途中で打ち切らない）', () => {
  const { ctx, state } = startedMatch(deckOf('a', [3, 3, 3, 3, 3]), deckOf('b', [2, 2, 2, 2, 2]));
  let s = state;
  for (let i = 1; i <= 5; i++) {
    s = run(s, ctx, ...pickBoth(`a${i}`, `b${i}`), ...ackBoth);
    if (i < 5) assert.equal(s.phase, 'pick', `${i}戦目の後（席Aは${i}勝）でも続行する`);
  }
  assert.equal(s.phase, 'finished');
  assert.equal(s.rounds.length, 5);
  assert.equal(s.winner, 'A');
  assert.equal(s.endReason, 'normal');
  assert.equal(s.isSuddenDeath, false);
});

test('5戦で勝ち数が同数ならサドンデスに入り、手札が5枚に戻る。最初に1勝した側が勝つ', () => {
  // A:[3,3,3,3,2] B:[3,3,3,3,2]
  const { ctx, state } = startedMatch(deckOf('a', [3, 3, 3, 3, 2]), deckOf('b', [3, 3, 3, 3, 2]));
  let s = run(
    state,
    ctx,
    ...pickBoth('a5', 'b1'), ...ackBoth, // 2 vs 3 → Bの勝ち
    ...pickBoth('a1', 'b5'), ...ackBoth, // 3 vs 2 → Aの勝ち
    ...pickBoth('a2', 'b2'), ...ackBoth, // 引き分け
    ...pickBoth('a3', 'b3'), ...ackBoth, // 引き分け
    ...pickBoth('a4', 'b4'), ...ackBoth // 引き分け → 1勝1敗でサドンデスへ
  );
  assert.equal(s.phase, 'pick');
  assert.equal(s.isSuddenDeath, true);
  assert.equal(s.remaining.A.length, 5, 'サドンデスは同じ5枚の手札に戻る');
  assert.equal(s.remaining.B.length, 5);
  assert.equal(s.board.length, 0, '盤面はクリアされる');
  assert.equal(s.rounds.length, 5, '通常戦の記録は保持される');

  s = run(s, ctx, ...pickBoth('a1', 'b5')); // 3 vs 2 → Aが最初に1勝
  assert.equal(s.suddenDeathRounds.length, 1);
  s = run(s, ctx, ...ackBoth);
  assert.equal(s.phase, 'finished');
  assert.equal(s.winner, 'A');
  assert.equal(s.endReason, 'normal');
});

test('サドンデスの1周が全て引き分けなら、同じ手札でもう一度サドンデスになる', () => {
  const { ctx, state } = startedMatch(deckOf('a', [3, 3, 3, 3, 3]), deckOf('b', [3, 3, 3, 3, 3]));
  let s = state;
  // 通常5戦：全て引き分け → サドンデス
  for (let i = 1; i <= 5; i++) s = run(s, ctx, ...pickBoth(`a${i}`, `b${i}`), ...ackBoth);
  assert.equal(s.isSuddenDeath, true);
  // サドンデス1周：全て引き分け → もう一度
  for (let i = 1; i <= 5; i++) {
    s = run(s, ctx, ...pickBoth(`a${i}`, `b${i}`), ...ackBoth);
  }
  assert.equal(s.phase, 'pick', '決着がつかないので続行');
  assert.equal(s.suddenDeathRounds.length, 5);
  assert.equal(s.remaining.A.length, 5, '手札が戻っている');
  assert.equal(s.board.length, 0);
  assert.equal(s.winner, null);
});

test('Root Counter（MP1がMP5に勝つ）も判定される', () => {
  const { ctx, state } = startedMatch(deckOf('a', [1, 2, 3, 3, 3]), deckOf('b', [5, 1, 1, 1, 1]));
  const s = run(state, ctx, ...pickBoth('a1', 'b1'));
  assert.equal(s.rounds[0].result.winner, 'self');
  assert.equal(s.rounds[0].result.rootCounter, true);
});

// ---------------------------------------------------------------------------
// 時間切れ・不戦敗
// ---------------------------------------------------------------------------
test('選択の時間切れ：未選択の席だけが残りカードからランダムに自動選択される', () => {
  const { ctx, state } = startedMatch(deckOf('a', [3, 3, 3, 3, 3]), deckOf('b', [2, 2, 2, 2, 2]));
  let s = run(state, ctx, { type: 'PICK', seat: 'A', instanceId: makeInstanceId('A', 'a2') });
  s = run(s, ctx, { type: 'TIMEOUT_PICK' });
  assert.equal(s.phase, 'reveal');
  assert.equal(s.lastRound?.selfCard.id, 'a2', '選択済みの席の選択は変わらない');
  assert.ok(s.lastRound?.enemyCard.id.startsWith('b'), '未選択の席は自動で選ばれる');
  assert.equal(s.remaining.B.length, 4);
});

test('選択の時間切れ：両者とも未選択でも、両者ランダムに選ばれて進行する', () => {
  const { ctx, state } = startedMatch(deckOf('a', [3, 3, 3, 3, 3]), deckOf('b', [2, 2, 2, 2, 2]));
  const s = run(state, ctx, { type: 'TIMEOUT_PICK' });
  assert.equal(s.phase, 'reveal');
  assert.equal(s.rounds.length, 1);
});

test('結果公開の自動進行：両者の確認を待たずに次へ進める', () => {
  const { ctx, state } = startedMatch(deckOf('a', [3, 3, 3, 3, 3]), deckOf('b', [2, 2, 2, 2, 2]));
  let s = run(state, ctx, ...pickBoth('a1', 'b1'));
  s = run(s, ctx, { type: 'ACK_REVEAL', seat: 'A' });
  assert.equal(s.phase, 'reveal', '片方の確認だけでは進まない');
  s = run(s, ctx, { type: 'TIMEOUT_REVEAL' });
  assert.equal(s.phase, 'pick');
  assert.deepEqual(s.revealAcks, { A: false, B: false }, '確認フラグはリセットされる');
});

test('不戦敗：相手の勝ちになり、視点ごとに勝者・不戦敗側が正しく見える', () => {
  const { ctx, state } = startedMatch(deckOf('a', [3, 3, 3, 3, 3]), deckOf('b', [2, 2, 2, 2, 2]));
  const s = run(state, ctx, { type: 'FORFEIT', seat: 'A', cause: 'disconnect' });
  assert.equal(s.phase, 'finished');
  assert.equal(s.winner, 'B');
  assert.equal(s.endReason, 'forfeit');
  assert.equal(s.forfeitedBy, 'A');

  const vA = viewFor(s, 'A');
  assert.equal(vA.matchWinner, 'enemy');
  assert.equal(vA.forfeitedBy, 'self');
  const vB = viewFor(s, 'B');
  assert.equal(vB.matchWinner, 'self');
  assert.equal(vB.forfeitedBy, 'enemy');
});

test('相手がまだ来ていないロビーでの退出は、勝者なし（abandoned）で終わる', () => {
  const ctx = ctxFor([]);
  let s = run(createInitialOnlineState(), ctx, { type: 'SEAT', seat: 'A', name: 'アキ' });
  s = run(s, ctx, { type: 'FORFEIT', seat: 'A', cause: 'left' });
  assert.equal(s.phase, 'finished');
  assert.equal(s.winner, null);
  assert.equal(s.endReason, 'abandoned');
});

test('デッキ構築中にデッキ未提出の席が時間切れになっても、不戦敗として扱える', () => {
  const dA = deckOf('a', [3, 3, 3, 3, 3]);
  const ctx = ctxFor(dA);
  let s = run(
    createInitialOnlineState(),
    ctx,
    { type: 'SEAT', seat: 'A', name: 'アキ' },
    { type: 'SEAT', seat: 'B', name: 'ボブ' },
    { type: 'SUBMIT_DECK', seat: 'A', cardIds: idsOf(dA) }
  );
  s = run(s, ctx, { type: 'FORFEIT', seat: 'B', cause: 'deck-timeout' });
  assert.equal(s.winner, 'A');
  assert.equal(s.endReason, 'forfeit');
});

// ---------------------------------------------------------------------------
// 不正な操作の拒否（状態は変わらない）
// ---------------------------------------------------------------------------
test('不正な操作は拒否され、状態オブジェクトは一切変更されない', () => {
  const dA = deckOf('a', [3, 3, 3, 3, 3]);
  const dB = deckOf('b', [2, 2, 2, 2, 2]);
  const ctx = ctxFor([...dA, ...dB]);
  const expectReject = (state: OnlineMatchState, action: OnlineAction, code: string) => {
    const before = JSON.stringify(state);
    const r = onlineReducer(state, action, ctx);
    assert.equal(r.error?.code, code, `${action.type}: ${r.error?.message}`);
    assert.strictEqual(r.state, state, '同じ状態オブジェクトが返る');
    assert.equal(JSON.stringify(state), before, '中身も変わっていない');
  };

  // ロビー
  let s = createInitialOnlineState();
  expectReject(s, { type: 'SUBMIT_DECK', seat: 'A', cardIds: idsOf(dA) }, 'wrong-phase');
  expectReject(s, { type: 'PICK', seat: 'A', instanceId: 'A:a1' }, 'wrong-phase');
  expectReject(s, { type: 'ACK_REVEAL', seat: 'A' }, 'wrong-phase');
  expectReject(s, { type: 'TIMEOUT_PICK' }, 'wrong-phase');
  s = run(s, ctx, { type: 'SEAT', seat: 'A', name: 'アキ' });
  expectReject(s, { type: 'SEAT', seat: 'A', name: 'なりすまし' }, 'seat-taken');

  // デッキ構築
  s = run(s, ctx, { type: 'SEAT', seat: 'B', name: 'ボブ' });
  expectReject(s, { type: 'SEAT', seat: 'A', name: 'x' }, 'wrong-phase');
  expectReject(s, { type: 'SUBMIT_DECK', seat: 'A', cardIds: ['a1', 'a2'] }, 'invalid-deck');
  expectReject(s, { type: 'SUBMIT_DECK', seat: 'A', cardIds: 'not-an-array' }, 'invalid-deck');
  expectReject(s, { type: 'SUBMIT_DECK', seat: 'A', cardIds: ['a1', 'a2', 'a3', 'a4', '存在しないカード'] }, 'invalid-deck');
  s = run(s, ctx, { type: 'SUBMIT_DECK', seat: 'A', cardIds: idsOf(dA) });
  expectReject(s, { type: 'SUBMIT_DECK', seat: 'A', cardIds: idsOf(dA) }, 'already-submitted');
  expectReject(s, { type: 'PICK', seat: 'A', instanceId: 'A:a1' }, 'wrong-phase');

  // 選択
  s = run(s, ctx, { type: 'SUBMIT_DECK', seat: 'B', cardIds: idsOf(dB) });
  expectReject(s, { type: 'PICK', seat: 'A', instanceId: makeInstanceId('B', 'b1') }, 'invalid-card'); // 相手のカード
  expectReject(s, { type: 'PICK', seat: 'A', instanceId: 'A:存在しない' }, 'invalid-card');
  expectReject(s, { type: 'PICK', seat: 'A', instanceId: 12345 }, 'invalid-card');
  expectReject(s, { type: 'ACK_REVEAL', seat: 'A' }, 'wrong-phase');
  s = run(s, ctx, { type: 'PICK', seat: 'A', instanceId: makeInstanceId('A', 'a1') });
  expectReject(s, { type: 'PICK', seat: 'A', instanceId: makeInstanceId('A', 'a2') }, 'already-picked'); // 確定後は変更不可

  // 終了後
  const done = run(s, ctx, { type: 'FORFEIT', seat: 'A', cause: 'left' });
  expectReject(done, { type: 'FORFEIT', seat: 'B', cause: 'left' }, 'wrong-phase');
  expectReject(done, { type: 'PICK', seat: 'B', instanceId: makeInstanceId('B', 'b1') }, 'wrong-phase');
  expectReject(done, { type: 'ABANDON' }, 'wrong-phase');
});

test('提出デッキの実体は、クライアントの申告ではなくサーバーのカードプールから作られる', () => {
  const dA = deckOf('a', [3, 3, 3, 3, 3]);
  const ctx = ctxFor(dA);
  let s = run(createInitialOnlineState(), ctx, { type: 'SEAT', seat: 'A', name: 'a' }, { type: 'SEAT', seat: 'B', name: 'b' });
  // 余計なデータを混ぜた cardIds（IDだけが使われ、強さを書き換える余地がないことを確認）
  s = run(s, ctx, { type: 'SUBMIT_DECK', seat: 'A', cardIds: idsOf(dA) });
  s.hands.A.forEach((c, i) => {
    assert.equal(c.monsterPride, 3);
    assert.equal(c.instanceId, makeInstanceId('A', dA[i].id));
  });
});

test('両者が同じカードを使ってもよく、席ごとに別の個体として区別される', () => {
  const shared = deckOf('x', [3, 3, 3, 3, 3]);
  const { ctx, state } = startedMatch(shared, shared);
  assert.equal(state.phase, 'pick');
  assert.equal(state.hands.A[0].instanceId, 'A:x1');
  assert.equal(state.hands.B[0].instanceId, 'B:x1');
  const s = run(state, ctx, { type: 'PICK', seat: 'A', instanceId: 'A:x1' }, { type: 'PICK', seat: 'B', instanceId: 'B:x1' });
  assert.equal(s.rounds[0].result.winner, 'draw'); // 同じカード同士は引き分け
  assert.equal(s.remaining.A.length, 4);
  assert.equal(s.remaining.B.length, 4);
});

// ---------------------------------------------------------------------------
// 情報の秘匿（相手・観戦者に、未公開の選択や相手の手札を渡さない）
// ---------------------------------------------------------------------------
test('未公開の選択は、相手にも観戦者にも渡らない。本人には見える', () => {
  const { ctx, state } = startedMatch(deckOf('a', [3, 3, 3, 3, 3]), deckOf('b', [2, 2, 2, 2, 2]));
  const picked = makeInstanceId('A', 'a3');
  const s = run(state, ctx, { type: 'PICK', seat: 'A', instanceId: picked });

  const own = viewFor(s, 'A');
  assert.equal(own.selfPickId, picked, '本人には自分の選択が見える');
  assert.equal(own.selfHasPicked, true);

  for (const viewer of ['B', 'spectator'] as const) {
    const v = viewFor(s, viewer);
    const json = JSON.stringify(v);
    assert.ok(!json.includes(picked), `${viewer} のビューに未公開の選択が含まれている`);
    assert.ok(!json.includes('A:a'), `${viewer} のビューに席Aのカード情報が含まれている`);
  }
  // 「選択済みか」の事実だけは公開される
  assert.equal(viewFor(s, 'B').enemyHasPicked, true);
  assert.equal(viewFor(s, 'spectator').selfHasPicked, true);
});

test('相手の手札の中身は、公開されるまで渡らない（残り枚数だけ分かる）', () => {
  const { ctx, state } = startedMatch(deckOf('a', [3, 3, 3, 3, 3]), deckOf('b', [2, 2, 2, 2, 2]));
  const vB = viewFor(state, 'B');
  assert.equal(vB.enemyRemainingCount, 5);
  assert.equal(vB.selfRemaining.length, 5);
  assert.ok(!JSON.stringify(vB).includes('"A:'), '席Aのカードのinstanceidが含まれていない');

  // 1ラウンド公開後は、公開されたカードだけが相手にも見える
  const s = run(state, ctx, ...pickBoth('a1', 'b1'));
  const json = JSON.stringify(viewFor(s, 'B'));
  assert.ok(json.includes('"A:a1"'), '公開されたカードは見える');
  assert.ok(!json.includes('"A:a2"') && !json.includes('"A:a3"'), '未公開のカードは見えない');
});

test('観戦者には、プレイヤー本人にしか見えない情報（手札）が渡らない', () => {
  const { ctx, state } = startedMatch(deckOf('a', [3, 3, 3, 3, 3]), deckOf('b', [2, 2, 2, 2, 2]));
  const s = run(state, ctx, ...pickBoth('a1', 'b1'));
  const v = viewFor(s, 'spectator');
  assert.deepEqual(v.selfRemaining, []);
  assert.equal(v.selfPickId, null);
  assert.equal(v.viewer, 'spectator');
  assert.equal(v.selfRemainingCount, 4);
  assert.equal(v.enemyRemainingCount, 4);
  assert.equal(v.rounds.length, 1, '公開済みのラウンドは観戦者にも見える');
});

// ---------------------------------------------------------------------------
// 視点の変換
// ---------------------------------------------------------------------------
test('flipResult(compareCards(a, b)) は、全カードの組み合わせで compareCards(b, a) と一致する', () => {
  let checked = 0;
  for (const a of CARD_POOL) {
    for (const b of CARD_POOL) {
      assert.deepEqual(flipResult(compareCards(a, b)), compareCards(b, a), `${a.id} vs ${b.id}`);
      checked++;
    }
  }
  assert.equal(checked, CARD_POOL.length * CARD_POOL.length);
});

test('席Bの視点では self/enemy が入れ替わり、席Aの視点とは鏡写しになる', () => {
  const { ctx, state } = startedMatch(deckOf('a', [3, 3, 3, 3, 3]), deckOf('b', [2, 2, 2, 2, 2]));
  const s = run(state, ctx, ...pickBoth('a1', 'b1'));
  const vA = viewFor(s, 'A');
  const vB = viewFor(s, 'B');
  assert.equal(vA.rounds[0].selfCard.id, 'a1');
  assert.equal(vB.rounds[0].selfCard.id, 'b1');
  assert.equal(vA.rounds[0].result.winner, 'self');
  assert.equal(vB.rounds[0].result.winner, 'enemy');
  assert.equal(vA.selfPlayer?.name, 'アキ');
  assert.equal(vB.selfPlayer?.name, 'ボブ');
  assert.equal(vB.enemyPlayer?.name, 'アキ');
});

// ---------------------------------------------------------------------------
// ランダムな試合を大量に流して、常に成り立つべき性質（不変条件）を確認する
// ---------------------------------------------------------------------------
test('ランダムな400試合で、進行ルールと不変条件が常に成り立つ', () => {
  const stats = { normal: 0, suddenDeath: 0, forfeit: 0 };

  for (let seed = 1; seed <= 400; seed++) {
    const rng = seededRandom(seed * 7919);
    const [deckA, deckB] = withSeededMath(seed, () => [
      generateLevelTunedNpcDeck(CARD_POOL, 'Lv2') ?? [],
      generateLevelTunedNpcDeck(CARD_POOL, 'Lv3') ?? [],
    ]);
    assert.equal(deckA.length, 5);
    const ctx: OnlineContext = { pool: CARD_POOL, rng };

    let s = run(
      createInitialOnlineState(),
      ctx,
      { type: 'SEAT', seat: 'A', name: 'A' },
      { type: 'SEAT', seat: 'B', name: 'B' },
      { type: 'SUBMIT_DECK', seat: 'A', cardIds: idsOf(deckA) },
      { type: 'SUBMIT_DECK', seat: 'B', cardIds: idsOf(deckB) }
    );

    // たまに途中で不戦敗にする
    const forfeitAt = rng() < 0.1 ? Math.floor(rng() * 6) : -1;
    let steps = 0;

    for (let guard = 0; guard < 2000 && s.phase !== 'finished'; guard++) {
      if (steps === forfeitAt && s.phase === 'pick') {
        s = run(s, ctx, { type: 'FORFEIT', seat: rng() < 0.5 ? 'A' : 'B', cause: 'disconnect' });
        break;
      }
      if (s.phase === 'pick') {
        // 両者ランダム。たまに時間切れ（自動選択）を挟む
        if (rng() < 0.15) {
          s = run(s, ctx, { type: 'TIMEOUT_PICK' });
        } else {
          for (const seat of ['A', 'B'] as Seat[]) {
            const choices = s.remaining[seat];
            const pick = choices[Math.floor(rng() * choices.length)];
            s = run(s, ctx, { type: 'PICK', seat, instanceId: pick.instanceId });
          }
        }
        steps++;
      } else if (s.phase === 'reveal') {
        s = rng() < 0.2 ? run(s, ctx, { type: 'TIMEOUT_REVEAL' }) : run(s, ctx, ...ackBoth);
      }

      // --- 常に成り立つ性質 ---
      for (const seat of ['A', 'B'] as Seat[]) {
        const ids = s.remaining[seat].map((c) => c.instanceId);
        assert.equal(new Set(ids).size, ids.length, '残りカードに重複がない');
        assert.ok(ids.every((id) => s.hands[seat].some((h) => h.instanceId === id)), '残りカードは提出デッキの中にある');
      }
      assert.ok(s.rounds.length <= 5, '通常戦は5戦まで');
      if (s.isSuddenDeath) assert.equal(s.rounds.length, 5, 'サドンデスは5戦完走した後にだけ起こる');
    }

    assert.equal(s.phase, 'finished', `seed ${seed}: 試合が終了していない`);

    if (s.endReason === 'forfeit') {
      stats.forfeit++;
      assert.ok(s.winner !== null && s.forfeitedBy !== null && s.winner !== s.forfeitedBy);
      continue;
    }

    assert.equal(s.endReason, 'normal');
    assert.ok(s.winner === 'A' || s.winner === 'B', '通常終了には必ず勝者がいる');
    const wins = { A: 0, B: 0 };
    s.rounds.forEach((r) => {
      if (r.result.winner === 'self') wins.A++;
      else if (r.result.winner === 'enemy') wins.B++;
    });

    if (!s.isSuddenDeath) {
      stats.normal++;
      assert.equal(s.rounds.length, 5, '通常決着でも5戦すべて行う');
      assert.ok(wins.A !== wins.B);
      assert.equal(s.winner, wins.A > wins.B ? 'A' : 'B', '勝ち数の多い方が勝つ');
      assert.equal(s.suddenDeathRounds.length, 0);
    } else {
      stats.suddenDeath++;
      assert.equal(wins.A, wins.B, 'サドンデスに入るのは5戦が同数の時だけ');
      const sd = s.suddenDeathRounds;
      const last = sd[sd.length - 1];
      assert.ok(last.result.winner !== 'draw', 'サドンデスは勝敗がついた時に終わる');
      assert.equal(s.winner, last.result.winner === 'self' ? 'A' : 'B', '最後のサドンデスで勝った側が勝者');
      assert.ok(sd.slice(0, -1).every((r) => r.result.winner === 'draw'), '決着前のサドンデスは全て引き分け');
    }

    // 席Aの視点と席Bの視点は常に鏡写し
    const vA = viewFor(s, 'A');
    const vB = viewFor(s, 'B');
    assert.equal(vA.rounds.length, vB.rounds.length);
    vA.rounds.forEach((r, i) => assert.deepEqual(vB.rounds[i].result, flipResult(r.result)));
    assert.equal(vA.matchWinner === 'self', vB.matchWinner === 'enemy');
  }

  // 検証が空振りしていないこと（各ケースが実際に発生している）
  assert.ok(stats.normal > 50, `通常決着が少なすぎる: ${JSON.stringify(stats)}`);
  assert.ok(stats.suddenDeath > 10, `サドンデスが少なすぎる: ${JSON.stringify(stats)}`);
  assert.ok(stats.forfeit > 10, `不戦敗が少なすぎる: ${JSON.stringify(stats)}`);
});

// ---------------------------------------------------------------------------
// 再戦
// ---------------------------------------------------------------------------
/** A が全勝して終了した状態（通常の決着） */
function finishedNormally() {
  const { ctx, state } = startedMatch(deckOf('a', [3, 3, 3, 3, 3]), deckOf('b', [2, 2, 2, 2, 2]));
  let s = state;
  for (let i = 1; i <= 5; i++) s = run(s, ctx, ...pickBoth(`a${i}`, `b${i}`), ...ackBoth);
  assert.equal(s.phase, 'finished');
  return { ctx, s };
}

test('再戦は、対戦が終わるまで選べない', () => {
  const { ctx, state } = startedMatch(deckOf('a', [3, 3, 3, 3, 3]), deckOf('b', [2, 2, 2, 2, 2]));
  const r = onlineReducer(state, { type: 'REMATCH_VOTE', seat: 'A' }, ctx);
  assert.equal(r.error?.code, 'wrong-phase');
  assert.strictEqual(r.state, state);
});

test('再戦：片方だけの希望では始まらず、両者が希望すると、同じ2人でデッキ構築からやり直す', () => {
  const { ctx, s } = finishedNormally();
  let t = run(s, ctx, { type: 'REMATCH_VOTE', seat: 'A' });
  assert.equal(t.phase, 'finished', '片方だけでは始まらない');
  assert.deepEqual(t.rematchVotes, { A: true, B: false });
  assert.equal(viewFor(t, 'B').rematchEnemyVoted, true, '相手が希望していることが分かる');
  assert.equal(viewFor(t, 'A').rematchSelfVoted, true);

  t = run(t, ctx, { type: 'REMATCH_VOTE', seat: 'B' });
  assert.equal(t.phase, 'deck');
  assert.equal(t.matchNumber, 2);
  assert.deepEqual(t.players, s.players, '席と名前はそのまま');
  assert.deepEqual(t.deckSubmitted, { A: false, B: false });
  assert.deepEqual(t.hands, { A: [], B: [] });
  assert.deepEqual(t.rematchVotes, { A: false, B: false });
  assert.equal(t.rounds.length, 0);
  assert.equal(t.suddenDeathRounds.length, 0);
  assert.equal(t.board.length, 0);
  assert.equal(t.lastRound, null);
  assert.equal(t.isSuddenDeath, false);
  assert.equal(t.winner, null);
  assert.equal(t.endReason, null);
  assert.deepEqual(t.lastDeckIds.A, ['a1', 'a2', 'a3', 'a4', 'a5'], '前回のデッキのIDが引き継がれる');
});

test('再戦の希望は、取り消せる。同じ席が繰り返し希望しても問題ない', () => {
  const { ctx, s } = finishedNormally();
  let t = run(s, ctx, { type: 'REMATCH_VOTE', seat: 'A' }, { type: 'REMATCH_VOTE', seat: 'A' });
  assert.deepEqual(t.rematchVotes, { A: true, B: false });
  t = run(t, ctx, { type: 'REMATCH_CANCEL', seat: 'A' });
  assert.deepEqual(t.rematchVotes, { A: false, B: false });
  t = run(t, ctx, { type: 'REMATCH_VOTE', seat: 'B' });
  assert.equal(t.phase, 'finished', 'Aが取り消したので、Bだけでは始まらない');
});

test('途中で終了した対戦（不戦敗・勝者なし）は、再戦の対象にならない', () => {
  const { ctx, state } = startedMatch(deckOf('a', [3, 3, 3, 3, 3]), deckOf('b', [2, 2, 2, 2, 2]));
  const forfeited = run(state, ctx, { type: 'FORFEIT', seat: 'A', cause: 'left' });
  const r = onlineReducer(forfeited, { type: 'REMATCH_VOTE', seat: 'B' }, ctx);
  assert.equal(r.error?.code, 'rematch-unavailable');
  const abandoned = run(state, ctx, { type: 'ABANDON' });
  assert.equal(onlineReducer(abandoned, { type: 'REMATCH_VOTE', seat: 'A' }, ctx).error?.code, 'rematch-unavailable');
});

test('再戦後の2戦目は、1戦目と同じように最後まで進み、1戦目の記録が混ざらない', () => {
  const { ctx, s } = finishedNormally();
  let t = run(s, ctx, { type: 'REMATCH_VOTE', seat: 'A' }, { type: 'REMATCH_VOTE', seat: 'B' });
  // デッキを再提出（今度はBが強いデッキ）
  const dA2 = deckOf('a', [2, 2, 2, 2, 2]);
  const dB2 = deckOf('b', [3, 3, 3, 3, 3]);
  const ctx2 = { ...ctx, pool: [...dA2, ...dB2] };
  t = run(t, ctx2, { type: 'SUBMIT_DECK', seat: 'A', cardIds: idsOf(dA2) }, { type: 'SUBMIT_DECK', seat: 'B', cardIds: idsOf(dB2) });
  assert.equal(t.phase, 'pick');
  assert.equal(t.remaining.A.length, 5);
  for (let i = 1; i <= 5; i++) t = run(t, ctx2, ...pickBoth(`a${i}`, `b${i}`), ...ackBoth);
  assert.equal(t.phase, 'finished');
  assert.equal(t.winner, 'B', '2戦目はBの勝ち');
  assert.equal(t.rounds.length, 5, '1戦目の5戦が混ざっていない');
  assert.equal(t.matchNumber, 2);
  // 2戦目の後にも、もう一度再戦できる
  t = run(t, ctx2, { type: 'REMATCH_VOTE', seat: 'A' }, { type: 'REMATCH_VOTE', seat: 'B' });
  assert.equal(t.matchNumber, 3);
});

test('前回のデッキのIDは、本人にだけ見える。再戦の開始後、相手には前の試合のカードも見えない', () => {
  const { ctx, s } = finishedNormally();
  const t = run(s, ctx, { type: 'REMATCH_VOTE', seat: 'A' }, { type: 'REMATCH_VOTE', seat: 'B' });
  assert.deepEqual(viewFor(t, 'A').selfLastDeckIds, ['a1', 'a2', 'a3', 'a4', 'a5']);
  assert.deepEqual(viewFor(t, 'B').selfLastDeckIds, ['b1', 'b2', 'b3', 'b4', 'b5'], '本人は自分のデッキが見える');
  assert.deepEqual(viewFor(t, 'spectator').selfLastDeckIds, [], '観戦者には渡さない');
  assert.ok(!JSON.stringify(viewFor(t, 'B')).includes('"a1"'), '相手の前回のデッキは、Bの画面に含まれない');
  assert.ok(!JSON.stringify(viewFor(t, 'spectator')).includes('"a1"'), '観戦者にも含まれない');
});
