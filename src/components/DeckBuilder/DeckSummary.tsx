import type { CardMaster } from '../../types/card';
import { DECK_SIZE, MONSTER_PRIDE_TOTAL_LIMIT, RESTRICTED_TOTAL_LIMIT, validateDeck } from '../../logic/deckRules';
import { CardView } from '../common/CardView';

interface Props {
  title: string;
  selectedCards: CardMaster[];
  onRemove?: (id: string) => void;
}

/** 選択中デッキの一覧＋ BATTLE RULES 適合状況の表示 */
export function DeckSummary({ title, selectedCards, onRemove }: Props) {
  const validation = validateDeck(selectedCards);

  return (
    <div className="rounded-xl border border-zinc-700 bg-zinc-900/60 p-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-bold text-white">{title}</h3>
        <span className="text-xs text-zinc-400">
          {selectedCards.length} / {DECK_SIZE}枚
        </span>
      </div>

      <div className="mb-3 grid grid-cols-2 gap-2 text-[11px]">
        <RuleStat
          label="Monster Pride合計"
          value={`${validation.monsterPrideTotal} / ${MONSTER_PRIDE_TOTAL_LIMIT}`}
          ok={validation.monsterPrideTotal <= MONSTER_PRIDE_TOTAL_LIMIT}
        />
        <RuleStat
          label="聖・邪・Void合計"
          value={`${validation.restrictedCount} / ${RESTRICTED_TOTAL_LIMIT}`}
          ok={validation.restrictedCount <= RESTRICTED_TOTAL_LIMIT}
        />
      </div>

      {selectedCards.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {selectedCards.map((c) => (
            <CardView key={c.id} card={c} size="sm" onClick={onRemove ? () => onRemove(c.id) : undefined} />
          ))}
        </div>
      ) : (
        <p className="text-xs text-zinc-500">下のカードプールから{DECK_SIZE}枚選んでください。</p>
      )}

      {validation.errors.length > 0 && selectedCards.length === DECK_SIZE && (
        <ul className="mt-2 space-y-0.5 text-[11px] text-rose-400">
          {validation.errors.map((e, i) => (
            <li key={i}>・{e}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function RuleStat({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <div className={`rounded-lg border px-2 py-1 ${ok ? 'border-zinc-700 text-zinc-300' : 'border-rose-500 text-rose-400'}`}>
      <div className="text-[10px] text-zinc-500">{label}</div>
      <div className="font-mono font-bold">{value}</div>
    </div>
  );
}
