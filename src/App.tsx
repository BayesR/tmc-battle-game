import { useEffect, useMemo, useState } from 'react';
import { Analytics } from '@vercel/analytics/react';
import type { CardMaster } from './types/card';
import type { MatchState, NpcProfile } from './types/game';
import { loadCardPool } from './data/loadCardPool';
import { loadBattleStreetSave } from './logic/battleStreetSave';
import { DeckBuilderScreen } from './components/DeckBuilder/DeckBuilderScreen';
import { BattleScreen } from './components/Battle/BattleScreen';
import { ResultScreen } from './components/Result/ResultScreen';
import { TitleScreen, type TopScreen } from './components/Title/TitleScreen';
import { RarityEffectsStyle } from './components/common/RarityEffects';
import { BattleStreetScreen } from './components/BattleStreet/BattleStreetScreen';
import { CardListScreen } from './components/CardList/CardListScreen';
import { OptionsScreen } from './components/Options/OptionsScreen';

type GamePhase = 'deckbuilder' | 'battle' | 'result';

interface MatchSetup {
  selfDeck: CardMaster[];
  npc: NpcProfile;
  npcDeck: CardMaster[];
}

/**
 * TMC Battle Game のトップレベルコンポーネント。
 * タイトル画面から バトルストリート／NPC対戦モード／所持カードリスト／オプション へ遷移する。
 *
 * NPC対戦モードのデッキ構築は、バトルストリートで集めた所持カード（`battleStreetSave`）に
 * 絞り込まれる。所持カードが5枚未満（初回プレイ時の異常系等）の場合は、一時的に全カードで
 * 遊べるようフォールバックする。
 */
function App() {
  const cardPool = useMemo(() => loadCardPool(), []);
  const [topScreen, setTopScreen] = useState<TopScreen>('title');

  const [phase, setPhase] = useState<GamePhase>('deckbuilder');
  const [matchSetup, setMatchSetup] = useState<MatchSetup | null>(null);
  const [finishedState, setFinishedState] = useState<MatchState | null>(null);
  const [rematchKey, setRematchKey] = useState(0);
  const [npcModePool, setNpcModePool] = useState<CardMaster[]>(() => cardPool);

  // NPC対戦モードに入るたびに、バトルストリートの所持カードで最新化する
  useEffect(() => {
    if (topScreen !== 'npc-mode') return;
    const save = loadBattleStreetSave(cardPool);
    const owned = cardPool.filter((c) => save.ownedCardIds.includes(c.id));
    setNpcModePool(owned.length >= 5 ? owned : cardPool);
    setPhase('deckbuilder');
    setMatchSetup(null);
    setFinishedState(null);
  }, [topScreen, cardPool]);

  function handleStartMatch(selfDeck: CardMaster[], npc: NpcProfile, npcDeck: CardMaster[]) {
    setMatchSetup({ selfDeck, npc, npcDeck });
    setFinishedState(null);
    setRematchKey((k) => k + 1);
    setPhase('battle');
  }

  function handleMatchOver(state: MatchState) {
    setFinishedState(state);
    setPhase('result');
  }

  function handleRematch() {
    if (!matchSetup) return;
    setFinishedState(null);
    setRematchKey((k) => k + 1);
    setPhase('battle');
  }

  function handleRebuildDeck() {
    setMatchSetup(null);
    setFinishedState(null);
    setPhase('deckbuilder');
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <RarityEffectsStyle />
      <Analytics />
      <div className="mx-auto max-w-2xl px-3 py-4">
        <div className="mb-3 text-center">
          <p className="text-[11px] font-bold tracking-[0.2em] text-zinc-500">TMC BATTLE GAME</p>
        </div>

        {topScreen === 'title' && <TitleScreen onNavigate={setTopScreen} />}

        {topScreen === 'battle-street' && (
          <BattleStreetScreen pool={cardPool} onBackToTitle={() => setTopScreen('title')} />
        )}

        {topScreen === 'card-list' && <CardListScreen pool={cardPool} onBack={() => setTopScreen('title')} />}

        {topScreen === 'options' && <OptionsScreen onBack={() => setTopScreen('title')} />}

        {topScreen === 'npc-mode' && (
          <>
            <div className="mb-3 flex items-center justify-between">
              <button
                onClick={() => setTopScreen('title')}
                className="rounded-lg bg-zinc-800 px-3 py-1.5 text-xs font-bold text-white hover:bg-zinc-700"
              >
                ← タイトルへ
              </button>
              <span className="text-[10px] text-zinc-600">NPC対戦モード（テスト中）</span>
              <span style={{ width: 68 }} />
            </div>

            {phase === 'deckbuilder' && (
              <DeckBuilderScreen pool={npcModePool} fullPool={cardPool} onStartMatch={handleStartMatch} />
            )}

            {phase === 'battle' && matchSetup && (
              <BattleScreen
                key={rematchKey}
                selfDeck={matchSetup.selfDeck}
                npc={matchSetup.npc}
                npcDeck={matchSetup.npcDeck}
                onMatchOver={handleMatchOver}
              />
            )}

            {phase === 'result' && finishedState && (
              <ResultScreen state={finishedState} onRematch={handleRematch} onRebuildDeck={handleRebuildDeck} />
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default App;
