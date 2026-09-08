import type { DeckCard } from '../../types/card';
import { HandCardView } from './HandCardView';

interface Props {
  hand: DeckCard[];
  selectedInstanceId: string | null;
  onSelect: (instanceId: string) => void;
  disabled?: boolean;
}

/** 自分の残り手札から次に出すカードを選ぶグリッド（簡易表示のHandCardViewを使用） */
export function HandSelector({ hand, selectedInstanceId, onSelect, disabled }: Props) {
  return (
    <div>
      <p className="mb-2 text-xs font-bold text-zinc-400">出すカードを選んでください</p>
      <div className="flex flex-wrap justify-center gap-2">
        {hand.map((card) => {
          const isSelected = selectedInstanceId === card.instanceId;
          return (
            <HandCardView
              key={card.instanceId}
              card={card}
              selected={isSelected}
              disabled={disabled}
              stampText={isSelected ? 'JANO' : null}
              stampColor="#38bdf8"
              onClick={() => onSelect(card.instanceId)}
            />
          );
        })}
      </div>
    </div>
  );
}
