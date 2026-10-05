export type TopScreen = 'title' | 'battle-street' | 'npc-mode' | 'online' | 'card-list' | 'options';

interface Props {
  onNavigate: (screen: TopScreen) => void;
  /** true の時だけ「オンライン対戦」ボタンを表示する（公開版では出さない。URLの ?online=1 で有効にする） */
  showOnline?: boolean;
}

/** タイトル画面：バトルストリート／NPC対戦モード／所持カードリスト／オプションへの導線 */
export function TitleScreen({ onNavigate, showOnline = false }: Props) {
  return (
    <div className="flex flex-col items-center gap-8 pb-10 pt-16">
      <div className="text-center">
        <p
          className="text-3xl text-white"
          style={{ fontFamily: "'Russo One', sans-serif", letterSpacing: '0.04em', textShadow: '0 2px 10px rgba(0,0,0,0.5)' }}
        >
          TMC BATTLE GAME
        </p>
        <p className="mt-1.5 text-[10px] font-bold tracking-widest text-zinc-500">UNOFFICIAL FAN-MADE ・ BETA</p>
      </div>
      <div className="flex w-full max-w-xs flex-col gap-3">
        <button
          onClick={() => onNavigate('battle-street')}
          className="rounded-xl py-3 text-sm font-extrabold tracking-wide text-black"
          style={{ background: 'linear-gradient(to right, #fbbf24, #f59e0b)' }}
        >
          バトルストリート
        </button>
        <button
          onClick={() => onNavigate('npc-mode')}
          className="relative rounded-xl bg-rose-500 py-3 text-sm font-extrabold tracking-wide text-white"
        >
          NPC対戦モード
          <span className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-black/30 px-2 py-0.5 text-[10px]">
            テスト中
          </span>
        </button>
        {showOnline && (
          <button
            onClick={() => onNavigate('online')}
            className="relative rounded-xl bg-emerald-600 py-3 text-sm font-extrabold tracking-wide text-white hover:bg-emerald-500"
          >
            オンライン対戦
            <span className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-black/30 px-2 py-0.5 text-[10px]">
              β
            </span>
          </button>
        )}
        <button
          onClick={() => onNavigate('card-list')}
          className="rounded-xl bg-zinc-800 py-3 text-sm font-extrabold tracking-wide text-white hover:bg-zinc-700"
        >
          所持カードリスト
        </button>
        <button
          onClick={() => onNavigate('options')}
          className="rounded-xl bg-zinc-800 py-3 text-sm font-extrabold tracking-wide text-white hover:bg-zinc-700"
        >
          オプション
        </button>
      </div>
      <p className="max-w-xs text-center text-[10px] text-zinc-600">※NPC対戦モードのみテスト実装中です</p>
    </div>
  );
}
