import { useEffect, useState } from 'react';
import type { DeckCard } from '../../types/card';
import type { OnlineClient, ClientSnapshot } from '../../online/client';
import type { OnlineView } from '../../online/types';
import { useCountdownSeconds } from '../../hooks/useOnlineRoom';
import { BattleBoard } from '../Battle/BattleBoard';
import { HandSelector } from '../Battle/HandSelector';
import { RoundResult } from '../Battle/RoundResult';
import { ScoreBoard } from '../Battle/ScoreBoard';

interface Props {
  view: OnlineView;
  client: OnlineClient;
  snapshot: ClientSnapshot;
}

/** 相手の選択（未公開）を、裏向きで盤面に置くためのダミー。裏向きでしか描画されないので、中身は表示されない */
const HIDDEN_CARD: DeckCard = {
  id: 'hidden',
  instanceId: 'hidden',
  name: '？',
  legacy: '環',
  monsterPride: 0,
  potentialPoints: [
    { legacy: '未使用', value: 0 },
    { legacy: '未使用', value: 0 },
    { legacy: '未使用', value: 0 },
  ],
  hasVoid: false,
  rarity: 'N',
  suggestedNpcLevel: 'Lv1',
  battleStreetRarity: 'N',
};

/** オンライン対戦の対戦画面（pick / reveal）。盤面・手札・勝敗バナーは、NPC対戦と同じ部品を使う */
export function OnlineBattleView({ view, client, snapshot }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const roundCount = view.rounds.length + view.suddenDeathRounds.length;

  // ラウンドが進んだら、手元の選択をリセットする
  useEffect(() => {
    setSelectedId(null);
  }, [roundCount, view.phase]);

  const enemyName = view.enemyPlayer?.name ?? '相手';
  const pickSeconds = useCountdownSeconds(snapshot.timers?.pickDeadlineAt, client);
  const revealSeconds = useCountdownSeconds(snapshot.timers?.revealDeadlineAt, client);

  const lockedCard = view.selfPickId ? view.selfRemaining.find((c) => c.instanceId === view.selfPickId) : undefined;
  const pendingCards = view.phase === 'pick' && lockedCard ? { selfCard: lockedCard, enemyCard: HIDDEN_CARD } : null;
  const revealIndex = view.phase === 'reveal' ? view.board.length - 1 : -1;

  const isFinalStep =
    view.phase === 'reveal' &&
    ((!view.isSuddenDeath && view.rounds.length === 5) ||
      (view.isSuddenDeath && !!view.lastRound && view.lastRound.result.winner !== 'draw'));

  return (
    <div className="flex flex-col gap-4">
      <ScoreBoard state={{ rounds: view.rounds, isSuddenDeath: view.isSuddenDeath, npc: { name: enemyName } }} selfName={view.selfPlayer?.name ?? 'あなた'} />

      <BattleBoard board={view.board} revealIndex={revealIndex} pendingCards={pendingCards} pendingLabel="確定" />

      {view.phase === 'pick' && (
        <div className="flex flex-col gap-2">
          <HandSelector
            hand={view.selfRemaining}
            selectedInstanceId={lockedCard ? lockedCard.instanceId : selectedId}
            onSelect={(id) => setSelectedId(id)}
            disabled={view.selfHasPicked}
          />

          {!view.selfHasPicked ? (
            <button
              onClick={() => selectedId && client.pick(selectedId)}
              disabled={!selectedId}
              className={`mx-auto w-full max-w-xs rounded-full py-2.5 text-sm font-extrabold ${
                selectedId ? 'bg-rose-500 text-white hover:bg-rose-400 active:scale-[0.98]' : 'cursor-not-allowed bg-zinc-800 text-zinc-500'
              }`}
            >
              {selectedId ? 'このカードで決定' : 'カードを選んでください'}
            </button>
          ) : (
            <p className="text-center text-[12px] font-bold text-amber-300">
              {view.enemyHasPicked ? '公開します…' : `${enemyName}の選択を待っています…`}
            </p>
          )}

          <p className="text-center text-[11px] text-zinc-500">
            {!view.selfHasPicked && view.enemyHasPicked && `${enemyName}は選択済みです　`}
            {pickSeconds !== null && (
              <span className={pickSeconds <= 10 ? 'font-bold text-rose-400' : ''}>
                残り {pickSeconds} 秒（時間切れはランダムで自動選択）
              </span>
            )}
          </p>
        </div>
      )}

      {view.phase === 'reveal' && view.lastRound && (
        <div className="flex flex-col gap-1">
          <RoundResult
            round={view.lastRound}
            onNext={() => client.ackReveal()}
            isFinalStep={isFinalStep}
            nextLabel={view.selfHasAcked ? `${enemyName}の確認待ち…` : undefined}
            nextDisabled={view.selfHasAcked}
          />
          {revealSeconds !== null && <p className="text-center text-[11px] text-zinc-500">あと {revealSeconds} 秒で自動的に進みます</p>}
        </div>
      )}
    </div>
  );
}
