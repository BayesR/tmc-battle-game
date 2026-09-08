import { useState } from 'react';
import type { SavedDeck } from '../../logic/savedDecks';

interface Props {
  savedDecks: SavedDeck[];
  currentIsValid: boolean;
  onSave: (name: string) => void;
  onLoad: (deck: SavedDeck) => void;
  onDelete: (id: string) => void;
}

/**
 * 自分のデッキの保存・読み込みパネル。
 * localStorageに複数スロット保存し、名前を付けて呼び出せる。
 * 名前の入力はインラインUIで行う（window.promptはサンドボックス化されたプレビュー環境では
 * ブロックされることがあるため使用しない）。
 */
export function SavedDeckPanel({ savedDecks, currentIsValid, onSave, onLoad, onDelete }: Props) {
  const [naming, setNaming] = useState(false);
  const [nameInput, setNameInput] = useState('');

  function startNaming() {
    setNameInput(`デッキ${savedDecks.length + 1}`);
    setNaming(true);
  }

  function confirmSave() {
    const trimmed = nameInput.trim();
    if (!trimmed) return;
    onSave(trimmed);
    setNaming(false);
    setNameInput('');
  }

  return (
    <div className="rounded-xl border border-zinc-700 p-3" style={{ background: 'rgba(24,24,27,0.6)' }}>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-bold text-white">保存済みデッキ</h3>
        {!naming && (
          <button
            onClick={startNaming}
            disabled={!currentIsValid}
            className="rounded-lg px-2.5 py-1.5 text-xs font-bold"
            style={{
              background: currentIsValid ? '#0ea5e9' : '#27272a',
              color: currentIsValid ? '#fff' : '#71717a',
              cursor: currentIsValid ? 'pointer' : 'not-allowed',
            }}
          >
            今のデッキを保存
          </button>
        )}
      </div>

      {naming && (
        <div className="mb-3 flex items-center gap-2">
          <input
            autoFocus
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') confirmSave();
              if (e.key === 'Escape') setNaming(false);
            }}
            placeholder="デッキの名前"
            maxLength={20}
            className="min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-xs text-white placeholder:text-zinc-500 focus:outline-none"
          />
          <button
            onClick={confirmSave}
            disabled={!nameInput.trim()}
            className="shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-bold"
            style={{
              background: nameInput.trim() ? '#0ea5e9' : '#27272a',
              color: nameInput.trim() ? '#fff' : '#71717a',
            }}
          >
            決定
          </button>
          <button
            onClick={() => setNaming(false)}
            className="shrink-0 rounded-lg bg-zinc-700 px-2.5 py-1.5 text-xs font-bold text-white"
          >
            やめる
          </button>
        </div>
      )}

      {savedDecks.length === 0 ? (
        <p className="text-xs text-zinc-500">
          保存されたデッキはまだありません。5枚選んでから「今のデッキを保存」を押してください。
        </p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {savedDecks.map((deck) => (
            <div
              key={deck.id}
              className="flex items-center justify-between gap-2 rounded-lg bg-zinc-800/60 px-2.5 py-1.5"
            >
              <span className="truncate text-xs font-bold text-zinc-200">{deck.name}</span>
              <div className="flex shrink-0 gap-1.5">
                <button
                  onClick={() => onLoad(deck)}
                  className="rounded-md bg-zinc-700 px-2 py-1 text-[11px] font-bold text-white hover:bg-zinc-600"
                >
                  読み込む
                </button>
                <button
                  onClick={() => onDelete(deck.id)}
                  className="rounded-md bg-zinc-700 px-2 py-1 text-[11px] font-bold text-rose-300 hover:bg-zinc-600"
                >
                  削除
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
