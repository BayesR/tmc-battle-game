import type { CardMaster } from '../../types/card';
import type { MatchState } from '../../types/game';
import { CardView } from '../common/CardView';
import { SuddenDeathBanner } from '../Result/SuddenDeathBanner';
import { RoundRecordList } from '../Result/RoundRecordList';
import { BadgeIcon } from './BadgeIcon';

interface Props {
  won: boolean;
  bet: number;
  cardReward: CardMaster | null;
  badgesAfter: number;
  matchState: MatchState;
  onContinue: () => void;
}

/**
 * バトルストリートの対戦結果画面。
 * NPC対戦モードの ResultScreen と同じ「対戦の記録」一覧を流用しつつ、
 * バッジ増減・特別な撃破報酬を追加し、ボタンは「バトルストリートに戻る」のみにしている。
 */
export function BattleStreetResultView({ won, bet, cardReward, badgesAfter, matchState, onContinue }: Props) {
  const wins = matchState.rounds.reduce(
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
        <p className="text-xs font-bold text-zinc-400">対 {matchState.npc.name}</p>
        <h1 className="text-5xl font-black tracking-widest" style={{ color: won ? '#38bdf8' : '#fb7185' }}>
          {won ? 'WIN' : 'LOSE'}
        </h1>
      </div>

      <p className="font-mono text-lg text-white">
        {wins.self} - {wins.enemy}
        {wins.draw > 0 && <span className="text-zinc-500"> （引分 {wins.draw}）</span>}
      </p>

      <p className="flex items-center gap-1.5 font-mono text-base text-white">
        バッジ {won ? '+' : '-'}
        {bet}　→　所持 <BadgeIcon size={16} />
        {badgesAfter}
      </p>

      {cardReward && (
        <div
          className="flex w-full max-w-md flex-col items-center gap-3 rounded-2xl border-2 p-5"
          style={{
            borderColor: '#fbbf24',
            background: 'linear-gradient(180deg, rgba(251,191,36,0.18) 0%, rgba(24,24,27,0.85) 70%)',
            boxShadow: '0 0 24px rgba(251,191,36,0.35)',
          }}
        >
          <p className="text-sm font-black tracking-wide text-amber-300">🎉 特別な戦利品を手に入れた！</p>
          <CardView card={cardReward} size="lg" />
          <p className="rounded-full bg-black/40 px-3 py-1 text-xs font-bold text-amber-200">
            {cardReward.battleStreetRarity}レアリティのカードを獲得
          </p>
        </div>
      )}

      {matchState.suddenDeathRounds.length > 0 && (
        <SuddenDeathBanner suddenDeathRoundCount={matchState.suddenDeathRounds.length} />
      )}

      <RoundRecordList rounds={matchState.rounds} suddenDeathRounds={matchState.suddenDeathRounds} />

      <button
        onClick={onContinue}
        className="w-full max-w-md rounded-xl bg-zinc-800 py-3 text-sm font-extrabold text-white hover:bg-zinc-700"
      >
        バトルストリートに戻る
      </button>
    </div>
  );
}
