import type { CardMaster } from '../../types/card';
import { PACK_COST } from '../../logic/battleStreetRewards';
import { CardView } from '../common/CardView';
import { BadgeIcon } from './BadgeIcon';

export interface PackRevealEntry {
  card: CardMaster;
  isNew: boolean;
}

interface Props {
  badges: number;
  onOpen: () => void;
  packResult: PackRevealEntry[] | null;
  onBack: () => void;
}

/** パック開封画面 */
export function PackView({ badges, onOpen, packResult, onBack }: Props) {
  return (
    <div className="flex flex-col gap-4 pb-10">
      <header className="flex items-center justify-between">
        <button onClick={onBack} className="rounded-lg bg-zinc-800 px-3 py-1.5 text-xs font-bold text-white hover:bg-zinc-700">
          ← 戻る
        </button>
        <h1 className="text-sm font-extrabold tracking-wide text-white">パックに交換する</h1>
        <span style={{ width: 68 }} />
      </header>
      <p className="flex items-center justify-center gap-1.5 text-center text-xs text-zinc-400">
        所持バッジ：<BadgeIcon size={14} />
        {badges}
      </p>

      {!packResult && (
        <button
          onClick={onOpen}
          disabled={badges < PACK_COST}
          className={`rounded-xl py-4 text-sm font-extrabold ${
            badges >= PACK_COST ? 'bg-sky-500 text-white' : 'cursor-not-allowed bg-zinc-800 text-zinc-500'
          }`}
        >
          {PACK_COST}バッジでパックを購入
        </button>
      )}

      {packResult && (
        <div className="flex flex-col gap-3">
          <p className="text-center text-xs font-bold text-amber-300">パック開封結果！</p>
          <div className="grid grid-cols-3 gap-2">
            {packResult.map((entry, i) => (
              <div key={i} className="flex flex-col items-center gap-1">
                <CardView card={entry.card} size="sm" />
                {entry.isNew && <span className="rounded-full bg-amber-500 px-2 py-0.5 text-[9px] font-black text-black">NEW</span>}
              </div>
            ))}
          </div>
          <button onClick={onOpen} disabled={badges < PACK_COST} className="rounded-xl bg-zinc-800 py-2.5 text-xs font-bold text-white hover:bg-zinc-700">
            もう1パック開ける（{PACK_COST}バッジ）
          </button>
        </div>
      )}
    </div>
  );
}
