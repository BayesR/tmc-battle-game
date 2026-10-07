import type { NpcCardMode } from '../../logic/npcCardMode';

interface Props {
  mode: NpcCardMode;
  onChange: (mode: NpcCardMode) => void;
  /** 切り替えで外れたカードがあった時の案内 */
  notice: string | null;
}

/** NPC対戦で使えるカードの切り替え：所持カード（標準）／全カード（練習） */
export function NpcCardModeToggle({ mode, onChange, notice }: Props) {
  const button = (value: NpcCardMode, label: string) => (
    <button
      type="button"
      data-testid={`card-mode-${value}`}
      aria-pressed={mode === value}
      onClick={() => onChange(value)}
      className={`flex-1 rounded-lg py-2 text-xs font-extrabold ${mode === value ? 'bg-sky-500 text-white' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'}`}
    >
      {label}
    </button>
  );

  return (
    <div className="rounded-xl border border-zinc-700 p-3" style={{ background: 'rgba(24,24,27,0.6)' }} data-testid="npc-card-mode">
      <p className="mb-2 text-[11px] font-bold text-zinc-300">使えるカード</p>
      <div className="flex gap-2">
        {button('owned', '所持カード')}
        {button('all', '全カード（練習）')}
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-zinc-500" data-testid="card-mode-hint">
        {mode === 'owned'
          ? 'バトルストリートで集めたカードだけで遊びます。'
          : '全てのカードで遊べます。ここで保存したデッキは、オンライン対戦の保存済みデッキと共通です（バトルストリートには影響しません）。'}
      </p>
      {notice && (
        <p className="mt-1 text-[11px] font-bold text-amber-300" data-testid="card-mode-notice">
          {notice}
        </p>
      )}
    </div>
  );
}
