import type { DeckCard } from '../types/card';
import type { RoundRecord } from '../types/game';
import type { OnlinePhase } from './types';

/**
 * 「PULL UP」演出（両者が決定した瞬間に、制限時間が止まり、両者のカードが表になる）の判断部分
 * ------------------------------------------------------------------
 * サーバーは両者の選択が揃った瞬間に判定して、結果を一度に送る。演出はすべて画面側の見せ方で、
 * 届いた結果の表示を少しだけ遅らせる（結果は既に画面の手元にあるので、情報が漏れるわけではない）。
 *
 *   1. 両者が決定 → 制限時間の表示を止め、両者のカードを「裏向き」で盤面に置き、「PULL UP!」を出す（PULL_UP_MS）
 *   2. その後、両者のカードを表にする（雷・Root Counterの光などの演出もここで出る）
 *   3. 演出が終わってから、勝敗バナーを出す
 *
 * リロードや再接続で、すでに公開済みの状態から表示を始めた場合は、演出を飛ばして公開済みとして表示する。
 */

/** 両者のカードを裏向きで見せている時間（ミリ秒） */
export const PULL_UP_MS = 1500;

/** 今、「両者決定 → 公開前」の演出中か。revealedCount は、公開まで表示し終えたラウンド数 */
export function isPullingUp(phase: OnlinePhase, roundCount: number, revealedCount: number): boolean {
  return phase === 'reveal' && roundCount > revealedCount;
}

export interface BoardLayout {
  /** 盤面に置く、結果が確定済みのラウンド */
  board: RoundRecord[];
  /** 裏向きで次の枠に置くカード（選択済み・公開前） */
  pendingCards: { selfCard: DeckCard; enemyCard: DeckCard } | null;
  /** 表向きで公開中のラウンドの位置（なければ -1） */
  revealIndex: number;
}

export function layoutBoard(args: {
  phase: OnlinePhase;
  board: RoundRecord[];
  pulling: boolean;
  /** 自分が選択を確定したカード（相手の決定待ちの間） */
  lockedCard: DeckCard | undefined;
  /** 相手の未公開のカードの代わりに置く、裏向き専用のダミー */
  hiddenCard: DeckCard;
}): BoardLayout {
  const { phase, board, pulling, lockedCard, hiddenCard } = args;

  // 演出中：直近のラウンドを、まだ表にせず、両者とも裏向きで置く
  if (pulling && board.length > 0) {
    const last = board[board.length - 1];
    return { board: board.slice(0, -1), pendingCards: { selfCard: last.selfCard, enemyCard: last.enemyCard }, revealIndex: -1 };
  }
  // 公開中：直近のラウンドを、両者とも表向きで見せる
  if (phase === 'reveal') {
    return { board, pendingCards: null, revealIndex: board.length - 1 };
  }
  // 自分だけ決定済み：自分のカードを裏向きで置き、相手のカードは裏向きのダミーを置く
  if (phase === 'pick' && lockedCard) {
    return { board, pendingCards: { selfCard: lockedCard, enemyCard: hiddenCard }, revealIndex: -1 };
  }
  return { board, pendingCards: null, revealIndex: -1 };
}
