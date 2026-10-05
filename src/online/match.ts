import type { CardMaster, DeckCard } from '../types/card';
import type { CompareResult, RoundRecord, RoundWinner } from '../types/game';
import { compareCards } from '../logic/compareCards';
import { decideAfterReveal } from '../logic/matchRules';
import { validateOnlineDeck } from './deck';
import { MAX_NAME_LENGTH } from './constants';
import {
  SEATS,
  otherSeat,
  type ForfeitCause,
  type OnlineMatchState,
  type OnlinePlayer,
  type OnlineView,
  type Seat,
} from './types';

/**
 * オンライン対戦の試合ロジック（サーバーが持つ「正」の状態を更新する純粋なリデューサー）
 * ------------------------------------------------------------------
 * - 時間（制限時間・切断猶予）は扱わない。時間切れは、サーバー側の仕組み（タイマー）が
 *   TIMEOUT_PICK / TIMEOUT_REVEAL / FORFEIT などのアクションとして投入する
 * - 乱数は ctx.rng を使う（本番は Math.random、テストでは固定の乱数列）
 * - 不正な操作（順番違い・他人のカード・提出済みの再提出など）は状態を変えずにエラーを返す
 */

export type OnlineAction =
  /** 席に着く（ロビー） */
  | { type: 'SEAT'; seat: Seat; name: string }
  /** デッキを提出する（カードIDだけを受け取り、実体はサーバーのカードプールから引く） */
  | { type: 'SUBMIT_DECK'; seat: Seat; cardIds: unknown }
  /** このラウンドで出すカードを確定する（確定後は変更不可） */
  | { type: 'PICK'; seat: Seat; instanceId: unknown }
  /** 選択の制限時間切れ：未選択の席は、残りカードからランダムに自動選択する */
  | { type: 'TIMEOUT_PICK' }
  /** 公開後に「次へ」を押した */
  | { type: 'ACK_REVEAL'; seat: Seat }
  /** 公開後、一定時間が経過したので両者の確認を待たずに次へ進む */
  | { type: 'TIMEOUT_REVEAL' }
  /** 不戦敗（退出・切断猶予切れ・デッキ構築の時間切れ） */
  | { type: 'FORFEIT'; seat: Seat; cause: ForfeitCause }
  /** 勝者なしで終了する（両者がいなくなった等） */
  | { type: 'ABANDON' };

export type OnlineErrorCode =
  | 'wrong-phase'
  | 'seat-taken'
  | 'already-submitted'
  | 'invalid-deck'
  | 'already-picked'
  | 'invalid-card';

export interface OnlineError {
  code: OnlineErrorCode;
  message: string;
}

export interface OnlineContext {
  /** サーバーが持つカードプール全体（デッキ検証・カード実体の取得に使う） */
  pool: readonly CardMaster[];
  /** 0以上1未満の乱数 */
  rng: () => number;
}

export interface ReduceResult {
  state: OnlineMatchState;
  /** 受理できなかった場合のみ入る。その場合 state は入力と同一（変更なし） */
  error: OnlineError | null;
}

export function createInitialOnlineState(): OnlineMatchState {
  return {
    phase: 'lobby',
    players: { A: null, B: null },
    hands: { A: [], B: [] },
    deckSubmitted: { A: false, B: false },
    remaining: { A: [], B: [] },
    picks: { A: null, B: null },
    revealAcks: { A: false, B: false },
    rounds: [],
    suddenDeathRounds: [],
    board: [],
    lastRound: null,
    isSuddenDeath: false,
    winner: null,
    endReason: null,
    forfeitedBy: null,
  };
}

/** 表示名を整える（制御文字の除去・前後の空白除去・文字数制限）。空になる場合は fallback を返す */
export function sanitizeDisplayName(raw: unknown, fallback = 'ジャナー'): string {
  if (typeof raw !== 'string') return fallback;
  // eslint-disable-next-line no-control-regex
  const cleaned = raw.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2066-\u2069]/g, '').trim();
  const limited = Array.from(cleaned).slice(0, MAX_NAME_LENGTH).join('');
  return limited.length > 0 ? limited : fallback;
}

/** 対戦中のカード個体を識別するID。席とカードIDから決まる（同じデッキに同じカードは入らないので一意） */
export function makeInstanceId(seat: Seat, cardId: string): string {
  return `${seat}:${cardId}`;
}

const reject = (state: OnlineMatchState, code: OnlineErrorCode, message: string): ReduceResult => ({
  state,
  error: { code, message },
});
const accept = (state: OnlineMatchState): ReduceResult => ({ state, error: null });

function bothTrue(r: Record<Seat, boolean>): boolean {
  return r.A && r.B;
}

