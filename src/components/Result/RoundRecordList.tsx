import type { RoundRecord } from '../../types/game';
import { CardView } from '../common/CardView';

interface RowProps {
  round: RoundRecord;
}

/** 対戦の記録：1ラウンド分の行 */
function RoundRow({ round: r }: RowProps) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-zinc-800 bg-zinc-900/60 p-2">
      <CardView card={r.selfCard} size="sm" />
      <span
        className={`text-[11px] font-bold ${
          r.result.winner === 'self' ? 'text-sky-400' : r.result.winner === 'enemy' ? 'text-rose-400' : 'text-zinc-400'
        }`}
      >
        {r.result.selfPower} - {r.result.enemyPower}
      </span>
      <CardView card={r.enemyCard} size="sm" />
    </div>
  );
}

interface Props {
  rounds: RoundRecord[];
  suddenDeathRounds: RoundRecord[];
}

/**
 * 対戦の記録一覧。通常5戦とサドンデスを見出しで区切って表示する
 * （サドンデスが発生していない場合は通常5戦のみ表示）。
 * NPC対戦モード（ResultScreen）・バトルストリート（BattleStreetResultView）で共通利用する。
 */
export function RoundRecordList({ rounds, suddenDeathRounds }: Props) {
  return (
    <div className="w-full max-w-md">
      <h2 className="mb-2 text-left text-xs font-bold text-zinc-400">対戦の記録</h2>
      <div className="flex flex-col gap-2">
        {rounds.map((r, i) => (
          <RoundRow key={`n-${i}`} round={r} />
        ))}
      </div>
      {suddenDeathRounds.length > 0 && (
        <>
          <div className="my-3 flex items-center gap-2">
            <div className="h-px flex-1 bg-zinc-700" />
            <span className="text-[10px] font-bold text-amber-400">サドンデス</span>
            <div className="h-px flex-1 bg-zinc-700" />
          </div>
          <div className="flex flex-col gap-2">
            {suddenDeathRounds.map((r, i) => (
              <RoundRow key={`sd-${i}`} round={r} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
