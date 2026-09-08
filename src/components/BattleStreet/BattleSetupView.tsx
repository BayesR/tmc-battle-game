import { useMemo, useState } from 'react';
import type { CardMaster } from '../../types/card';
import type { BattleStreetOpponent } from '../../logic/opponentRoster';
import { getMaxBetForOpponent } from '../../logic/opponentRoster';
import { validateDeck } from '../../logic/deckRules';
import { loadSavedDecks, persistSavedDecks, type SavedDeck } from '../../logic/savedDecks';
import { DeckSummary } from '../DeckBuilder/DeckSummary';
import { CardPoolList } from '../DeckBuilder/CardPoolList';
import { SavedDeckPanel } from '../DeckBuilder/SavedDeckPanel';
import { BadgeIcon } from './BadgeIcon';

interface Props {
  opponent: BattleStreetOpponent;
  badges: number;
  ownedPool: CardMaster[];
  onConfirm: (bet: number, selfDeck: CardMaster[]) => void;
  onCancel: () => void;
}

/**
 * 賭けバッジ数の申告＋自分のデッキ構築（所持カードのみ）。
 * 保存済みデッキ（NPC対戦モードと共通のlocalStorage）の読み込み・保存にも対応する。
 */
export function BattleSetupView({ opponent, badges, ownedPool, onConfirm, onCancel }: Props) {
  const levelCap = getMaxBetForOpponent(opponent);
  const maxBet = Math.min(badges, levelCap);
  const [bet, setBet] = useState(() => Math.max(1, Math.min(1, maxBet)));
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [savedDecks, setSavedDecks] = useState<SavedDeck[]>(() => loadSavedDecks());

  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const selectedCards = useMemo(
    () => selectedIds.map((id) => ownedPool.find((c) => c.id === id)!).filter(Boolean),
    [selectedIds, ownedPool]
  );
  const validation = validateDeck(selectedCards);
  const betValid = bet >= 1 && bet <= maxBet;
  const canConfirm = validation.isValid && betValid;

  function toggleCard(card: CardMaster) {
    setSelectedIds((prev) => {
      if (prev.includes(card.id)) return prev.filter((id) => id !== card.id);
      if (prev.length >= 5) return prev;
      return [...prev, card.id];
    });
  }

  function handleSaveDeck(name: string) {
    if (!validation.isValid || !name) return;
    const newDeck: SavedDeck = { id: `${Date.now()}`, name, cardIds: selectedIds };
    const next = [...savedDecks, newDeck];
    setSavedDecks(next);
    persistSavedDecks(next);
  }

  function handleLoadDeck(deck: SavedDeck) {
    // バトルストリートでは所持カードのみ選択可能なため、所持していないカードは除外する
    setSelectedIds(deck.cardIds.filter((id) => ownedPool.some((c) => c.id === id)));
  }

  function handleDeleteDeck(id: string) {
    const next = savedDecks.filter((d) => d.id !== id);
    setSavedDecks(next);
    persistSavedDecks(next);
  }

  return (
    <div className="flex flex-col gap-4 pb-24">
      <header className="flex items-center justify-between">
        <button onClick={onCancel} className="rounded-lg bg-zinc-800 px-3 py-1.5 text-xs font-bold text-white hover:bg-zinc-700">
          ← 戻る
        </button>
        <h1 className="text-sm font-extrabold tracking-wide text-white">対 {opponent.name}</h1>
        <span style={{ width: 68 }} />
      </header>

      <div className="rounded-xl border border-zinc-700 bg-zinc-900/60 p-3">
        <p className="mb-1 flex items-center gap-1.5 text-xs font-bold text-zinc-300">
          賭けるバッジ数（所持：<BadgeIcon size={14} />
          {badges}）
        </p>
        <p className="mb-2 text-[11px] text-zinc-500">
          {opponent.isRare ? 'この相手には賭け上限がありません' : `この相手（${opponent.key}）には最大${levelCap}バッジまで賭けられます`}
        </p>
        <div className="flex items-center gap-2">
          <button onClick={() => setBet((b) => Math.max(1, b - 1))} className="rounded-lg bg-zinc-700 px-3 py-1.5 text-sm font-bold text-white">
            −
          </button>
          <input
            type="number"
            value={bet}
            onChange={(e) => setBet(Math.max(1, Math.min(maxBet, Number(e.target.value) || 1)))}
            className="w-20 rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-center text-sm font-bold text-white"
          />
          <button onClick={() => setBet((b) => Math.min(maxBet, b + 1))} className="rounded-lg bg-zinc-700 px-3 py-1.5 text-sm font-bold text-white">
            ＋
          </button>
          <button onClick={() => setBet(maxBet)} className="ml-auto rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-bold text-black">
            全額
          </button>
        </div>
        {!betValid && <p className="mt-2 text-[11px] text-rose-400">1〜{maxBet}の範囲で入力してください</p>}
      </div>

      <DeckSummary title="自分のデッキ" selectedCards={selectedCards} onRemove={(id) => toggleCard(ownedPool.find((c) => c.id === id)!)} />

      <SavedDeckPanel
        savedDecks={savedDecks}
        currentIsValid={validation.isValid}
        onSave={handleSaveDeck}
        onLoad={handleLoadDeck}
        onDelete={handleDeleteDeck}
      />

      <CardPoolList pool={ownedPool} selectedIds={selectedIdSet} onToggle={toggleCard} />

      <div className="fixed inset-x-0 bottom-0 border-t border-zinc-800 bg-black/90 p-3 backdrop-blur">
        <button
          onClick={() => onConfirm(bet, selectedCards)}
          disabled={!canConfirm}
          className={`mx-auto block w-full max-w-md rounded-xl py-3 text-center text-sm font-extrabold tracking-wide ${
            canConfirm ? 'bg-rose-500 text-white' : 'cursor-not-allowed bg-zinc-800 text-zinc-500'
          }`}
        >
          対戦開始
        </button>
      </div>
    </div>
  );
}
