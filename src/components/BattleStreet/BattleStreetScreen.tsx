import { useMemo, useState, type ReactNode } from 'react';
import type { CardMaster, NpcLevel } from '../../types/card';
import type { MatchState } from '../../types/game';
import { loadBattleStreetSave, persistBattleStreetSave, type BattleStreetSave } from '../../logic/battleStreetSave';
import { generateOpponentRoster, type BattleStreetOpponent } from '../../logic/opponentRoster';
import { openPack, rollRareWinReward, EAT_EVENT_SCENARIOS } from '../../logic/battleStreetRewards';
import { BattleScreen } from '../Battle/BattleScreen';
import { BattleStreetHome } from './BattleStreetHome';
import { OpponentRosterView } from './OpponentRosterView';
import { BattleSetupView } from './BattleSetupView';
import { BattleStreetResultView } from './BattleStreetResultView';
import { EatView } from './EatView';
import { PackView, type PackRevealEntry } from './PackView';

type Phase = 'home' | 'roster' | 'setup' | 'battle' | 'result' | 'eat' | 'pack';

interface ResultInfo {
  won: boolean;
  bet: number;
  cardReward: CardMaster | null;
  badgesAfter: number;
  matchState: MatchState;
}

interface Props {
  pool: CardMaster[];
  onBackToTitle: () => void;
}

/**
 * バトルストリート（賭け×収集メタゲーム）本体。
 * ホーム→対戦相手探し→賭け・デッキ選択→対戦→結果、のループと、食事・パックの各画面を管理する。
 */
