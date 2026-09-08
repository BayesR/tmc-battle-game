import { useEffect, useRef } from 'react';
import type { CardMaster } from '../../types/card';
import type { MatchState, NpcProfile } from '../../types/game';
import { useBattle } from '../../hooks/useBattle';
import { ScoreBoard } from './ScoreBoard';
import { BattleBoard } from './BattleBoard';
import { OpponentPortrait } from './OpponentPortrait';
import { HandSelector } from './HandSelector';
import { RoundResult } from './RoundResult';

interface Props {
  selfDeck: CardMaster[];
  npc: NpcProfile;
  npcDeck: CardMaster[];
  onMatchOver: (state: MatchState) => void;
}

export function BattleScreen({ selfDeck, npc, npcDeck, onMatchOver }: Props) {
  const { state, start, selectCard, pullUp, next } = useBattle(selfDeck, npc, npcDeck);
  const started = useRef(false);

  useEffect(() => {
    if (!started.current) {
      started.current = true;
      start();
    }
  }, [start]);

  useEffect(() => {
    if (state.phase === 'match-over') {
      onMatchOver(state);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase]);

  if (state.selfHand.length === 0) {
    return <p className="p-4 text-center text-zinc-400">対戦準備中…</p>;
  }

  const isFinalStep =
    state.phase === 'reveal' &&
    ((!state.isSuddenDeath && state.rounds.length === 5) ||
      (state.isSuddenDeath && !!state.lastRound && state.lastRound.result.winner !== 'draw'));

  // Pull up直後（NEXTを押す前）は、直近のラウンドを盤面上で両方表向きに公開しておく
  const revealIndex = state.phase === 'reveal' ? state.board.length - 1 : -1;

  // カード選択直後（Pull up前）は、選んだカードと相手カードを盤面に裏向きで置いておく
  const pendingCards =
    state.phase === 'ready' && state.selectedSelfCardId
      ? {
          selfCard: state.selfRemaining.find((c) => c.instanceId === state.selectedSelfCardId)!,
          enemyCard: state.pendingEnemyCard!,
        }
      : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-end gap-2">
        <div className="flex-1">
          <ScoreBoard state={state} />
        </div>
        <OpponentPortrait level={state.npc.level} />
      </div>

      <BattleBoard board={state.board} revealIndex={revealIndex} pendingCards={pendingCards} onPullUp={pullUp} />

      {(state.phase === 'select' || state.phase === 'ready') && (
        <div className="flex flex-col gap-2">
          <HandSelector hand={state.selfRemaining} selectedInstanceId={state.selectedSelfCardId} onSelect={selectCard} />
          {state.phase === 'ready' && (
            <p className="text-center text-[12px] font-bold text-amber-300">
              盤面の裏向きのカードをタップして公開しよう
            </p>
          )}
        </div>
      )}

      {state.phase === 'reveal' && state.lastRound && (
        <RoundResult round={state.lastRound} onNext={next} isFinalStep={isFinalStep} />
      )}
    </div>
  );
}
