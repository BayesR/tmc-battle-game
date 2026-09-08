import type { BattleStreetOpponent } from '../../logic/opponentRoster';
import { OpponentCard } from './OpponentCard';

interface Props {
  roster: BattleStreetOpponent[];
  onChoose: (opponent: BattleStreetOpponent) => void;
  onCancel: () => void;
}

/** 対戦相手4名の抽選結果一覧 */
export function OpponentRosterView({ roster, onChoose, onCancel }: Props) {
  return (
    <div className="flex flex-col gap-4 pb-10">
      <header className="flex items-center justify-between">
        <button onClick={onCancel} className="rounded-lg bg-zinc-800 px-3 py-1.5 text-xs font-bold text-white hover:bg-zinc-700">
          ← やめる
        </button>
        <h1 className="text-sm font-extrabold tracking-wide text-white">対戦相手を選ぶ</h1>
        <span style={{ width: 68 }} />
      </header>
      <div className="grid grid-cols-2 gap-3">
        {roster.map((opp) => (
          <OpponentCard key={opp.id} opponent={opp} onClick={() => onChoose(opp)} />
        ))}
      </div>
    </div>
  );
}
