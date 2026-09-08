import type { RoundRecord } from '../../types/game';

interface Props {
  round: RoundRecord;
  onNext: () => void;
  isFinalStep: boolean;
}

const WINNER_LABEL: Record<RoundRecord['result']['winner'], string> = {
  self: 'あなたの勝ち！',
  enemy: '相手の勝ち…',
  draw: '引き分け',
};

const WINNER_COLOR: Record<RoundRecord['result']['winner'], string> = {
  self: '#38bdf8',
  enemy: '#fb7185',
  draw: '#d4d4d8',
};

/**
 * 1ラウンドの勝敗結果バナー。
 * カード自体は BattleBoard（盤面）に表示済みのため、ここではテキストとエフェクトのみを表示する。
 */
export function RoundResult({ round, onNext, isFinalStep }: Props) {
  const { result } = round;
  return (
    <div
      className="flex flex-col items-center gap-3 rounded-xl border border-zinc-700 p-4"
      style={{ background: 'rgba(24,24,27,0.85)' }}
    >
      <h2 className="text-xl font-extrabold" style={{ color: WINNER_COLOR[result.winner] }}>
        {WINNER_LABEL[result.winner]}
      </h2>

      <p className="font-mono text-sm text-zinc-300">
        {result.selfPower} <span className="text-zinc-600">-</span> {result.enemyPower}
      </p>

      <div className="flex flex-wrap justify-center gap-2 text-[11px]">
        {result.rootCounter && (
          <span className="rounded-full bg-yellow-500 px-2 py-0.5 font-bold text-black">
            ROOT COUNTER発動（{result.rootCounterSide === 'self' ? 'あなた' : '相手'}）
          </span>
        )}
        {result.selfVoidNullifiedEnemyBonus && (
          <span className="rounded-full bg-fuchsia-600 px-2 py-0.5 font-bold text-white">
            あなたのVoidが相手のPP加算を無効化
          </span>
        )}
        {result.enemyVoidNullifiedSelfBonus && (
          <span className="rounded-full bg-fuchsia-600 px-2 py-0.5 font-bold text-white">
            相手のVoidがあなたのPP加算を無効化
          </span>
        )}
      </div>

      <button
        onClick={onNext}
        className="w-full max-w-xs rounded-full bg-sky-500 py-2.5 text-sm font-extrabold text-white hover:bg-sky-400 active:scale-[0.98]"
      >
        {isFinalStep ? '結果を見る' : '次のラウンドへ'}
      </button>
    </div>
  );
}
