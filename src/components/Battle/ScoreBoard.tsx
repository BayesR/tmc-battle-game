import type { MatchState } from '../../types/game';

interface Props {
  state: MatchState;
}

/** 現在の勝敗数・ラウンド経過・サドンデス状態を表示するスコアボード */
export function ScoreBoard({ state }: Props) {
  const wins = state.rounds.reduce(
    (acc, r) => {
      if (r.result.winner === 'self') acc.self += 1;
      else if (r.result.winner === 'enemy') acc.enemy += 1;
      return acc;
    },
    { self: 0, enemy: 0 }
  );

  return (
    <div className="rounded-xl border border-zinc-700 bg-zinc-900/60 p-3">
      <div className="flex items-center justify-between text-sm font-bold text-white">
        <span>あなた</span>
        {state.isSuddenDeath ? (
          <span className="rounded-full bg-amber-500 px-2 py-0.5 text-[11px] text-black">サドンデス</span>
        ) : (
          <span className="text-zinc-400">{state.rounds.length} / 5 戦</span>
        )}
        <span>{state.npc.name || 'NPC'}</span>
      </div>
      <div className="mt-1 flex items-center justify-between text-2xl font-extrabold">
        <span className="text-sky-400">{wins.self}</span>
        <span className="text-xs text-zinc-500">VS</span>
        <span className="text-rose-400">{wins.enemy}</span>
      </div>

      {!state.isSuddenDeath && (
        <div className="mt-2 flex gap-1">
          {Array.from({ length: 5 }).map((_, i) => {
            const r = state.rounds[i];
            const color = !r
              ? 'bg-zinc-700'
              : r.result.winner === 'self'
              ? 'bg-sky-400'
              : r.result.winner === 'enemy'
              ? 'bg-rose-400'
              : 'bg-zinc-400';
            return <span key={i} className={`h-1.5 flex-1 rounded-full ${color}`} />;
          })}
        </div>
      )}
    </div>
  );
}
