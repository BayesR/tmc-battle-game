import { useState } from 'react';
import type { CardMaster, NpcLevel } from '../../types/card';
import { NPC_LEVELS } from '../../types/card';
import { CardView } from '../common/CardView';
import { OpponentPortrait } from '../Battle/OpponentPortrait';
import { DeckSummary } from './DeckSummary';
import { CardPoolList } from './CardPoolList';

export type NpcDeckMode = 'auto' | 'manual';

interface Props {
  level: NpcLevel;
  onLevelChange: (level: NpcLevel) => void;
  npcName: string;
  npcDeck: CardMaster[] | null;
  onRegenerate: () => void;
  mode: NpcDeckMode;
  onModeChange: (mode: NpcDeckMode) => void;
  pool: CardMaster[];
  manualSelectedIds: Set<string>;
  onManualToggle: (card: CardMaster) => void;
  manualCards: CardMaster[];
}

/**
 * NPCレベルの選択、自動生成されたNPCデッキのプレビュー、
 * および「自分で作成」モードでの相手デッキ手動構築。
 * Phase 2で性格モードを追加する際は、ここに性格選択UIを足す想定。
 */
export function NpcSetupPanel({
  level,
  onLevelChange,
  npcName,
  npcDeck,
  onRegenerate,
  mode,
  onModeChange,
  pool,
  manualSelectedIds,
  onManualToggle,
  manualCards,
}: Props) {
  const [showDeck, setShowDeck] = useState(false);

  return (
    <div className="rounded-xl border border-zinc-700 bg-zinc-900/60 p-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-bold text-white">対戦相手（NPC）</h3>
        {mode === 'auto' && npcDeck && <span className="text-xs text-zinc-400">{npcName}</span>}
      </div>

      <div className="mb-3 flex items-center gap-3">
        <OpponentPortrait level={level} size={56} />
        <div className="flex flex-wrap gap-1.5">
          {NPC_LEVELS.map((lv) => (
            <button
              key={lv}
              onClick={() => onLevelChange(lv)}
              disabled={lv === 'Lv5'}
              className={`rounded-lg px-2.5 py-1.5 text-xs font-bold transition ${
                level === lv
                  ? 'bg-rose-500 text-white'
                  : lv === 'Lv5'
                  ? 'cursor-not-allowed bg-zinc-800/50 text-zinc-600'
                  : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
              }`}
              title={lv === 'Lv5' ? 'Lv5は未使用（ボス級カード用に温存）' : 'NPCの対戦スタイル・見た目に影響します'}
            >
              {lv}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-3 flex gap-1.5">
        <button
          onClick={() => onModeChange('auto')}
          className={`flex-1 rounded-lg py-1.5 text-xs font-bold ${
            mode === 'auto' ? 'bg-sky-500 text-white' : 'bg-zinc-800 text-zinc-400'
          }`}
        >
          自動生成
        </button>
        <button
          onClick={() => onModeChange('manual')}
          className={`flex-1 rounded-lg py-1.5 text-xs font-bold ${
            mode === 'manual' ? 'bg-sky-500 text-white' : 'bg-zinc-800 text-zinc-400'
          }`}
        >
          自分で作成
        </button>
      </div>

      {mode === 'auto' && (
        <>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={onRegenerate}
              className="rounded-lg bg-zinc-800 px-3 py-1.5 text-xs font-bold text-white hover:bg-zinc-700"
            >
              🎲 NPCデッキを再抽選
            </button>
            {npcDeck && (
              <button
                onClick={() => setShowDeck((v) => !v)}
                className="rounded-lg bg-zinc-800 px-3 py-1.5 text-xs font-bold text-white hover:bg-zinc-700"
              >
                {showDeck ? 'デッキを隠す' : 'デッキを見る（テスト中）'}
              </button>
            )}
          </div>

          {!npcDeck && (
            <p className="mt-2 text-xs text-amber-400">
              このレベルのカードプールでは条件を満たすデッキが生成できませんでした。レベルを変えるか再抽選してください。
            </p>
          )}

          {npcDeck && showDeck && (
            <div className="mt-3 flex flex-wrap gap-1 border-t border-zinc-800 pt-3">
              {npcDeck.map((c) => (
                <CardView key={c.id} card={c} size="sm" />
              ))}
            </div>
          )}
        </>
      )}

      {mode === 'manual' && (
        <div className="flex flex-col gap-3 border-t border-zinc-800 pt-3">
          <p className="text-[11px] text-zinc-500">
            相手のデッキを自分で5枚選んで作成できます（BATTLE RULESは通常のデッキ構築と同じです）。
          </p>
          <DeckSummary
            title="相手のデッキ"
            selectedCards={manualCards}
            onRemove={(id) => onManualToggle(pool.find((c) => c.id === id)!)}
          />
          <CardPoolList pool={pool} selectedIds={manualSelectedIds} onToggle={onManualToggle} />
        </div>
      )}
    </div>
  );
}
