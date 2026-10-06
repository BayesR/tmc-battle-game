import test from 'node:test';
import assert from 'node:assert/strict';
import { PULL_UP_MS, isPullingUp, layoutBoard } from '../src/online/pullUp';
import { compareCards } from '../src/logic/compareCards';
import { toDeckCard } from '../src/types/card';
import type { RoundRecord } from '../src/types/game';
import { mkCard } from './helpers';

const card = (id: string, mp: number, seat: string) => ({ ...mkCard(id, mp), instanceId: `${seat}:${id}` });
const record = (i: number, a: number, b: number): RoundRecord => {
  const selfCard = card(`a${i}`, a, 'A');
  const enemyCard = card(`b${i}`, b, 'B');
  return { roundIndex: i, selfCard, enemyCard, result: compareCards(selfCard, enemyCard) };
};
const HIDDEN = { ...toDeckCard(mkCard('hidden', 0)), instanceId: 'hidden' };

test('演出の時間は、短すぎず長すぎない（1〜3秒）', () => {
  assert.ok(PULL_UP_MS >= 1000 && PULL_UP_MS <= 3000, String(PULL_UP_MS));
});

test('演出中になるのは「公開フェーズで、まだ表示し終えていないラウンドがある」時だけ', () => {
  assert.equal(isPullingUp('reveal', 1, 0), true, '新しいラウンドが公開された');
  assert.equal(isPullingUp('reveal', 3, 2), true);
  assert.equal(isPullingUp('reveal', 1, 1), false, '表示し終えた（または、リロードで最初から公開済み）');
  assert.equal(isPullingUp('pick', 1, 0), false, '選択中は演出しない');
  assert.equal(isPullingUp('deck', 0, 0), false);
  assert.equal(isPullingUp('finished', 5, 4), false, '終了画面は演出しない');
  assert.equal(isPullingUp('lobby', 0, 0), false);
});

test('演出中：直近のラウンドは、盤面に置かず「両者裏向きの待機カード」にする（まだ表にしない）', () => {
  const board = [record(0, 3, 2), record(1, 2, 3)];
  const l = layoutBoard({ phase: 'reveal', board, pulling: true, selfPendingCard: undefined, locked: false, hiddenCard: HIDDEN });
  assert.equal(l.board.length, 1, '直近のラウンドは盤面から外れる');
  assert.equal(l.revealIndex, -1, '表向きで公開するカードはまだ無い');
  assert.equal(l.pendingCards?.selfCard.id, 'a1');
  assert.equal(l.pendingCards?.enemyCard.id, 'b1', '相手の実際のカードが、裏向きのまま置かれる');
});

test('演出後：直近のラウンドを、両者表向きで公開する', () => {
  const board = [record(0, 3, 2), record(1, 2, 3)];
  const l = layoutBoard({ phase: 'reveal', board, pulling: false, selfPendingCard: undefined, locked: false, hiddenCard: HIDDEN });
  assert.equal(l.board.length, 2);
  assert.equal(l.revealIndex, 1);
  assert.equal(l.pendingCards, null);
});

test('選択中（未確定）：選んだカードを裏向きで置き、「決定」を出す状態になる。選び直すと入れ替わる', () => {
  const board = [record(0, 3, 2)];
  const first = card('a8', 3, 'A');
  const second = card('a9', 2, 'A');
  const l1 = layoutBoard({ phase: 'pick', board, pulling: false, selfPendingCard: first, locked: false, hiddenCard: HIDDEN });
  assert.equal(l1.pendingKind, 'selecting');
  assert.equal(l1.pendingCards?.selfCard.id, 'a8');
  assert.equal(l1.pendingCards?.enemyCard.id, 'hidden', '相手の選択の中身は使わない（ダミー）');
  assert.equal(l1.revealIndex, -1);
  assert.equal(l1.board.length, 1);

  const l2 = layoutBoard({ phase: 'pick', board, pulling: false, selfPendingCard: second, locked: false, hiddenCard: HIDDEN });
  assert.equal(l2.pendingKind, 'selecting', '選び直しても、まだ確定していない');
  assert.equal(l2.pendingCards?.selfCard.id, 'a9', '盤面の裏向きのカードが入れ替わる');
});

test('確定済み：「決定」は出さず（pendingKind が locked）、確定したカードを裏向きで置く', () => {
  const board = [record(0, 3, 2)];
  const mine = card('a9', 3, 'A');
  const l = layoutBoard({ phase: 'pick', board, pulling: false, selfPendingCard: mine, locked: true, hiddenCard: HIDDEN });
  assert.equal(l.pendingKind, 'locked');
  assert.equal(l.pendingCards?.selfCard.id, 'a9');
});

test('何も選んでいなければ、何も置かない。公開中・演出中の種類も正しい', () => {
  const board = [record(0, 3, 2)];
  const none = layoutBoard({ phase: 'pick', board, pulling: false, selfPendingCard: undefined, locked: false, hiddenCard: HIDDEN });
  assert.equal(none.pendingCards, null);
  assert.equal(none.pendingKind, null);
  assert.equal(none.revealIndex, -1);

  const revealed = layoutBoard({ phase: 'reveal', board, pulling: false, selfPendingCard: undefined, locked: false, hiddenCard: HIDDEN });
  assert.equal(revealed.pendingKind, null, '公開中は「決定」を出さない');
  const pulling = layoutBoard({ phase: 'reveal', board, pulling: true, selfPendingCard: undefined, locked: false, hiddenCard: HIDDEN });
  assert.equal(pulling.pendingKind, 'pulling');
  // 公開フェーズでは、選択中のカードがあっても「決定」を出さない（選択はもう終わっている）
  const stale = layoutBoard({ phase: 'reveal', board, pulling: false, selfPendingCard: card('a7', 3, 'A'), locked: false, hiddenCard: HIDDEN });
  assert.equal(stale.pendingKind, null);
});

test('盤面が空でも、演出中の判定で例外にならない', () => {
  const l = layoutBoard({ phase: 'reveal', board: [], pulling: true, selfPendingCard: undefined, locked: false, hiddenCard: HIDDEN });
  assert.equal(l.board.length, 0);
  assert.equal(l.pendingCards, null);
});
