import type { BattleStreetOpponent } from '../../logic/opponentRoster';
import { OpponentPortrait } from '../Battle/OpponentPortrait';

interface Props {
  opponent: BattleStreetOpponent;
  onClick: () => void;
}

/** 対戦相手1名分のカード（相手抽選一覧で使用） */
export function OpponentCard({ opponent, onClick }: Props) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-2 rounded-xl border-2 p-3"
      style={{
        borderColor: opponent.isRare ? '#c026d3' : '#3f3f46',
        background: 'rgba(24,24,27,0.7)',
      }}
    >
      <OpponentPortrait level={opponent.portraitLevel} size={64} />
      <div className="text-center">
        <p className="text-xs font-bold text-white">{opponent.name}</p>
        <p className="text-[10px]" style={{ color: opponent.isRare ? '#e879f9' : '#71717a' }}>
          {opponent.isRare ? '？？？' : opponent.key}
        </p>
      </div>
    </button>
  );
}
