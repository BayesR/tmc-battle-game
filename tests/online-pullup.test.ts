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
  const l = layoutBoard({ phase: 'reveal', board, pulling: true, lockedCard: undefined, hiddenCard: HIDDEN });
  assert.equal(l.board.length, 1, '直近のラウンドは盤面から外れる');
  assert.equal(l.revealIndex, -1, '表向きで公開するカードはまだ無い');
  assert.equal(l.pendingCards?.selfCard.id, 'a1');
  assert.equal(l.pendingCards?.enemyCard.id, 'b1', '相手の実際のカードが、裏向きのまま置かれる');
});

test('演出後：直近のラウンドを、両者表向きで公開する', () => {
  const board = [record(0, 3, 2), record(1, 2, 3)];
  const l = layoutBoard({ phase: 'reveal', board, pulling: false, lockedCard: undefined, hiddenCard: HIDDEN });
  assert.equal(l.board.length, 2);
  assert.equal(l.revealIndex, 1);
  assert.equal(l.pendingCards, null);
});

test('自分だけ決定済み：自分のカードと、相手の裏向きダミーを置く。未決定なら何も置かない', () => {
  const board = [record(0, 3, 2)];
  const mine = card('a9', 3, 'A');
  const waiting = layoutBoard({ phase: 'pick', board, pulling: false, lockedCard: mine, hiddenCard: HIDDEN });
  assert.equal(waiting.pendingCards?.selfCard.id, 'a9');
  assert.equal(waiting.pendingCards?.enemyCard.id, 'hidden', '相手の選択の中身は使わない（ダミー）');
  assert.equal(waiting.revealIndex, -1);
  assert.equal(waiting.board.length, 1);

  const none = layoutBoard({ phase: 'pick', board, pulling: false, lockedCard: undefined, hiddenCard: HIDDEN });
  assert.equal(none.pendingCards, null);
  assert.equal(none.revealIndex, -1);
});

test('盤面が空でも、演出中の判定で例外にならない', () => {
  const l = layoutBoard({ phase: 'reveal', board: [], pulling: true, lockedCard: undefined, hiddenCard: HIDDEN });
  assert.equal(l.board.length, 0);
  assert.equal(l.pendingCards, null);
});