/** 両者の選択が揃った時点で、判定して結果を公開する */
function resolveRound(state: OnlineMatchState): OnlineMatchState {
  const cardA = state.remaining.A.find((c) => c.instanceId === state.picks.A);
  const cardB = state.remaining.B.find((c) => c.instanceId === state.picks.B);
  if (!cardA || !cardB) return state; // 呼び出し側で両者の選択が有効なことを保証している

  const result = compareCards(cardA, cardB); // 席Aが 'self'
  const roundIndex = state.isSuddenDeath ? state.suddenDeathRounds.length : state.rounds.length;
  const record: RoundRecord = { roundIndex, selfCard: cardA, enemyCard: cardB, result };

  return {
    ...state,
    phase: 'reveal',
    remaining: {
      A: state.remaining.A.filter((c) => c.instanceId !== cardA.instanceId),
      B: state.remaining.B.filter((c) => c.instanceId !== cardB.instanceId),
    },
    picks: { A: null, B: null },
    revealAcks: { A: false, B: false },
    rounds: state.isSuddenDeath ? state.rounds : [...state.rounds, record],
    suddenDeathRounds: state.isSuddenDeath ? [...state.suddenDeathRounds, record] : state.suddenDeathRounds,
    board: [...state.board, record],
    lastRound: record,
  };
}

const seatOfWinner = (w: RoundWinner): Seat | null => (w === 'self' ? 'A' : w === 'enemy' ? 'B' : null);

/** 公開後の「次へ」：共通の進行ルール（matchRules）に従って、次のラウンド／サドンデス／終了へ進む */
function advanceAfterReveal(state: OnlineMatchState): OnlineMatchState {
  const decision = decideAfterReveal({
    isSuddenDeath: state.isSuddenDeath,
    normalRounds: state.rounds,
    lastRoundWinner: state.lastRound ? state.lastRound.result.winner : null,
    selfRemainingCount: state.remaining.A.length,
    enemyRemainingCount: state.remaining.B.length,
  });

  switch (decision.kind) {
    case 'match-over':
      return {
        ...state,
        phase: 'finished',
        winner: seatOfWinner(decision.winner),
        endReason: 'normal',
        revealAcks: { A: false, B: false },
      };
    case 'next-round':
      return { ...state, phase: 'pick', revealAcks: { A: false, B: false } };
    case 'start-sudden-death':
      return {
        ...state,
        isSuddenDeath: true,
        phase: 'pick',
        remaining: { A: [...state.hands.A], B: [...state.hands.B] },
        board: [],
        revealAcks: { A: false, B: false },
      };
    case 'restart-sudden-death':
      return {
        ...state,
        phase: 'pick',
        remaining: { A: [...state.hands.A], B: [...state.hands.B] },
        board: [],
        revealAcks: { A: false, B: false },
      };
  }
}

export function onlineReducer(state: OnlineMatchState, action: OnlineAction, ctx: OnlineContext): ReduceResult {
  switch (action.type) {
    case 'SEAT': {
      if (state.phase !== 'lobby') return reject(state, 'wrong-phase', '対戦はすでに始まっています');
      if (state.players[action.seat]) return reject(state, 'seat-taken', 'その席にはすでに参加者がいます');
      const players = {
        ...state.players,
        [action.seat]: { name: sanitizeDisplayName(action.name) } as OnlinePlayer,
      } as Record<Seat, OnlinePlayer | null>;
      const full = players.A !== null && players.B !== null;
      return accept({ ...state, players, phase: full ? 'deck' : 'lobby' });
    }

    case 'SUBMIT_DECK': {
      if (state.phase !== 'deck') return reject(state, 'wrong-phase', '今はデッキを提出できません');
      if (state.deckSubmitted[action.seat]) return reject(state, 'already-submitted', 'デッキはすでに提出済みです');

      const checked = validateOnlineDeck(action.cardIds, ctx.pool);
      if (!checked.ok) return reject(state, 'invalid-deck', checked.errors.join(' / '));

      const hand: DeckCard[] = checked.cards.map((c) => ({ ...c, instanceId: makeInstanceId(action.seat, c.id) }));
      const hands = { ...state.hands, [action.seat]: hand };
      const deckSubmitted = { ...state.deckSubmitted, [action.seat]: true };
      const remaining = { ...state.remaining, [action.seat]: [...hand] };
      const ready = bothTrue(deckSubmitted);
      return accept({ ...state, hands, deckSubmitted, remaining, phase: ready ? 'pick' : 'deck' });
    }

    case 'PICK': {
      if (state.phase !== 'pick') return reject(state, 'wrong-phase', '今はカードを選べません');
      if (state.picks[action.seat] !== null) return reject(state, 'already-picked', 'このラウンドの選択は確定済みです');
      const own = state.remaining[action.seat].find((c) => c.instanceId === action.instanceId);
      if (!own) return reject(state, 'invalid-card', '選べないカードです');

      const picks = { ...state.picks, [action.seat]: own.instanceId };
      const next = { ...state, picks };
      return accept(picks.A !== null && picks.B !== null ? resolveRound(next) : next);
    }

    case 'TIMEOUT_PICK': {
      if (state.phase !== 'pick') return reject(state, 'wrong-phase', '今はカード選択中ではありません');
      const picks = { ...state.picks };
      for (const seat of SEATS) {
        if (picks[seat] === null) {
          const choices = state.remaining[seat];
          picks[seat] = choices[Math.min(choices.length - 1, Math.floor(ctx.rng() * choices.length))].instanceId;
        }
      }
      return accept(resolveRound({ ...state, picks }));
    }

    case 'ACK_REVEAL': {
      if (state.phase !== 'reveal') return reject(state, 'wrong-phase', '今は次へ進めません');
      const revealAcks = { ...state.revealAcks, [action.seat]: true };
      const next = { ...state, revealAcks };
      return accept(bothTrue(revealAcks) ? advanceAfterReveal(next) : next);
    }

    case 'TIMEOUT_REVEAL': {
      if (state.phase !== 'reveal') return reject(state, 'wrong-phase', '今は結果公開中ではありません');
      return accept(advanceAfterReveal(state));
    }

    case 'FORFEIT': {
      if (state.phase === 'finished') return reject(state, 'wrong-phase', '対戦はすでに終了しています');
      // 相手がまだ席に着いていない（ロビー）場合は、勝者なしで終了する
      const opponent = state.players[otherSeat(action.seat)];
      if (!opponent) {
        return accept({ ...state, phase: 'finished', winner: null, endReason: 'abandoned', forfeitedBy: null });
      }
      return accept({
        ...state,
        phase: 'finished',
        winner: otherSeat(action.seat),
        endReason: 'forfeit',
        forfeitedBy: action.seat,
      });
    }

    case 'ABANDON': {
      if (state.phase === 'finished') return reject(state, 'wrong-phase', '対戦はすでに終了しています');
      return accept({ ...state, phase: 'finished', winner: null, endReason: 'abandoned', forfeitedBy: null });
    }
  }
}

