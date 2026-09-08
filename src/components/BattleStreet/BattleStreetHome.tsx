import { PACK_COST } from '../../logic/battleStreetRewards';
import { BadgeIcon } from './BadgeIcon';

interface Props {
  badges: number;
  onFindOpponent: () => void;
  onEat: () => void;
  onPack: () => void;
  onBackToTitle: () => void;
}

/** バトルストリートのホーム画面（バッジ表示＋3つの選択肢） */
export function BattleStreetHome({ badges, onFindOpponent, onEat, onPack, onBackToTitle }: Props) {
  return (
    <div className="flex flex-col gap-4 pb-10">
      <header className="flex items-center justify-between">
        <button onClick={onBackToTitle} className="rounded-lg bg-zinc-800 px-3 py-1.5 text-xs font-bold text-white hover:bg-zinc-700">
          ← タイトルへ
        </button>
        <h1 className="text-sm font-extrabold tracking-wide text-white">バトルストリート</h1>
        <span style={{ width: 68 }} />
      </header>

      <div className="flex flex-col items-center gap-1 rounded-xl border border-amber-500/40 bg-amber-500/[0.08] p-4">
        <span className="text-[11px] text-zinc-400">所持バッジ</span>
        <span className="flex items-center gap-2 text-3xl font-black text-amber-400">
          <BadgeIcon size={32} />
          {badges}
        </span>
      </div>

      <div className="flex flex-col gap-3">
        <button
          onClick={onFindOpponent}
          disabled={badges < 1}
          className={`rounded-xl py-3 text-sm font-extrabold ${
            badges >= 1 ? 'bg-rose-500 text-white hover:bg-rose-400' : 'cursor-not-allowed bg-zinc-800 text-zinc-500'
          }`}
        >
          対戦相手を探す
        </button>
        <button onClick={onEat} className="rounded-xl bg-zinc-800 py-3 text-sm font-extrabold text-white hover:bg-zinc-700">
          食事をする
        </button>
        <button
          onClick={onPack}
          disabled={badges < PACK_COST}
          className={`rounded-xl py-3 text-sm font-extrabold ${
            badges >= PACK_COST ? 'bg-sky-500 text-white' : 'cursor-not-allowed bg-zinc-800 text-zinc-500'
          }`}
        >
          パックに交換する（{PACK_COST}バッジ）
        </button>
      </div>
    </div>
  );
}
