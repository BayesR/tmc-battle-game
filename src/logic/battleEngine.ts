import type { DeckCard, Legacy } from '../types/card';
import type { MatchState, NpcProfile, RoundRecord, RoundWinner } from '../types/game';
import { compareCards } from './compareCards';
import { NPC_LEVEL_PROFILE, reaperBiasedOrder } from './npcDeckGenerator';

/**
 * 対戦フロー全体（5戦 → 同数ならサドンデス）を管理する Reducer。
 * ------------------------------------------------------------------
 * 基本フロー（引き継ぎドキュメント 5.1）：
 *   デッキ構築 → 対戦相手決定 → カード選択画面 → Pull up → 勝敗決定 → （5回繰り返す）
 *   → 5戦後に勝敗数で決着（同数ならサドンデス）
 *
 * サドンデス（5.4）：
 *   同じ5枚の手札に戻して再戦。最初に1勝を取った側がその時点で試合全体の勝利。
 *   ※全戦引き分けが続く場合は同じ5枚でもう一度サドンデスをやり直す（Phase 1の実装上の割り切り）。
 *
 * Phase 2以降の拡張ポイント：
 *   - NPCのカード選択を「完全ランダム」から「性格ロジック」に差し替える → pickEnemyCard を差し替える想定
 *   - 勝敗数の記録をプレイヤー進行状況（勝利回数）に連携する → matchWinner確定時にフックを追加する想定
 */

export type MatchAction =
  | { type: 'INIT'; selfHand: DeckCard[]; enemyHand: DeckCard[]; npc: NpcProfile }
  | { type: 'SELECT_SELF_CARD'; instanceId: string }
  | { type: 'PULL_UP' }
  | { type: 'NEXT' };

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * NPCが出すカードを選ぶ処理。
 * options.level に応じたプロファイルのplayStyleに従う：
 *   'random'：完全ランダム（Lv1・Lv2）
 *   'openSpecialThenRandom'：初手はMP指定／Voidカードからランダム、以降はランダム（Lv3）
 *   'openSpecialThenMatchup'：初手は同様、以降は自分（プレイヤー）の既出Legacyを予測し、
 *     そのLegacyに対してPPで有利なカードを優先する（Lv4）
 *   'reaperAI'：初手は完全ランダム。初手で負けた場合のみ、2戦目はプレイヤーが1戦目に出した
 *     カードに対して必ず勝てるカードを出す（勝てるカードがなければ引き分けられるカードを出す）。
 *     それ以外は、プレイヤーの既出カードから残りのMPを予測し、それを効率よく上回るカードを選ぶ。
 *
 * サドンデス中（死神・Lv3・Lv4共通）：
 *   このサイクルの初手は、所持している6・5・4・1のいずれかのカードからランダムに出す。
 *   決着がつかず2手目以降になった場合は、初手のカードと、既に公開済みの対戦相手（プレイヤー）の
 *   デッキ情報（5戦・サドンデス通して全カードは既に公開済みのため参照可能）から、
 *   プレイヤーの残りカードそれぞれに対する勝率が最も高いカードを選ぶ。
 */
interface PickEnemyCardOptions {
  level?: NpcProfile['level'];
  isFirstMove?: boolean;
  selfHistoryLegacies?: Legacy[];
  selfHistoryCards?: DeckCard[];
  firstRoundSelfCard?: DeckCard | null;
  roundsPlayedSoFar?: number;
  lastRoundWinner?: RoundWinner | null;
  isSuddenDeath?: boolean;
  selfFullHand?: DeckCard[];
  suddenDeathSelfHistoryThisCycle?: DeckCard[];
}

