import { useEffect, useMemo, useState } from 'react';
import type { CardMaster, NpcLevel } from '../../types/card';
import type { NpcProfile } from '../../types/game';
import { validateDeck } from '../../logic/deckRules';
import { generateLevelTunedNpcDeck, generateNpcName } from '../../logic/npcDeckGenerator';
import { loadSavedDecks, persistSavedDecks, type SavedDeck } from '../../logic/savedDecks';
import { CardPoolList } from './CardPoolList';
import { DeckSummary } from './DeckSummary';
import { NpcSetupPanel, type NpcDeckMode } from './NpcSetupPanel';
import { SavedDeckPanel } from './SavedDeckPanel';

interface Props {
  pool: CardMaster[];
  /** 対戦相手（NPC）のデッキ生成・手動作成に使う、所持カード制限のない全カードプール */
  fullPool: CardMaster[];
  onStartMatch: (selfDeck: CardMaster[], npc: NpcProfile, npcDeck: CardMaster[]) => void;
}

export function DeckBuilderScreen({ pool, fullPool, onStartMatch }: Props) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [npcLevel, setNpcLevel] = useState<NpcLevel>('Lv1');
  const [npcDeck, setNpcDeck] = useState<CardMaster[] | null>(() => generateLevelTunedNpcDeck(fullPool, 'Lv1'));
  const [npcName, setNpcName] = useState(() => generateNpcName('Lv1'));
  const [npcMode, setNpcMode] = useState<NpcDeckMode>('auto');
  const [npcManualIds, setNpcManualIds] = useState<string[]>([]);
  const [savedDecks, setSavedDecks] = useState<SavedDeck[]>(() => loadSavedDecks());

  // 対戦終了後にこの画面へ戻ってきたときなど、常に画面の一番上から表示する
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, []);

  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const selectedCards = useMemo(
    () => selectedIds.map((id) => pool.find((c) => c.id === id)!).filter(Boolean),
    [selectedIds, pool]
  );

  const npcManualIdSet = useMemo(() => new Set(npcManualIds), [npcManualIds]);
  const npcManualCards = useMemo(
    () => npcManualIds.map((id) => fullPool.find((c) => c.id === id)!).filter(Boolean),
    [npcManualIds, fullPool]
  );

  const validation = validateDeck(selectedCards);
  const npcManualValidation = validateDeck(npcManualCards);
  const npcReady = npcMode === 'auto' ? npcDeck !== null : npcManualValidation.isValid;
  const canStart = validation.isValid && npcReady;
  const finalNpcDeck = npcMode === 'auto' ? npcDeck : npcManualCards;

  function toggleCard(card: CardMaster) {
    setSelectedIds((prev) => {
      if (prev.includes(card.id)) return prev.filter((id) => id !== card.id);
      if (prev.length >= 5) return prev;
      return [...prev, card.id];
    });
  }

  function toggleNpcManualCard(card: CardMaster) {
    setNpcManualIds((prev) => {
      if (prev.includes(card.id)) return prev.filter((id) => id !== card.id);
      if (prev.length >= 5) return prev;
      return [...prev, card.id];
    });
  }

  function regenerateNpc(level: NpcLevel = npcLevel) {
    setNpcDeck(generateLevelTunedNpcDeck(fullPool, level));
    setNpcName(generateNpcName(level));
  }

  function handleLevelChange(level: NpcLevel) {
    setNpcLevel(level);
    regenerateNpc(level);
  }

  function handleStart() {
    if (!canStart || !finalNpcDeck) return;
    onStartMatch(
      selectedCards,
      { name: npcMode === 'auto' ? npcName : '自作デッキの相手', level: npcLevel, personality: 'random' },
      finalNpcDeck
    );
  }

  function handleSaveDeck(name: string) {
    if (!validation.isValid || !name) return;
    const newDeck: SavedDeck = { id: `${Date.now()}`, name, cardIds: selectedIds };
    const next = [...savedDecks, newDeck];
    setSavedDecks(next);
    persistSavedDecks(next);
  }

  function handleLoadDeck(deck: SavedDeck) {
    setSelectedIds(deck.cardIds.filter((id) => pool.some((c) => c.id === id)));
  }

  function handleDeleteDeck(id: string) {
    const next = savedDecks.filter((d) => d.id !== id);
    setSavedDecks(next);
    persistSavedDecks(next);
  }

  return (
    <div className="flex flex-col gap-4 pb-24">
      <header>
        <h1 className="text-lg font-extrabold tracking-wide text-white">デッキ構築</h1>
        <p className="text-xs text-zinc-400">
          カードプールから5枚選んでデッキを組みましょう。対戦相手のNPCレベルも選べます。
        </p>
      </header>

      <NpcSetupPanel
        level={npcLevel}
        onLevelChange={handleLevelChange}
        npcName={npcName}
        npcDeck={npcDeck}
        onRegenerate={() => regenerateNpc()}
        mode={npcMode}
        onModeChange={setNpcMode}
        pool={fullPool}
        manualSelectedIds={npcManualIdSet}
        onManualToggle={toggleNpcManualCard}
        manualCards={npcManualCards}
      />

      <DeckSummary
        title="自分のデッキ"
        selectedCards={selectedCards}
        onRemove={(id) => toggleCard(pool.find((c) => c.id === id)!)}
      />

      <SavedDeckPanel
        savedDecks={savedDecks}
        currentIsValid={validation.isValid}
        onSave={handleSaveDeck}
        onLoad={handleLoadDeck}
        onDelete={handleDeleteDeck}
      />

      <CardPoolList pool={pool} selectedIds={selectedIdSet} onToggle={toggleCard} />

      <div className="fixed inset-x-0 bottom-0 border-t border-zinc-800 bg-black/90 p-3 backdrop-blur">
        <button
          onClick={handleStart}
          disabled={!canStart}
          className={`mx-auto block w-full max-w-md rounded-xl py-3 text-center text-sm font-extrabold tracking-wide transition ${
            canStart
              ? 'bg-rose-500 text-white hover:bg-rose-400 active:scale-[0.98]'
              : 'cursor-not-allowed bg-zinc-800 text-zinc-500'
          }`}
        >
          対戦開始
        </button>
      </div>
    </div>
  );
}