export function BattleStreetScreen({ pool, onBackToTitle }: Props) {
  const [save, setSave] = useState<BattleStreetSave>(() => loadBattleStreetSave(pool));
  const [phase, setPhase] = useState<Phase>('home');
  const [roster, setRoster] = useState<BattleStreetOpponent[] | null>(null);
  const [selectedOpponent, setSelectedOpponent] = useState<BattleStreetOpponent | null>(null);
  const [battleSetup, setBattleSetup] = useState<{ bet: number; selfDeck: CardMaster[] } | null>(null);
  const [battleRematchKey, setBattleRematchKey] = useState(0);
  const [resultInfo, setResultInfo] = useState<ResultInfo | null>(null);
  const [eatMessage, setEatMessage] = useState<string | null>(null);
  const [packResult, setPackResult] = useState<PackRevealEntry[] | null>(null);

  const ownedPool = useMemo(() => pool.filter((c) => save.ownedCardIds.includes(c.id)), [pool, save.ownedCardIds]);

  function updateSave(next: BattleStreetSave) {
    setSave(next);
    persistBattleStreetSave(next);
  }

  function goHome() {
    setSelectedOpponent(null);
    setBattleSetup(null);
    setResultInfo(null);
    setEatMessage(null);
    setPackResult(null);
    setPhase('home');
    // roster はここではクリアしない（「1人と対戦するまで再抽選しない」ため。戦闘結果画面から
    // 戻る場合のみ handleResultContinue でクリアする）
  }

  function handleResultContinue() {
    setRoster(null); // 対戦が終わったので、次に「探す」を押した時は新しい4名を抽選する
    goHome();
  }

  function handleFindOpponent() {
    if (!roster) {
      setRoster(generateOpponentRoster(pool));
    }
    setPhase('roster');
  }

  function handleChooseOpponent(opp: BattleStreetOpponent) {
    setSelectedOpponent(opp);
    setPhase('setup');
  }

  function handleConfirmSetup(bet: number, selfDeck: CardMaster[]) {
    setBattleSetup({ bet, selfDeck });
    setBattleRematchKey((k) => k + 1);
    setPhase('battle');
  }

  function handleMatchOver(matchState: MatchState) {
    if (!selectedOpponent || !battleSetup) return;
    const won = matchState.matchWinner === 'self';
    const bet = battleSetup.bet;
    let cardReward: CardMaster | null = null;
    let nextOwned = save.ownedCardIds;
    if (won && selectedOpponent.isRare) {
      cardReward = rollRareWinReward(pool, save.ownedCardIds, bet);
      nextOwned = Array.from(new Set([...save.ownedCardIds, cardReward.id]));
    }
    const nextBadges = won ? save.badges + bet : save.badges - bet;
    updateSave({ badges: nextBadges, ownedCardIds: nextOwned });
    setResultInfo({ won, bet, cardReward, badgesAfter: nextBadges, matchState });
    setPhase('result');
  }

  function handleEat(kind: 'takoyaki' | 'coffee') {
    if (save.badges >= 1) {
      setEatMessage(kind === 'takoyaki' ? 'お腹が満たされた…疲れも吹き飛んだ気がする。' : '疲れが吹き飛んだ…一息つけた。');
    } else {
      const text = EAT_EVENT_SCENARIOS[Math.floor(Math.random() * EAT_EVENT_SCENARIOS.length)];
      setEatMessage(text);
      updateSave({ ...save, badges: save.badges + 1 });
    }
  }

  function handleOpenPack() {
    if (save.badges < 5) return;
    const cards = openPack(pool, save.ownedCardIds);
    const ownedSetSoFar = new Set<string>(save.ownedCardIds);
    const revealed: PackRevealEntry[] = cards.map((c) => {
      const isNew = !ownedSetSoFar.has(c.id);
      ownedSetSoFar.add(c.id);
      return { card: c, isNew };
    });
    updateSave({ badges: save.badges - 5, ownedCardIds: Array.from(ownedSetSoFar) });
    setPackResult(revealed);
  }

  let content: ReactNode = null;

  if (phase === 'home') {
    content = (
      <BattleStreetHome
        badges={save.badges}
        onFindOpponent={handleFindOpponent}
        onEat={() => {
          setEatMessage(null);
          setPhase('eat');
        }}
        onPack={() => {
          setPackResult(null);
          setPhase('pack');
        }}
        onBackToTitle={onBackToTitle}
      />
    );
  } else if (phase === 'roster' && roster) {
    content = <OpponentRosterView roster={roster} onChoose={handleChooseOpponent} onCancel={goHome} />;
  } else if (phase === 'setup' && selectedOpponent) {
    content = (
      <BattleSetupView
        opponent={selectedOpponent}
        badges={save.badges}
        ownedPool={ownedPool}
        onConfirm={handleConfirmSetup}
        onCancel={() => setPhase('roster')}
      />
    );
  } else if (phase === 'battle' && selectedOpponent && battleSetup) {
    if (!selectedOpponent.deck) {
      return (
        <div className="flex flex-col items-center gap-4 pt-10 text-center">
          <p className="text-sm text-amber-400">この対戦相手のデッキを生成できませんでした。相手を選び直してください。</p>
          <button onClick={() => setPhase('roster')} className="rounded-lg bg-zinc-800 px-4 py-2 text-xs font-bold text-white">
            戻る
          </button>
        </div>
      );
    }
    // 対戦画面は既存のNPC対戦UI（盤面デザイン）をそのまま使うため、お店の背景は重ねない
    return (
      <BattleScreen
        key={battleRematchKey}
        selfDeck={battleSetup.selfDeck}
        npc={{
          name: selectedOpponent.name,
          level: selectedOpponent.isRare ? 'Lv4' : (selectedOpponent.key as NpcLevel),
          personality: 'random',
        }}
        npcDeck={selectedOpponent.deck}
        onMatchOver={handleMatchOver}
      />
    );
  } else if (phase === 'result' && resultInfo) {
    content = <BattleStreetResultView {...resultInfo} onContinue={handleResultContinue} />;
  } else if (phase === 'eat') {
    content = <EatView badges={save.badges} onEat={handleEat} message={eatMessage} onBack={goHome} />;
  } else if (phase === 'pack') {
    content = <PackView badges={save.badges} onOpen={handleOpenPack} packResult={packResult} onBack={goHome} />;
  }

  if (!content) return null;

  // バトルストリート（対戦中を除く）の背景に、たこ焼き屋のグラフィックを画面全体で使用
  return (
    <>
      <div
        className="fixed inset-0"
        style={{
          backgroundImage: "url('/assets/battlestreet/shop_exterior.png')",
          backgroundSize: 'cover',
          backgroundPosition: 'center 25%',
          zIndex: 0,
        }}
      />
      <div
        className="fixed inset-0"
        style={{
          background: 'linear-gradient(180deg, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0.55) 45%, rgba(0,0,0,0.82) 100%)',
          zIndex: 0,
        }}
      />
      <div className="relative" style={{ zIndex: 1 }}>
        {content}
      </div>
    </>
  );
}
