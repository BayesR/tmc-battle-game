import type { RoundRecord, RoundWinner } from '../types/game';

export type RoundEffect = 'lightning' | 'rootGlow' | 'claw' | null;

export interface RoundEffects {
  self: RoundEffect;
  enemy: RoundEffect;
}

/**
 * 1ラウンドの結果から、対戦演出（雷／Root Counterの光／切り裂き爪）を判定する。
 * 演出は「そのラウンドが公開されている間だけ」表示され、NEXTを押すと消える（一度きりの演出）。
 * NPC対戦モード・バトルストリートの両方で共通のBattleBoard/CardViewを使うため、
 * ここで判定した結果をそのまま両モードに適用できる。
 *
 *   雷：試合途中（5戦のうち5戦目より前）に、いずれかの側が3勝目を挙げて勝敗が確定した瞬間
 *   Root Counterの光：Root Counterが発動した側のカード
 *   切り裂き爪：Root Counter以外の通常比較で、Monster Pride 5のカードが負けた場合
 * （Root Counterが発動した場合は光の演出を優先し、爪の演出とは重複させない）
 */
export function computeRoundEffects(board: RoundRecord[], revealIndex: number): RoundEffects {
  const effects: RoundEffects = { self: null, enemy: null };
  if (revealIndex < 0 || !board[revealIndex]) return effects;

  const record = board[revealIndex];
  const { winner, rootCounter, rootCounterSide } = record.result;

  if (rootCounter && rootCounterSide) {
    effects[rootCounterSide] = 'rootGlow';
  } else if (winner !== 'draw') {
    const loserSide: RoundWinner = winner === 'self' ? 'enemy' : 'self';
    const loserCard = loserSide === 'self' ? record.selfCard : record.enemyCard;
    if (loserCard.monsterPride === 5) {
      effects[loserSide as 'self' | 'enemy'] = 'claw';
    }
  }

  if (winner !== 'draw') {
    let winCount = 0;
    for (let i = 0; i <= revealIndex; i++) {
      if (board[i] && board[i].result.winner === winner) winCount++;
    }
    const roundsPlayedSoFar = revealIndex + 1;
    const key = winner as 'self' | 'enemy';
    if (winCount === 3 && roundsPlayedSoFar < 5 && !effects[key]) {
      effects[key] = 'lightning';
    }
  }

  return effects;
}
