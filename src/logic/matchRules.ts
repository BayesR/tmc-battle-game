import type { RoundRecord, RoundWinner } from '../types/game';

/**
 * 試合の進行ルール（NPC対戦・オンライン対戦で共通）
 * ------------------------------------------------------------------
 * 「1ラウンドの結果を公開した後、試合がどう進むか」だけを判断する純粋関数。
 * 画面・通信・乱数・時間には一切依存しないので、ブラウザでもサーバーでも同じコードが動く。
 *
 * ルール（本家準拠）：
 *   - 通常は5戦する。勝敗が確定しても最後まで続ける（途中で打ち切らない）
 *   - 5戦終了時に勝ち数が多い方の勝ち
 *   - 勝ち数が同数ならサドンデス：同じ5枚の手札に戻して再戦し、最初に1勝を取った側が試合全体の勝ち
 *   - サドンデスの1周（5枚）を使い切ってもなお全て引き分けなら、同じ手札でもう一度サドンデス
 *
 * 視点：'self' / 'enemy' は、勝敗記録を持つ側から見た呼び方。
 * オンライン対戦では席Aを 'self'、席Bを 'enemy' として記録する。
 */

/** 通常の対戦で行うラウンド数 */
export const NORMAL_ROUND_COUNT = 5;

export interface WinTally {
  self: number;
  enemy: number;
  draw: number;
}

export function tallyWins(rounds: ReadonlyArray<Pick<RoundRecord, 'result'>>): WinTally {
  return rounds.reduce<WinTally>(
    (acc, r) => {
      if (r.result.winner === 'self') acc.self += 1;
      else if (r.result.winner === 'enemy') acc.enemy += 1;
      else acc.draw += 1;
      return acc;
    },
    { self: 0, enemy: 0, draw: 0 }
  );
}

export type SeriesDecision =
  /** 同じ周回の次のラウンド（カード選択）へ進む */
  | { kind: 'next-round' }
  /** 試合終了 */
  | { kind: 'match-over'; winner: RoundWinner }
  /** 5戦が同数：サドンデスに突入する（手札を5枚に戻し、盤面をクリアする） */
  | { kind: 'start-sudden-death' }
  /** サドンデス1周が全て引き分け：手札を戻してもう一度サドンデス */
  | { kind: 'restart-sudden-death' };

export interface SeriesProgress {
  isSuddenDeath: boolean;
  /** 通常5戦の記録（サドンデス中も、通常戦の記録そのものを渡す） */
  normalRounds: ReadonlyArray<Pick<RoundRecord, 'result'>>;
  /** 直前に公開したラウンドの勝者（まだ1戦も公開していなければ null） */
  lastRoundWinner: RoundWinner | null;
  /** 現在の周回で、まだ場に出していない残りカード枚数 */
  selfRemainingCount: number;
  enemyRemainingCount: number;
}

/** ラウンド公開後（NEXT）に、試合をどう進めるかを決める */
export function decideAfterReveal(p: SeriesProgress): SeriesDecision {
  if (p.isSuddenDeath) {
    // サドンデス：決着がついていればその時点で試合終了
    if (p.lastRoundWinner !== null && p.lastRoundWinner !== 'draw') {
      return { kind: 'match-over', winner: p.lastRoundWinner };
    }
    // まだ決着していない：この周回のカードが残っていれば続行
    if (p.selfRemainingCount > 0 && p.enemyRemainingCount > 0) {
      return { kind: 'next-round' };
    }
    // 1周使い切ってなお全て引き分け：同じ手札でもう一度サドンデス
    return { kind: 'restart-sudden-death' };
  }

  // 通常5戦の途中
  if (p.normalRounds.length < NORMAL_ROUND_COUNT) {
    return { kind: 'next-round' };
  }

  // 5戦終了 → 勝ち数を集計
  const tally = tallyWins(p.normalRounds);
  if (tally.self !== tally.enemy) {
    return { kind: 'match-over', winner: tally.self > tally.enemy ? 'self' : 'enemy' };
  }
  return { kind: 'start-sudden-death' };
}
