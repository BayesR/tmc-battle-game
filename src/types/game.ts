import type { DeckCard, NpcLevel } from './card';

/** 1枚対1枚の勝敗判定結果（既存シミュレーターの compareCards と同じ形） */
export type RoundWinner = 'self' | 'enemy' | 'draw';

export interface CompareResult {
  winner: RoundWinner;
  selfPower: number;
  enemyPower: number;
  /** Root Counter（①が⑤に必ず勝つ）が発動したか */
  rootCounter: boolean;
  rootCounterSide?: 'self' | 'enemy';
  /** 自分のVoidで「相手のPP加算」を無効化したか */
  selfVoidNullifiedEnemyBonus: boolean;
  /** 相手のVoidで「自分のPP加算」を無効化されたか */
  enemyVoidNullifiedSelfBonus: boolean;
}

/** 1ラウンドの記録（デッキ構築画面・対戦画面・結果画面で共通利用） */
export interface RoundRecord {
  roundIndex: number;
  selfCard: DeckCard;
  enemyCard: DeckCard;
  result: CompareResult;
}

/** 対戦画面のフェーズ */
export type BattlePhase =
  | 'select' // 自分の手札からカードを選ぶ
  | 'ready' // カードを選び終えて Pull up 待ち
  | 'reveal' // 勝敗が決まり結果表示中
  | 'match-over'; // 5戦（＋サドンデス）が終了

export interface NpcProfile {
  name: string;
  level: NpcLevel;
  /** Phase 2以降：'random'（今は常にrandom）｜ 'loose' | 'clever' | 'aggressive' */
  personality: 'random';
}

/** 対戦全体（5戦＋必要ならサドンデス）の状態 */
export interface MatchState {
  phase: BattlePhase;
  npc: NpcProfile;

  /** 通常5戦で使う固定の手札（サドンデスでもこの5枚に戻す） */
  selfHand: DeckCard[];
  enemyHand: DeckCard[];

  /** まだ場に出していない残りカード（現在のセット内） */
  selfRemaining: DeckCard[];
  enemyRemaining: DeckCard[];

  /** 通常5戦の結果 */
  rounds: RoundRecord[];
  /** サドンデスに入った場合の結果（複数セットに跨る可能性があるのでフラット配列） */
  suddenDeathRounds: RoundRecord[];
  /** 盤面に出ているカード（サドンデス突入・やり直しのタイミングで手札に戻る＝空になる） */
  board: RoundRecord[];

  isSuddenDeath: boolean;
  /** 現在選択中の自分のカード（Pull up前） */
  selectedSelfCardId: string | null;
  /** カード選択時に裏向きで盤面に置いておく相手カード（Pull upで公開される） */
  pendingEnemyCard: DeckCard | null;
  /** 直近ラウンドの結果（reveal表示用） */
  lastRound: RoundRecord | null;

  matchWinner: RoundWinner | null;
}
