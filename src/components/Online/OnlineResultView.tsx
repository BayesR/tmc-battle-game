import type { OnlineView } from '../../online/types';
import { RoundRecordList } from '../Result/RoundRecordList';
import { SuddenDeathBanner } from '../Result/SuddenDeathBanner';

interface Props {
  view: OnlineView;
  onExit: () => void;
}

/** オンライン対戦の結果画面（通常の決着・不戦勝/不戦敗・勝者なし） */
export function OnlineResultView({ view, onExit }: Props) {
  const enemyName = view.enemyPlayer?.name ?? '相手';
  const wins = view.rounds.reduce((acc, r) => {
    if (r.result.winner === 'self') acc.self += 1;
    else if (r.result.winner === 'enemy') acc.enemy += 1;
    return acc;
  }, { self: 0, enemy: 0 });

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

  return (
    <div className="flex flex-col items-center gap-5 pb-10 pt-4 text-center">
      <div>
        <p className="text-xs font-bold text-zinc-400">対 {enemyName}</p>
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

      {view.suddenDeathRounds.length > 0 && <SuddenDeathBanner suddenDeathRoundCount={view.suddenDeathRounds.length} />}

      {view.rounds.length > 0 && <RoundRecordList rounds={view.rounds} suddenDeathRounds={view.suddenDeathRounds} />}

      <button onClick={onExit} className="w-full max-w-md rounded-xl bg-zinc-800 py-3 text-sm font-extrabold text-white hover:bg-zinc-700">
        オンライン対戦のトップへ
      </button>
      <p className="text-[11px] text-zinc-600">※ 再戦機能は準備中です。もう一度対戦するときは、新しいルームを作ってください。</p>
    </div>
  );
}
