import { useMemo, useState } from 'react';
import type { CardMaster } from '../../types/card';
import { validateDeck } from '../../logic/deckRules';
import type { SavedDeck } from '../../logic/savedDecks';
import { loadOnlineDecks, persistOnlineDecks } from '../../online/onlineDecks';
import { CardPoolList } from '../DeckBuilder/CardPoolList';
import { DeckSummary } from '../DeckBuilder/DeckSummary';
import { SavedDeckPanel } from '../DeckBuilder/SavedDeckPanel';

interface Props {
  /** 使えるカード（オンライン対戦は全カード） */
  pool: CardMaster[];
  submitted: boolean;
  enemyName: string | null;
  enemySubmitted: boolean;
  /** デッキ構築の残り秒数（なければ null） */
  secondsLeft: number | null;
  /** サーバーに拒否された理由 */
  error: string | null;
  onSubmit: (cardIds: string[]) => void;
}

const formatClock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

/** オンライン対戦のデッキ構築：全カードから5枚を選んで提出する。保存済みデッキはストーリーモードとは別枠 */
export function OnlineDeckBuilder({ pool, submitted, enemyName, enemySubmitted, secondsLeft, error, onSubmit }: Props) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [savedDecks, setSavedDecks] = useState<SavedDeck[]>(() => loadOnlineDecks());

  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const selectedCards = useMemo(
    () => selectedIds.map((id) => pool.find((c) => c.id === id)).filter((c): c is CardMaster => c !== undefined),
    [selectedIds, pool]
  );
  const validation = validateDeck(selectedCards);

  function toggleCard(card: CardMaster) {
    setSelectedIds((prev) => {
      if (prev.includes(card.id)) return prev.filter((id) => id !== card.id);
      if (prev.length >= 5) return prev;
      return [...prev, card.id];
    });
  }

  function handleSave(name: string) {
    if (!validation.isValid || !name) return;
    const next = [...savedDecks, { id: `${Date.now()}`, name, cardIds: selectedIds }];
    setSavedDecks(next);
    persistOnlineDecks(next);
  }
  function handleLoad(deck: SavedDeck) {
    setSelectedIds(deck.cardIds.filter((id) => pool.some((c) => c.id === id)));
  }
  function handleDelete(id: string) {
    const next = savedDecks.filter((d) => d.id !== id);
    setSavedDecks(next);
    persistOnlineDecks(next);
  }

  const enemyStatus = enemySubmitted ? '提出済み' : 'デッキ構築中…';

  if (submitted) {
    return (
      <div className="flex flex-col gap-4">
        <div className="rounded-xl border border-emerald-700 bg-emerald-950/40 p-4 text-center">
          <p className="text-sm font-extrabold text-emerald-300">デッキを提出しました</p>
          <p className="mt-1 text-xs text-zinc-300">
            {enemyName ?? '相手'}：{enemyStatus}
          </p>
          {secondsLeft !== null && <p className="mt-1 text-[11px] text-zinc-500">相手の制限時間：あと {formatClock(secondsLeft)}</p>}
        </div>
        <DeckSummary title="提出したデッキ" selectedCards={selectedCards} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 pb-24">
      <header>
        <h1 className="text-lg font-extrabold tracking-wide text-white">デッキ構築</h1>
        <p className="text-xs text-zinc-400">全カードから5枚選んで提出してください。</p>
        <p className="mt-1 text-[11px] text-zinc-500">
          {enemyName ?? '相手'}：{enemyStatus}
          {secondsLeft !== null && (
            <span className={secondsLeft <= 30 ? 'ml-3 font-bold text-rose-400' : 'ml-3 text-zinc-400'}>
              制限時間：あと {formatClock(secondsLeft)}
            </span>
          )}
        </p>
      </header>

      <DeckSummary title="自分のデッキ" selectedCards={selectedCards} onRemove={(id) => setSelectedIds((p) => p.filter((x) => x !== id))} />

      <SavedDeckPanel savedDecks={savedDecks} currentIsValid={validation.isValid} onSave={handleSave} onLoad={handleLoad} onDelete={handleDelete} />

      <CardPoolList pool={pool} selectedIds={selectedIdSet} onToggle={toggleCard} />

      <div className="fixed inset-x-0 bottom-0 border-t border-zinc-800 p-3" style={{ background: 'rgba(0,0,0,0.92)' }}>
        {error && <p className="mx-auto mb-2 max-w-md text-center text-[11px] text-rose-400">{error}</p>}
        <button
          onClick={() => onSubmit(selectedIds)}
          disabled={!validation.isValid}
          className={`mx-auto block w-full max-w-md rounded-xl py-3 text-center text-sm font-extrabold tracking-wide ${
            validation.isValid ? 'bg-emerald-600 text-white hover:bg-emerald-500' : 'cursor-not-allowed bg-zinc-800 text-zinc-500'
          }`}
        >
          このデッキで対戦する
        </button>
      </div>
    </div>
  );
}
