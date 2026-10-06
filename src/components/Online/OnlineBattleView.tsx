import { useEffect, useState } from 'react';
import type { DeckCard } from '../../types/card';
import type { OnlineClient, ClientSnapshot } from '../../online/client';
import type { OnlineView } from '../../online/types';
import { useCountdownSeconds } from '../../hooks/useOnlineRoom';
import { PULL_UP_MS, isPullingUp, layoutBoard } from '../../online/pullUp';
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

  // 「PULL UP」演出：公開まで表示し終えたラウンド数。最初に表示した時点で公開済みのラウンドは、演出なしで表示する
  const [revealedCount, setRevealedCount] = useState(roundCount);
  useEffect(() => {
    if (view.phase !== 'reveal') {
      if (revealedCount !== roundCount) setRevealedCount(roundCount);
      return;
    }
    if (roundCount > revealedCount) {
      const id = window.setTimeout(() => setRevealedCount(roundCount), PULL_UP_MS);
      return () => window.clearTimeout(id);
    }
  }, [view.phase, roundCount, revealedCount]);
  const pulling = isPullingUp(view.phase, roundCount, revealedCount);

  const enemyName = view.enemyPlayer?.name ?? '相手';
  const pickSeconds = useCountdownSeconds(snapshot.timers?.pickDeadlineAt, client);
  const revealSeconds = useCountdownSeconds(snapshot.timers?.revealDeadlineAt, client);

  // 盤面に裏向きで置くのは、「決定」を押して確定したカード、または手札から選んでいる最中のカード
  const lockedCard = view.selfPickId ? view.selfRemaining.find((c) => c.instanceId === view.selfPickId) : undefined;
  const selectedCard = !view.selfHasPicked && selectedId ? view.selfRemaining.find((c) => c.instanceId === selectedId) : undefined;
  const layout = layoutBoard({
    phase: view.phase,
    board: view.board,
    pulling,
    selfPendingCard: lockedCard ?? selectedCard,
    locked: lockedCard !== undefined,
    hiddenCard: HIDDEN_CARD,
  });

  // 盤面の裏向きのカードの表示：演出中は「PULL UP」、確定後は「確定」、選択中は表示なし（代わりに「決定」ボタンを重ねる）
  const pendingLabel = layout.pendingKind === 'pulling' ? 'PULL UP' : layout.pendingKind === 'locked' ? '確定' : null;
  const pendingAction =
    layout.pendingKind === 'selecting' && selectedCard ? { label: '決定', onClick: () => client.pick(selectedCard.instanceId) } : null;

  const isFinalStep =
    view.phase === 'reveal' &&
    ((!view.isSuddenDeath && view.rounds.length === 5) ||
      (view.isSuddenDeath && !!view.lastRound && view.lastRound.result.winner !== 'draw'));

  return (
    <div className="flex flex-col gap-4">
      <ScoreBoard state={{ rounds: view.rounds, isSuddenDeath: view.isSuddenDeath, npc: { name: enemyName } }} selfName={view.selfPlayer?.name ?? 'あなた'} />

      <BattleBoard
        board={layout.board}
        revealIndex={layout.revealIndex}
        pendingCards={layout.pendingCards}
        pendingLabel={pendingLabel}
        pendingAction={pendingAction}
      />

      {pulling && (
        <div className="text-center" data-testid="pullup-banner">
          <p className="animate-pulse text-xl font-black tracking-[0.3em] text-amber-300">PULL UP!</p>
          <p className="text-[11px] text-zinc-400">両者決定！カードを公開します</p>
        </div>
      )}

      {view.phase === 'pick' && (
        <div className="flex flex-col gap-2">
          <HandSelector
            hand={view.selfRemaining}
            selectedInstanceId={lockedCard ? lockedCard.instanceId : selectedId}
            onSelect={(id) => setSelectedId(id)}
            disabled={view.selfHasPicked}
          />

          {!view.selfHasPicked ? (
            <p className="text-center text-[12px] font-bold text-sky-300" data-testid="pick-hint">
              {selectedCard ? '盤面のカードの「決定」を押すと確定します（それまでは選び直せます）' : 'カードを選んでください'}
            </p>
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

      {view.phase === 'reveal' && view.lastRound && !pulling && (
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
