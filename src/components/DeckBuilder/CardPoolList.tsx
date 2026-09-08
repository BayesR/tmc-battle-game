import { useMemo, useState } from 'react';
import type { CardMaster, Legacy } from '../../types/card';
import { LEGACY_ORDER } from '../../types/card';
import { DECK_SIZE } from '../../logic/deckRules';
import { CardView } from '../common/CardView';
import { LegacyBadge } from '../common/LegacyBadge';

interface Props {
  pool: CardMaster[];
  selectedIds: Set<string>;
  onToggle: (card: CardMaster) => void;
}

const SELECT_CLASS = 'rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-white focus:outline-none';

/**
 * プレイヤーが手持ちカードプールから5枚選ぶためのグリッド。
 * 名前・Legacy・MP・PP・Void有無で絞り込みでき、
 * 表示順は「同Legacyでグループ化 → MP高い順 → PP合計値高い順」に統一している。
 */
export function CardPoolList({ pool, selectedIds, onToggle }: Props) {
  const [query, setQuery] = useState('');
  const [legacyFilter, setLegacyFilter] = useState<Legacy | 'ALL'>('ALL');
  const [mpFilter, setMpFilter] = useState<'ALL' | string>('ALL');
  const [ppFilter, setPpFilter] = useState<Legacy | 'ALL'>('ALL');
  const [voidOnly, setVoidOnly] = useState(false);

  const filtered = useMemo(() => {
    const list = pool.filter((c) => {
      if (legacyFilter !== 'ALL' && c.legacy !== legacyFilter) return false;
      if (mpFilter !== 'ALL' && c.monsterPride !== Number(mpFilter)) return false;
      if (ppFilter !== 'ALL' && !c.potentialPoints.some((pp) => pp.legacy === ppFilter)) return false;
      if (voidOnly && !c.hasVoid) return false;
      if (query && !c.name.toLowerCase().includes(query.toLowerCase())) return false;
      return true;
    });

    // 並び順：同Legacyでグループ化 → MP数値高い順 → PP合計値高い順
    const legacyRank = Object.fromEntries(LEGACY_ORDER.map((l, i) => [l, i])) as Record<Legacy, number>;
    const ppTotal = (c: CardMaster) => c.potentialPoints.reduce((sum, pp) => sum + pp.value, 0);
    return [...list].sort((a, b) => {
      if (legacyRank[a.legacy] !== legacyRank[b.legacy]) return legacyRank[a.legacy] - legacyRank[b.legacy];
      if (b.monsterPride !== a.monsterPride) return b.monsterPride - a.monsterPride;
      return ppTotal(b) - ppTotal(a);
    });
  }, [pool, query, legacyFilter, mpFilter, ppFilter, voidOnly]);

  const isFull = selectedIds.size >= DECK_SIZE;

  return (
    <div className="flex flex-col gap-3">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="モンスター名で検索"
        className="min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-sky-500"
      />

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] text-zinc-500">Legacy</span>
        <div className="flex gap-1">
          <button
            onClick={() => setLegacyFilter('ALL')}
            className={`rounded-full px-2 py-1 text-[11px] font-bold ${
              legacyFilter === 'ALL' ? 'bg-sky-500 text-white' : 'bg-zinc-800 text-zinc-400'
            }`}
          >
            全て
          </button>
          {LEGACY_ORDER.map((l) => (
            <button
              key={l}
              onClick={() => setLegacyFilter(l === legacyFilter ? 'ALL' : l)}
              className="rounded-full"
            >
              <LegacyBadge legacy={l} size="sm" />
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-xs">
        <label className="flex items-center gap-1.5">
          <span className="text-[11px] text-zinc-500">MP</span>
          <select
            value={mpFilter}
            onChange={(e) => setMpFilter(e.target.value)}
            className={SELECT_CLASS}
            style={{ fontSize: 12 }}
          >
            <option value="ALL">全て</option>
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-1.5">
          <span className="text-[11px] text-zinc-500">PP</span>
          <select
            value={ppFilter}
            onChange={(e) => setPpFilter(e.target.value as Legacy | 'ALL')}
            className={SELECT_CLASS}
            style={{ fontSize: 12 }}
          >
            <option value="ALL">全て</option>
            {LEGACY_ORDER.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </label>

        <button
          onClick={() => setVoidOnly((v) => !v)}
          className="rounded-lg border px-2.5 py-1.5 font-bold"
          style={{
            fontSize: 12,
            background: voidOnly ? '#c026d3' : '#27272a',
            color: voidOnly ? '#fff' : '#a1a1aa',
            borderColor: voidOnly ? '#c026d3' : '#3f3f46',
          }}
        >
          Void有り
        </button>
      </div>

      <p className="text-[11px] text-zinc-500">{filtered.length}件のカード（全{pool.length}件中）</p>

      <div className="grid grid-cols-3 gap-1 overflow-y-auto rounded-lg" style={{ maxHeight: '48vh', paddingRight: 2 }}>
        {filtered.map((card) => {
          const selected = selectedIds.has(card.id);
          const disabled = !selected && isFull;
          return (
            <CardView
              key={card.id}
              card={card}
              size="sm"
              selected={selected}
              disabled={disabled}
              onClick={() => onToggle(card)}
            />
          );
        })}
      </div>
    </div>
  );
}
