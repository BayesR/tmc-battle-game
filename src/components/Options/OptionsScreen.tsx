import { useState } from 'react';
import { resetBattleStreetSave } from '../../logic/battleStreetSave';
import { resetSavedDecks } from '../../logic/savedDecks';

interface Props {
  onBack: () => void;
}

/** オプション画面：最低限、セーブデータのリセットのみ用意 */
export function OptionsScreen({ onBack }: Props) {
  const [confirming, setConfirming] = useState(false);

  function handleReset() {
    resetBattleStreetSave();
    resetSavedDecks();
    window.location.reload();
  }

  return (
    <div className="flex flex-col gap-4 pb-10">
      <header className="flex items-center justify-between">
        <button onClick={onBack} className="rounded-lg bg-zinc-800 px-3 py-1.5 text-xs font-bold text-white hover:bg-zinc-700">
          ← タイトルへ
        </button>
        <h1 className="text-sm font-extrabold tracking-wide text-white">オプション</h1>
        <span style={{ width: 68 }} />
      </header>

      <div className="rounded-xl border border-zinc-700 bg-zinc-900/60 p-4">
        <h2 className="mb-2 text-sm font-bold text-white">セーブデータのリセット</h2>
        <p className="mb-3 text-xs text-zinc-400">
          バトルストリートの進行状況（バッジ・所持カード）と、保存済みデッキをすべて削除し、初期状態に戻します。この操作は取り消せません。
        </p>
        {!confirming ? (
          <button onClick={() => setConfirming(true)} className="rounded-lg bg-rose-600 px-3 py-2 text-xs font-bold text-white hover:bg-rose-500">
            リセットする
          </button>
        ) : (
          <div className="flex gap-2">
            <button onClick={handleReset} className="rounded-lg bg-rose-600 px-3 py-2 text-xs font-bold text-white hover:bg-rose-500">
              本当にリセットする
            </button>
            <button onClick={() => setConfirming(false)} className="rounded-lg bg-zinc-700 px-3 py-2 text-xs font-bold text-white hover:bg-zinc-600">
              キャンセル
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
