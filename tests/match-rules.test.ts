import test from 'node:test';
import assert from 'node:assert/strict';
import { NORMAL_ROUND_COUNT, decideAfterReveal, tallyWins } from '../src/logic/matchRules';
import type { RoundWinner } from '../src/types/game';

const rounds = (...winners: RoundWinner[]) => winners.map((winner) => ({ result: { winner } as never }));

test('tallyWins: 勝ち・負け・引き分けを数える', () => {
  assert.deepEqual(tallyWins(rounds('self', 'enemy', 'draw', 'self', 'self')), { self: 3, enemy: 1, draw: 1 });
  assert.deepEqual(tallyWins([]), { self: 0, enemy: 0, draw: 0 });
});

test('通常戦：5戦未満なら、何勝していても次のラウンドへ進む（途中で打ち切らない）', () => {
  for (let n = 1; n < NORMAL_ROUND_COUNT; n++) {
    const decision = decideAfterReveal({
      isSuddenDeath: false,
      normalRounds: rounds(...Array<RoundWinner>(n).fill('self')), // 全勝でも続行
      lastRoundWinner: 'self',
      selfRemainingCount: NORMAL_ROUND_COUNT - n,
      enemyRemainingCount: NORMAL_ROUND_COUNT - n,
    });
    assert.deepEqual(decision, { kind: 'next-round' }, `${n}戦終了時点`);
  }
});

test('通常戦：5戦終了で勝ち数が多い方の勝ち', () => {
  const base = { isSuddenDeath: false, lastRoundWinner: null, selfRemainingCount: 0, enemyRemainingCount: 0 } as const;
  assert.deepEqual(
    decideAfterReveal({ ...base, normalRounds: rounds('self', 'self', 'self', 'enemy', 'enemy') }),
    { kind: 'match-over', winner: 'self' }
  );
  assert.deepEqual(
    decideAfterReveal({ ...base, normalRounds: rounds('enemy', 'draw', 'enemy', 'self', 'draw') }),
    { kind: 'match-over', winner: 'enemy' }
  );
  // 引き分けが多くても、勝ち数に差があれば決着
  assert.deepEqual(
    decideAfterReveal({ ...base, normalRounds: rounds('self', 'draw', 'draw', 'draw', 'draw') }),
    { kind: 'match-over', winner: 'self' }
  );
});

test('通常戦：5戦終了で勝ち数が同数ならサドンデスに突入する', () => {
  const base = { isSuddenDeath: false, lastRoundWinner: null, selfRemainingCount: 0, enemyRemainingCount: 0 } as const;
  assert.deepEqual(
    decideAfterReveal({ ...base, normalRounds: rounds('self', 'enemy', 'draw', 'draw', 'draw') }),
    { kind: 'start-sudden-death' }
  );
  assert.deepEqual(
    decideAfterReveal({ ...base, normalRounds: rounds('draw', 'draw', 'draw', 'draw', 'draw') }),
    { kind: 'start-sudden-death' }
  );
});

test('サドンデス：最初に1勝を取った側が試合全体の勝ち', () => {
  const base = { isSuddenDeath: true, normalRounds: rounds('draw', 'draw', 'draw', 'draw', 'draw'), selfRemainingCount: 3, enemyRemainingCount: 3 };
  assert.deepEqual(decideAfterReveal({ ...base, lastRoundWinner: 'self' }), { kind: 'match-over', winner: 'self' });
  assert.deepEqual(decideAfterReveal({ ...base, lastRoundWinner: 'enemy' }), { kind: 'match-over', winner: 'enemy' });
});

test('サドンデス：引き分けなら、カードが残っている間は続行し、使い切ったらもう一度サドンデス', () => {
  const base = { isSuddenDeath: true, normalRounds: rounds('draw', 'draw', 'draw', 'draw', 'draw'), lastRoundWinner: 'draw' as const };
  assert.deepEqual(decideAfterReveal({ ...base, selfRemainingCount: 4, enemyRemainingCount: 4 }), { kind: 'next-round' });
  assert.deepEqual(decideAfterReveal({ ...base, selfRemainingCount: 1, enemyRemainingCount: 1 }), { kind: 'next-round' });
  assert.deepEqual(decideAfterReveal({ ...base, selfRemainingCount: 0, enemyRemainingCount: 0 }), { kind: 'restart-sudden-death' });
});
