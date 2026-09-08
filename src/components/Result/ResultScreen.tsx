import type { MatchState } from '../../types/game';
import { SuddenDeathBanner } from './SuddenDeathBanner';
import { RoundRecordList } from './RoundRecordList';

interface Props {
  state: MatchState;
  onRematch: () => void;
  onRebuildDeck: () => void;
}

const RESULT_TEXT: Record<string, { label: string; color: string }> = {
  self: { label: 'WIN', color: 'text-sky-400' },
  enemy: { label: 'LOSE', color: 'text-rose-400' },
  draw: { label: 'DRAW', color: 'text-zinc-300' },
};

/** 5戦（＋必要ならサドンデス）終了後の決着画面 */
export function ResultScreen({ state, onRematch, onRebuildDeck }: Props) {
  const winner = state.matchWinner ?? 'draw';
  const info = RESULT_TEXT[winner];

  const wins = state.rounds.reduce(
    (acc, r) => {
      if (r.result.winner === 'self') acc.self += 1;
      else if (r.result.winner === 'enemy') acc.enemy += 1;
      else acc.draw += 1;
      return acc;
    },
    { self: 0, enemy: 0, draw: 0 }
  );

  return (
    <div className="flex flex-col items-center gap-5 pb-10 pt-6 text-center">
      <div>
        <p className="text-xs font-bold text-zinc-400">対 {state.npc.name}（{state.npc.level}）</p>
        <h1 className={`text-5xl font-black tracking-widest ${info.color}`}>{info.label}</h1>
      </div>

      <p className="font-mono text-lg text-white">
        {wins.self} - {wins.enemy}
        {wins.draw > 0 && <span className="text-zinc-500"> （引分 {wins.draw}）</span>}
      </p>

      {state.suddenDeathRounds.length > 0 && (
        <SuddenDeathBanner suddenDeathRoundCount={state.suddenDeathRounds.length} />
      )}

      <RoundRecordList rounds={state.rounds} suddenDeathRounds={state.suddenDeathRounds} />

      <div className="flex w-full max-w-md flex-col gap-2">
        <button
          onClick={onRematch}
          className="rounded-xl bg-rose-500 py-3 text-sm font-extrabold text-white hover:bg-rose-400 active:scale-[0.98]"
        >
          同じデッキでもう一度対戦
        </button>
        <button
          onClick={onRebuildDeck}
          className="rounded-xl bg-zinc-800 py-3 text-sm font-extrabold text-white hover:bg-zinc-700 active:scale-[0.98]"
        >
          デッキを組み直す
        </button>
      </div>
    </div>
  );
}
