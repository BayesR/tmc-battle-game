import { BadgeIcon } from './BadgeIcon';

interface Props {
  badges: number;
  onEat: (kind: 'takoyaki' | 'coffee') => void;
  message: string | null;
  onBack: () => void;
}

/** 食事イベント画面 */
export function EatView({ badges, onEat, message, onBack }: Props) {
  return (
    <div className="flex flex-col gap-4 pb-10">
      <header className="flex items-center justify-between">
        <button onClick={onBack} className="rounded-lg bg-zinc-800 px-3 py-1.5 text-xs font-bold text-white hover:bg-zinc-700">
          ← 戻る
        </button>
        <h1 className="text-sm font-extrabold tracking-wide text-white">食事をする</h1>
        <span style={{ width: 68 }} />
      </header>
      <p className="flex items-center justify-center gap-1.5 text-center text-xs text-zinc-400">
        所持バッジ：<BadgeIcon size={14} />
        {badges}
      </p>
      <div className="flex gap-3">
        <button onClick={() => onEat('takoyaki')} className="flex-1 rounded-xl bg-zinc-800 py-4 text-sm font-extrabold text-white hover:bg-zinc-700">
          🐙 たこ焼きを食べる
        </button>
        <button onClick={() => onEat('coffee')} className="flex-1 rounded-xl bg-zinc-800 py-4 text-sm font-extrabold text-white hover:bg-zinc-700">
          ☕ コーヒーを飲む
        </button>
      </div>
      {message && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-center">
          <p className="text-sm text-amber-200">{message}</p>
        </div>
      )}
    </div>
  );
}
