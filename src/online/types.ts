import type { DeckCard } from '../types/card';
import type { RoundRecord, RoundWinner } from '../types/game';

/**
 * オンライン対戦（フレンド対戦）の共通型
 * ------------------------------------------------------------------
 * src/online 配下は「画面・通信・時間・乱数」に依存しない純粋なコードだけで構成する。
 * ブラウザ（クライアント）でもサーバー（PartyKit）でも同じコードをそのまま動かすため、
 * DOM / localStorage / Node 専用APIは使わないこと。
 */

/** 対戦の席。席Aが「self」、席Bが「enemy」として RoundRecord に記録される */
export type Seat = 'A' | 'B';
export const SEATS: readonly Seat[] = ['A', 'B'];
export const otherSeat = (seat: Seat): Seat => (seat === 'A' ? 'B' : 'A');

export type OnlinePhase =
  | 'lobby' // 2人が揃うのを待っている
  | 'deck' // 2人がデッキを提出するのを待っている
  | 'pick' // 2人が、このラウンドで出すカードを選んでいる（相手の選択は見えない）
  | 'reveal' // 2人の選択が揃い、結果を公開した直後（次へ進むのを待っている）
  | 'finished';

export type EndReason =
  | 'normal' // 通常の決着（5戦＋サドンデス）
  | 'forfeit' // 不戦敗（退出・切断・時間切れ）
  | 'abandoned'; // 勝者なし（相手が来なかった等）

export type ForfeitCause =
  | 'left' // 自分から退出した
  | 'disconnect' // 切断後の猶予時間が過ぎた
  | 'deck-timeout'; // デッキ構築の制限時間が過ぎた

export interface OnlinePlayer {
  name: string;
}

/** サーバーが持つ「正」の試合状態（全情報を含む。クライアントには viewFor() で絞った内容だけを渡す） */
export interface OnlineMatchState {
  phase: OnlinePhase;
  players: Record<Seat, OnlinePlayer | null>;

  /** 提出済みデッキ（5枚、提出された順）。未提出なら空 */
  hands: Record<Seat, DeckCard[]>;
  deckSubmitted: Record<Seat, boolean>;
  /** 現在の周回で、まだ場に出していないカード */
  remaining: Record<Seat, DeckCard[]>;
  /** このラウンドで選択を確定したカードの instanceId（公開されるまで相手・観戦者には渡さない） */
  picks: Record<Seat, string | null>;
  /** 公開後の「次へ」を押した席 */
  revealAcks: Record<Seat, boolean>;

  /** 勝敗記録。席Aを 'self'、席Bを 'enemy' として記録する */
  rounds: RoundRecord[];
  suddenDeathRounds: RoundRecord[];
  board: RoundRecord[];
  lastRound: RoundRecord | null;
  isSuddenDeath: boolean;

  winner: Seat | null;
  endReason: EndReason | null;
  forfeitedBy: Seat | null;

  /** 再戦を希望した席（両者が揃うと、同じ2人でデッキ構築からやり直す） */
  rematchVotes: Record<Seat, boolean>;
  /** 何戦目か（最初の対戦が1。再戦のたびに増える） */
  matchNumber: number;
  /** 各席が最後に提出したデッキのカードID。再戦のデッキ構築で、前回のデッキを入れた状態から始めるために保持する */
  lastDeckIds: Record<Seat, string[]>;
}

/**
 * クライアント（プレイヤー本人／観戦者）に渡す状態。
 * - 本人の視点に変換済み：'self' = 見ている本人、'enemy' = 相手。既存の対戦画面の部品をそのまま再利用できる
 * - 隠すべき情報（相手の手札・未公開の選択）は一切含めない
 * - 観戦者は席Aを 'self' として見る（hidden な本人情報が無いので selfRemaining 等は空）
 */
export interface OnlineView {
  phase: OnlinePhase;
  viewer: Seat | 'spectator';
  /** 'self' として表示している席 */
  perspective: Seat;

  selfPlayer: OnlinePlayer | null;
  enemyPlayer: OnlinePlayer | null;
  selfDeckSubmitted: boolean;
  enemyDeckSubmitted: boolean;

  /** 本人の残りカード（プレイヤー本人のみ。観戦者は常に空） */
  selfRemaining: DeckCard[];
  selfRemainingCount: number;
  enemyRemainingCount: number;
  /** 本人が選択を確定したカード（プレイヤー本人のみ） */
  selfPickId: string | null;
  /** 「選択済みか」の事実だけは公開する（中身は公開しない） */
  selfHasPicked: boolean;
  enemyHasPicked: boolean;
  selfHasAcked: boolean;
  enemyHasAcked: boolean;

  rounds: RoundRecord[];
  suddenDeathRounds: RoundRecord[];
  board: RoundRecord[];
  lastRound: RoundRecord | null;
  isSuddenDeath: boolean;

  /** 勝者（視点席から見て 'self' / 'enemy'）。決着前・勝者なしは null */
  matchWinner: RoundWinner | null;
  endReason: EndReason | null;
  /** 不戦敗になった側（視点席から見て） */
  forfeitedBy: 'self' | 'enemy' | null;

  rematchSelfVoted: boolean;
  rematchEnemyVoted: boolean;
  /** 何戦目か（最初の対戦が1） */
  matchNumber: number;
  /** 本人が最後に提出したデッキのカードID（プレイヤー本人のみ。相手や観戦者には渡さない） */
  selfLastDeckIds: string[];
}