// ---------------------------------------------------------------------------
// 視点変換（席B・観戦者向けに、'self'/'enemy' を入れ替える）
// ---------------------------------------------------------------------------

const flipWinner = (w: RoundWinner): RoundWinner => (w === 'self' ? 'enemy' : w === 'enemy' ? 'self' : 'draw');

/** 判定結果を、反対側の視点に入れ替える。flipResult(compareCards(a, b)) は compareCards(b, a) と等しい */
export function flipResult(r: CompareResult): CompareResult {
  const flipped: CompareResult = {
    winner: flipWinner(r.winner),
    selfPower: r.enemyPower,
    enemyPower: r.selfPower,
    rootCounter: r.rootCounter,
    selfVoidNullifiedEnemyBonus: r.enemyVoidNullifiedSelfBonus,
    enemyVoidNullifiedSelfBonus: r.selfVoidNullifiedEnemyBonus,
  };
  if (r.rootCounterSide) flipped.rootCounterSide = r.rootCounterSide === 'self' ? 'enemy' : 'self';
  return flipped;
}

export function flipRecord(rec: RoundRecord): RoundRecord {
  return { ...rec, selfCard: rec.enemyCard, enemyCard: rec.selfCard, result: flipResult(rec.result) };
}

/**
 * 指定した視点（席Bの本人／席Aの本人／観戦者）に見せてよい情報だけを取り出す。
 * - 相手の手札の中身・未公開の選択は含めない（観戦者にも、公開されるまで伏せる）
 * - 公開済みのラウンド記録は、視点席が 'self' になるよう入れ替えて返す
 */
export function viewFor(state: OnlineMatchState, viewer: Seat | 'spectator'): OnlineView {
  const perspective: Seat = viewer === 'spectator' ? 'A' : viewer;
  const enemy = otherSeat(perspective);
  const isPlayer = viewer !== 'spectator';
  const flip = perspective === 'B';

  const records = (rs: RoundRecord[]) => (flip ? rs.map(flipRecord) : rs);

  let forfeitedBy: 'self' | 'enemy' | null = null;
  if (state.forfeitedBy) forfeitedBy = state.forfeitedBy === perspective ? 'self' : 'enemy';

  let matchWinner: RoundWinner | null = null;
  if (state.winner) matchWinner = state.winner === perspective ? 'self' : 'enemy';

  return {
    phase: state.phase,
    viewer,
    perspective,
    selfPlayer: state.players[perspective],
    enemyPlayer: state.players[enemy],
    selfDeckSubmitted: state.deckSubmitted[perspective],
    enemyDeckSubmitted: state.deckSubmitted[enemy],
    selfRemaining: isPlayer ? state.remaining[perspective] : [],
    selfRemainingCount: state.remaining[perspective].length,
    enemyRemainingCount: state.remaining[enemy].length,
    selfPickId: isPlayer ? state.picks[perspective] : null,
    selfHasPicked: state.picks[perspective] !== null,
    enemyHasPicked: state.picks[enemy] !== null,
    selfHasAcked: state.revealAcks[perspective],
    enemyHasAcked: state.revealAcks[enemy],
    rounds: records(state.rounds),
    suddenDeathRounds: records(state.suddenDeathRounds),
    board: records(state.board),
    lastRound: state.lastRound ? (flip ? flipRecord(state.lastRound) : state.lastRound) : null,
    isSuddenDeath: state.isSuddenDeath,
    matchWinner,
    endReason: state.endReason,
    forfeitedBy,
  };
}