function pickSuddenDeathCard(remaining: DeckCard[], options: PickEnemyCardOptions): DeckCard {
  if (options.isFirstMove) {
    const specialMPs = [6, 5, 4, 1];
    const candidates = remaining.filter((c) => specialMPs.includes(c.monsterPride));
    if (candidates.length > 0) return candidates[Math.floor(Math.random() * candidates.length)];
    return remaining[Math.floor(Math.random() * remaining.length)];
  }

  // 対戦相手（プレイヤー）のデッキは5戦・サドンデスを通して既に全て公開済みなので、
  // 「まだ出ていない残りのカード」を参照して、それぞれへの勝率が最も高いカードを選ぶ
  const playedIds = new Set((options.suddenDeathSelfHistoryThisCycle ?? []).map((c) => c.instanceId));
  const possiblePlayerCards = (options.selfFullHand ?? []).filter((c) => !playedIds.has(c.instanceId));
  if (possiblePlayerCards.length === 0) {
    return remaining[Math.floor(Math.random() * remaining.length)];
  }

  let best = remaining[0];
  let bestRate = -1;
  for (const candidate of remaining) {
    let winCount = 0;
    for (const playerCard of possiblePlayerCards) {
      if (compareCards(playerCard, candidate).winner === 'enemy') winCount++;
    }
    const rate = winCount / possiblePlayerCards.length;
    if (rate > bestRate) {
      bestRate = rate;
      best = candidate;
    }
  }
  return best;
}

function pickEnemyCard(remaining: DeckCard[], options: PickEnemyCardOptions = {}): DeckCard {
  const profile = options.level ? NPC_LEVEL_PROFILE[options.level] : undefined;
  const playStyle = profile ? profile.playStyle : 'random';

  // サドンデス中は、死神・Lv3・Lv4共通の専用ロジックに切り替える
  if (options.isSuddenDeath && (playStyle === 'openSpecialThenRandom' || playStyle === 'openSpecialThenMatchup' || playStyle === 'reaperAI')) {
    return pickSuddenDeathCard(remaining, options);
  }

  if (playStyle === 'reaperAI') {
    if (options.isFirstMove) {
      return remaining[Math.floor(Math.random() * remaining.length)];
    }
    if (options.roundsPlayedSoFar === 1 && options.lastRoundWinner === 'self' && options.firstRoundSelfCard) {
      // 初手で負けた（＝プレイヤーが勝った）場合のみ、プレイヤーの初手カードに対して
      // 必ず勝てるカードを2戦目に出す（勝てるカードがなければ引き分けられるカードで応戦）
      const benchmark = options.firstRoundSelfCard;
      const winners = remaining.filter((c) => compareCards(benchmark, c).winner === 'enemy');
      if (winners.length > 0) return reaperBiasedOrder(winners)[0];
      const drawers = remaining.filter((c) => compareCards(benchmark, c).winner === 'draw');
      if (drawers.length > 0) return reaperBiasedOrder(drawers)[0];
      // 勝ち・引き分けどちらも作れない場合の最終手段：最も強い（MPが高い）カード
      const sorted = [...remaining].sort((a, b) => b.monsterPride - a.monsterPride);
      return sorted[0];
    }
    if (options.selfHistoryCards && options.selfHistoryCards.length > 0) {
      // プレイヤーの既出カードから「残りの平均的なMP」を予測し、それを効率よく（最小限に）上回るカードを選ぶ
      const avgMP =
        options.selfHistoryCards.reduce((s, c) => s + c.monsterPride, 0) / options.selfHistoryCards.length;
      const efficientCandidates = remaining.filter((c) => c.monsterPride > avgMP);
      if (efficientCandidates.length > 0) {
        const sorted = [...efficientCandidates].sort((a, b) => a.monsterPride - b.monsterPride);
        return sorted[0];
      }
      // 効率よく上回れない場合は、最も強いカードで応戦する
      const sorted = [...remaining].sort((a, b) => b.monsterPride - a.monsterPride);
      return sorted[0];
    }
    // 情報が無い場合のフォールバック：MPが低いカードから効率重視で温存的に出す
    const sorted = [...remaining].sort((a, b) => a.monsterPride - b.monsterPride);
    return sorted[0];
  }

  if (playStyle === 'openSpecialThenRandom' || playStyle === 'openSpecialThenMatchup') {
    if (options.isFirstMove) {
      const specialMPs = (profile?.requireMP ?? []).flatMap((r) => (Array.isArray(r) ? r : [r]));
      const specialCards = remaining.filter((c) => specialMPs.includes(c.monsterPride) || c.hasVoid);
      if (specialCards.length > 0) {
        return specialCards[Math.floor(Math.random() * specialCards.length)];
      }
    } else if (playStyle === 'openSpecialThenMatchup' && options.selfHistoryLegacies && options.selfHistoryLegacies.length > 0) {
      const freq: Partial<Record<Legacy, number>> = {};
      options.selfHistoryLegacies.forEach((l) => {
        freq[l] = (freq[l] ?? 0) + 1;
      });
      const predicted = (Object.entries(freq) as [Legacy, number][]).sort((a, b) => b[1] - a[1])[0][0];
      const goodMatch = remaining.filter((c) => c.potentialPoints.some((pp) => pp.legacy === predicted));
      if (goodMatch.length > 0) {
        return goodMatch[Math.floor(Math.random() * goodMatch.length)];
      }
    }
  }

  return remaining[Math.floor(Math.random() * remaining.length)];
}

