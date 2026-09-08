import { useMemo, useState } from 'react';
import type { CardMaster, BattleStreetRarity } from '../../types/card';
import { LEGACY_ORDER } from '../../types/card';
import { loadBattleStreetSave } from '../../logic/battleStreetSave';
import { CardView } from '../common/CardView';

interface Props {
  pool: CardMaster[];
  onBack: () => void;
}

const TIER_ORDER: BattleStreetRarity[] = ['N', 'R', 'SR', 'UR', 'SUR', 'SSUR', 'SSSUR'];

type SortMode = 'legacy' | 'mp';

/**
 * 所持カードリスト画面：全カードをグリッド表示し、未所持のカードは暗く表示する。
 * レアリティ別のコンプリート率も表示する。並び順は「レガシー順」「モンプラ順」を切り替えられる。
 */
export function CardListScreen({ pool, onBack }: Props) {
  const [save] = useState(() => loadBattleStreetSave(pool));
  const [sortMode, setSortMode] = useState<SortMode>('legacy');
  const ownedSet = useMemo(() => new Set(save.ownedCardIds), [save]);

  const tierStats = TIER_ORDER.map((tier) => {
    const total = pool.filter((c) => c.battleStreetRarity === tier);
    if (total.length === 0) return null;
    const owned = total.filter((c) => ownedSet.has(c.id)).length;
    return { tier, owned, total: total.length };
  }).filter((s): s is { tier: BattleStreetRarity; owned: number; total: number } => s !== null);

  const totalOwned = pool.filter((c) => ownedSet.has(c.id)).length;

  const sortedPool = useMemo(() => {
    const legacyRank = Object.fromEntries(LEGACY_ORDER.map((l, i) => [l, i]));
    const list = [...pool];
    if (sortMode === 'mp') {
      list.sort(
        (a, b) =>
          b.monsterPride - a.monsterPride || legacyRank[a.legacy] - legacyRank[b.legacy] || a.name.localeCompare(b.name)
      );
    } else {
      list.sort(
        (a, b) =>
          legacyRank[a.legacy] - legacyRank[b.legacy] || b.monsterPride - a.monsterPride || a.name.localeCompare(b.name)
      );
    }
    return list;
  }, [pool, sortMode]);

  return (
    <div className="flex flex-col gap-4 pb-10">
      <header className="flex items-center justify-between">
        <button onClick={onBack} className="rounded-lg bg-zinc-800 px-3 py-1.5 text-xs font-bold text-white hover:bg-zinc-700">
          ← タイトルへ
        </button>
        <h1 className="text-sm font-extrabold tracking-wide text-white">所持カードリスト</h1>
        <span style={{ width: 68 }} />
      </header>

      <div className="rounded-xl border border-zinc-700 bg-zinc-900/60 p-3">
        <p className="mb-2 text-sm font-bold text-white">
          所持カード：{totalOwned} / {pool.length}種類（{Math.round((totalOwned / pool.length) * 100)}%）
        </p>
        <div className="flex flex-wrap gap-2 text-[11px]">
          {tierStats.map((s) => (
            <span key={s.tier} className="rounded-full bg-zinc-800 px-2 py-1 text-zinc-300">
              {s.tier}：{s.owned}/{s.total}
            </span>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-[11px] text-zinc-500">並び順</span>
        <button
          onClick={() => setSortMode('legacy')}
          className={`rounded-full px-3 py-1 text-xs font-bold ${
            sortMode === 'legacy' ? 'bg-sky-500 text-white' : 'bg-zinc-800 text-zinc-400'
          }`}
        >
          レガシー順
        </button>
        <button
          onClick={() => setSortMode('mp')}
          className={`rounded-full px-3 py-1 text-xs font-bold ${
            sortMode === 'mp' ? 'bg-sky-500 text-white' : 'bg-zinc-800 text-zinc-400'
          }`}
        >
          モンプラ順
        </button>
      </div>

      <div className="grid grid-cols-3 gap-1">
        {sortedPool.map((card) => {
          const owned = ownedSet.has(card.id);
          return (
            <div key={card.id} style={{ opacity: owned ? 1 : 0.25, filter: owned ? 'none' : 'grayscale(1)' }}>
              <CardView card={card} size="sm" />
            </div>
          );
        })}
      </div>
    </div>
  );
}
