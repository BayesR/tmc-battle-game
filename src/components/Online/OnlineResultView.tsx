import type { ReactNode } from 'react';
import type { ClientSnapshot, OnlineClient } from '../../online/client';
import type { OnlineView } from '../../online/types';
import { useCountdownSeconds } from '../../hooks/useOnlineRoom';
import { RoundRecordList } from '../Result/RoundRecordList';
import { SuddenDeathBanner } from '../Result/SuddenDeathBanner';

interface Props {
  view: OnlineView;
  client: OnlineClient;
  snapshot: ClientSnapshot;
  onExit: () => void;
}

/** オンライン対戦の結果画面（通常の決着・不戦勝/不戦敗・勝者なし）と、再戦の操作 */
export function OnlineResultView({ view, client, snapshot, onExit }: Props) {
  const enemyName = view.enemyPlayer?.name ?? '相手';
  const closeSeconds = useCountdownSeconds(snapshot.timers?.closeDeadlineAt, client);
  const wins = view.rounds.reduce(
    (acc, r) => {
      if (r.result.winner === 'self') acc.self += 1;
      else if (r.result.winner === 'enemy') acc.enemy += 1;
      return acc;
    },
    { self: 0, enemy: 0 }
  );

  let title = '勝者なし';
  let color = '#a1a1aa';
  if (view.matchWinner === 'self') {
    title = 'WIN';
    color = '#38bdf8';
  } else if (view.matchWinner === 'enemy') {
    title = 'LOSE';
    color = '#fb7185';
  }

  let note: string | null = null;
  if (view.endReason === 'forfeit') {
    note = view.forfeitedBy === 'enemy' ? `${enemyName}が退出または切断したため、不戦勝です` : 'あなたが退出または切断したため、不戦敗です';
  } else if (view.endReason === 'abandoned') {
    note = '相手が揃わないまま、または両者がいなくなったため、ルームが終了しました';
  }

  // 再戦の案内（ルームが閉じられた／途中で終了した／相手がいない／通常の相談中）
  const roomClosed = snapshot.status === 'ended';
  const canRematch = view.endReason === 'normal';
  const enemyHere = snapshot.connected?.enemy === true;

  let rematch: ReactNode = null;
  if (roomClosed) {
    rematch = (
      <p className="max-w-xs text-xs leading-relaxed text-zinc-400" data-testid="rematch-closed">
        ルームは閉じられました。もう一度対戦するときは、新しいルームを作ってください。
      </p>
    );
  } else if (!canRematch) {
    rematch = <p className="max-w-xs text-xs leading-relaxed text-zinc-500">対戦が途中で終了したため、再戦はできません。新しいルームを作ってください。</p>;
  } else if (!enemyHere) {
    rematch = <p className="max-w-xs text-xs leading-relaxed text-zinc-500" data-testid="rematch-enemy-left">{enemyName}が退出したため、再戦はできません。</p>;
  } else {
    rematch = (
      <div className="flex w-full max-w-md flex-col items-center gap-2">
        {view.rematchEnemyVoted && !view.rematchSelfVoted && (
          <p className="text-xs font-bold text-emerald-300" data-testid="rematch-enemy-voted">
            {enemyName}が再戦を希望しています
          </p>
        )}
        {!view.rematchSelfVoted ? (
          <button
            onClick={() => client.rematch()}
            className="w-full rounded-xl bg-emerald-600 py-3 text-sm font-extrabold text-white hover:bg-emerald-500 active:scale-[0.99]"
          >
            同じ相手と再戦する
          </button>
        ) : (
          <>
            <p className="text-xs font-bold text-amber-300" data-testid="rematch-waiting">
              {enemyName}の返事を待っています…
            </p>
            <button onClick={() => client.cancelRematch()} className="rounded-lg bg-zinc-800 px-4 py-1.5 text-xs font-bold text-white hover:bg-zinc-700">
              希望を取り消す
            </button>
          </>
        )}
        <p className="text-[11px] text-zinc-500">再戦では、前回のデッキを入れた状態から、組み替えて提出できます。</p>
        {closeSeconds !== null && <p className="text-[11px] text-zinc-500">あと {closeSeconds} 秒で、ルームが閉じられます。</p>}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-5 pb-10 pt-4 text-center">
      <div>
        <p className="text-xs font-bold text-zinc-400">
          対 {enemyName}
          {view.matchNumber > 1 && `（${view.matchNumber}戦目）`}
        </p>
        <h1 className="text-5xl font-black tracking-widest" style={{ color }} data-testid="result-title">
          {title}
        </h1>
      </div>

      {view.rounds.length > 0 && (
        <p className="font-mono text-lg text-white">
          {wins.self} - {wins.enemy}
        </p>
      )}

      {note && <p className="max-w-xs text-xs leading-relaxed text-amber-300">{note}</p>}

      {rematch}

      {view.suddenDeathRounds.length > 0 && <SuddenDeathBanner suddenDeathRoundCount={view.suddenDeathRounds.length} />}

      {view.rounds.length > 0 && <RoundRecordList rounds={view.rounds} suddenDeathRounds={view.suddenDeathRounds} />}

      <button onClick={onExit} className="w-full max-w-md rounded-xl bg-zinc-800 py-3 text-sm font-extrabold text-white hover:bg-zinc-700">
        オンライン対戦のトップへ
      </button>
    </div>
  );
}