export function createInitialMatchState(): MatchState {
  return {
    phase: 'select',
    npc: { name: '', level: 'Lv1', personality: 'random' },
    selfHand: [],
    enemyHand: [],
    selfRemaining: [],
    enemyRemaining: [],
    rounds: [],
    suddenDeathRounds: [],
    board: [],
    isSuddenDeath: false,
    selectedSelfCardId: null,
    pendingEnemyCard: null,
    lastRound: null,
    matchWinner: null,
  };
}

function tallyWins(rounds: RoundRecord[]): { self: number; enemy: number; draw: number } {
  return rounds.reduce(
    (acc, r) => {
      if (r.result.winner === 'self') acc.self += 1;
      else if (r.result.winner === 'enemy') acc.enemy += 1;
      else acc.draw += 1;
      return acc;
    },
    { self: 0, enemy: 0, draw: 0 }
  );
}

export function matchReducer(state: MatchState, action: MatchAction): MatchState {
  switch (action.type) {
    case 'INIT': {
      // 出し順は完全ランダム（自分・NPC双方）→ 手札自体をシャッフルして保持する
      const selfHand = shuffle(action.selfHand);
      const enemyHand = shuffle(action.enemyHand);
      return {
        ...createInitialMatchState(),
        npc: action.npc,
        selfHand,
        enemyHand,
        selfRemaining: selfHand,
        enemyRemaining: enemyHand,
      };
    }

    case 'SELECT_SELF_CARD': {
      if (state.phase !== 'select' && state.phase !== 'ready') return state;
      // Pull upを押すまでは何度でも選び直せる（選び直すたびに相手カードも新しく決め直す）
      const relevantRounds = state.isSuddenDeath ? state.suddenDeathRounds : state.rounds;
      const cyclePlayedCount = state.enemyHand.length - state.enemyRemaining.length;
      const pickOptions: PickEnemyCardOptions = {
        level: state.npc.level,
        isFirstMove: state.enemyRemaining.length === state.enemyHand.length,
        roundsPlayedSoFar: cyclePlayedCount,
        lastRoundWinner: relevantRounds.length > 0 ? relevantRounds[relevantRounds.length - 1].result.winner : null,
        selfHistoryLegacies: state.rounds.map((r) => r.selfCard.legacy),
        selfHistoryCards: state.rounds.map((r) => r.selfCard),
        firstRoundSelfCard: state.rounds.length > 0 ? state.rounds[0].selfCard : null,
        isSuddenDeath: state.isSuddenDeath,
        selfFullHand: state.selfHand,
        suddenDeathSelfHistoryThisCycle:
          cyclePlayedCount > 0 ? state.suddenDeathRounds.slice(-cyclePlayedCount).map((r) => r.selfCard) : [],
      };
      const pendingEnemyCard = pickEnemyCard(state.enemyRemaining, pickOptions);
      return { ...state, selectedSelfCardId: action.instanceId, pendingEnemyCard, phase: 'ready' };
    }

    case 'PULL_UP': {
      if (state.phase !== 'ready' || !state.selectedSelfCardId) return state;

      const selfCard = state.selfRemaining.find(
        (c) => c.instanceId === state.selectedSelfCardId
      );
      if (!selfCard) return state;

      const relevantRoundsFallback = state.isSuddenDeath ? state.suddenDeathRounds : state.rounds;
      const cyclePlayedCountFallback = state.enemyHand.length - state.enemyRemaining.length;
      const fallbackOptions: PickEnemyCardOptions = {
        level: state.npc.level,
        isFirstMove: state.enemyRemaining.length === state.enemyHand.length,
        roundsPlayedSoFar: cyclePlayedCountFallback,
        lastRoundWinner: relevantRoundsFallback.length > 0 ? relevantRoundsFallback[relevantRoundsFallback.length - 1].result.winner : null,
        selfHistoryLegacies: state.rounds.map((r) => r.selfCard.legacy),
        selfHistoryCards: state.rounds.map((r) => r.selfCard),
        firstRoundSelfCard: state.rounds.length > 0 ? state.rounds[0].selfCard : null,
        isSuddenDeath: state.isSuddenDeath,
        selfFullHand: state.selfHand,
        suddenDeathSelfHistoryThisCycle:
          cyclePlayedCountFallback > 0 ? state.suddenDeathRounds.slice(-cyclePlayedCountFallback).map((r) => r.selfCard) : [],
      };
      const enemyCard = state.pendingEnemyCard ?? pickEnemyCard(state.enemyRemaining, fallbackOptions);
      const result = compareCards(selfCard, enemyCard);

      const roundIndex = state.isSuddenDeath
        ? state.suddenDeathRounds.length
        : state.rounds.length;
      const record: RoundRecord = { roundIndex, selfCard, enemyCard, result };

      const selfRemaining = state.selfRemaining.filter((c) => c.instanceId !== selfCard.instanceId);
      const enemyRemaining = state.enemyRemaining.filter(
        (c) => c.instanceId !== enemyCard.instanceId
      );

      return {
        ...state,
        selfRemaining,
        enemyRemaining,
        rounds: state.isSuddenDeath ? state.rounds : [...state.rounds, record],
        suddenDeathRounds: state.isSuddenDeath
          ? [...state.suddenDeathRounds, record]
          : state.suddenDeathRounds,
        board: [...state.board, record],
        lastRound: record,
        phase: 'reveal',
        selectedSelfCardId: null,
        pendingEnemyCard: null,
      };
    }

    case 'NEXT': {
      if (state.phase !== 'reveal') return state;

      // --- サドンデス中：決着がついていればそこで試合終了 ---
      if (state.isSuddenDeath) {
        const decided = state.lastRound && state.lastRound.result.winner !== 'draw';
        if (decided) {
          return {
            ...state,
            phase: 'match-over',
            matchWinner: state.lastRound!.result.winner,
          };
        }
        // まだ決着していない場合、この周回のカードが残っていれば選択画面へ
        if (state.selfRemaining.length > 0 && state.enemyRemaining.length > 0) {
          return { ...state, phase: 'select' };
        }
        // 同じ5枚を使い切ってなお全て引き分け → 同じ手札でもう一度サドンデス（盤面もクリア）
        return {
          ...state,
          phase: 'select',
          selfRemaining: shuffle(state.selfHand),
          enemyRemaining: shuffle(state.enemyHand),
          board: [],
        };
      }

      // --- 通常5戦中 ---
      if (state.rounds.length < 5) {
        return { ...state, phase: 'select' };
      }

      // 5戦終了 → 勝敗数を集計
      const tally = tallyWins(state.rounds);
      if (tally.self !== tally.enemy) {
        return {
          ...state,
          phase: 'match-over',
          matchWinner: tally.self > tally.enemy ? 'self' : ('enemy' as RoundWinner),
        };
      }

      // 同数 → サドンデス突入（同じ5枚の手札に戻す＝盤面クリア）
      return {
        ...state,
        isSuddenDeath: true,
        phase: 'select',
        selfRemaining: shuffle(state.selfHand),
        enemyRemaining: shuffle(state.enemyHand),
        board: [],
      };
    }

    default:
      return state;
  }
}
