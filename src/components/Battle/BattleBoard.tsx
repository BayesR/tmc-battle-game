import { useEffect, useRef } from 'react';
import type { DeckCard } from '../../types/card';
import type { RoundRecord } from '../../types/game';
import { computeRoundEffects, type RoundEffect } from '../../logic/battleEffects';
import { CardView } from '../common/CardView';

type SlotOverride = 'up' | 'down' | undefined;

/** CardView内のCARD_WIDTH.boardと合わせておく */
const BOARD_SLOT_WIDTH = 96;
const BOARD_SLOT_GAP = 6; // gap-1.5 = 0.375rem = 6px

const RESULT_STAMP: Record<'WIN' | 'LOSE' | 'DRAW', { text: string; color: string }> = {
  WIN: { text: 'WIN', color: '#34d399' },
  LOSE: { text: 'LOSE', color: '#f43f5e' },
  DRAW: { text: 'DRAW', color: '#94a3b8' },
};

interface SlotProps {
  record: { selfCard: DeckCard; enemyCard: DeckCard; result: RoundRecord['result'] | null } | null;
  side: 'enemy' | 'self';
  override: SlotOverride;
  onClick?: () => void;
  roundEffect?: RoundEffect;
}

/** 盤面の1マス（表 or 裏でカード、まだ出ていなければ空き枠）。自分・相手ともに同じサイズで表示する */
function BoardSlot({ record, side, override, onClick, roundEffect }: SlotProps) {
  // CardView内のCARD_WIDTH.boardと合わせておく（空き枠のプレースホルダー用）
  const width = BOARD_SLOT_WIDTH;
  const height = Math.round(width * 1.4);

  if (!record) {
    return (
      <div
        className="shrink-0 rounded-xl border border-dashed"
        style={{ width, height, borderColor: 'rgba(255,255,255,0.18)', background: 'rgba(0,0,0,0.08)' }}
      />
    );
  }

  const card = side === 'enemy' ? record.enemyCard : record.selfCard;
  // 勝ち・引き分けは表、負けは裏で表示。overrideがある場合はそれに従う
  // （選択直後～Pull upまでは"down"で裏向き固定、Pull up直後～NEXTまでは"up"で両方表向き）
  let faceDown: boolean;
  if (override === 'up') faceDown = false;
  else if (override === 'down') faceDown = true;
  else {
    const winner = record.result?.winner;
    faceDown = side === 'enemy' ? winner === 'self' : winner === 'enemy';
  }

  // 勝敗スタンプ：表向きの間だけ「WIN/LOSE/DRAW」を盤面のカードに表示する
  let stampKey: 'WIN' | 'LOSE' | 'DRAW' | null = null;
  if (!faceDown && record.result) {
    if (record.result.winner === 'draw') stampKey = 'DRAW';
    else if (side === 'enemy') stampKey = record.result.winner === 'enemy' ? 'WIN' : 'LOSE';
    else stampKey = record.result.winner === 'self' ? 'WIN' : 'LOSE';
  }
  const stamp = stampKey ? RESULT_STAMP[stampKey] : null;

  // 裏向きでまだPull upしていない自分側のカードには「PULL UP」を表示し、タップを促す
  const isPendingSelfCard = override === 'down' && side === 'self';
  const stampText = stamp?.text ?? (isPendingSelfCard ? 'PULL UP' : null);
  const stampColor = stamp?.color ?? (isPendingSelfCard ? '#fbbf24' : undefined);

  return (
    <CardView
      card={card}
      size="board"
      faceDown={faceDown}
      stampText={stampText}
      stampColor={stampColor}
      roundEffect={roundEffect}
      onClick={onClick}
    />
  );
}

interface PendingCards {
  selfCard: DeckCard;
  enemyCard: DeckCard;
}

interface Props {
  board: RoundRecord[];
  /** Pull up直後（NEXTを押す前）のラウンドのインデックス。そのラウンドだけ両方表向きで公開する */
  revealIndex?: number;
  /** カード選択直後（Pull up前）に裏向きで置いておくプレビュー（自分・相手両方） */
  pendingCards?: PendingCards | null;
  /** 裏向きに置かれたカード（自分・相手）をタップした際にPull upを実行するハンドラ */
  onPullUp?: () => void;
}

/**
 * 対戦盤面（ブラウン基調のマット・斜め見下ろし式）。
 * 対戦で使われたカードはこの盤面に残り続け、サドンデス突入時にのみクリアされる（手札に戻る）。
 * 自分・相手のカードは同じサイズで表示する。画面幅が足りない場合は横スクロールするが、
 * 相手列・自分列は1つの共有スクロール領域にまとめてあり、常に一緒に動く（列がずれない）。
 */
export function BattleBoard({ board, revealIndex = -1, pendingCards = null, onPullUp }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const slots: { record: SlotProps['record']; override: SlotOverride; pending: boolean }[] = Array.from({
    length: 5,
  }).map((_, i) => {
    if (i < board.length) {
      return { record: board[i], override: i === revealIndex ? 'up' : undefined, pending: false };
    }
    if (i === board.length && pendingCards) {
      return {
        record: { selfCard: pendingCards.selfCard, enemyCard: pendingCards.enemyCard, result: null },
        override: 'down',
        pending: true,
      };
    }
    return { record: null, override: undefined, pending: false };
  });

  // 対戦が進むにつれて、最新の対戦（Pull up前ならプレビュー中のカード、それ以外は直近のラウンド）が
  // なるべく画面内に収まるよう、その位置までなめらかにスクロールする（最初は左端からスタート）
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const targetIndex = pendingCards ? board.length : Math.max(board.length - 1, 0);
    const targetRightEdge = targetIndex * (BOARD_SLOT_WIDTH + BOARD_SLOT_GAP) + BOARD_SLOT_WIDTH;
    const nextScrollLeft = Math.max(0, targetRightEdge - el.clientWidth);
    el.scrollTo({ left: nextScrollLeft, behavior: 'smooth' });
  }, [board.length, pendingCards]);

  // 対戦演出（雷／Root Counterの光／切り裂き爪）：直近公開中のラウンドにのみ適用される
  const roundEffects = computeRoundEffects(board, revealIndex);

  return (
    <div
      className="relative overflow-hidden rounded-2xl"
      style={{
        background: 'linear-gradient(180deg, #71502f 0%, #4d3520 55%, #2c1e12 100%)',
        boxShadow: 'inset 0 0 46px rgba(0,0,0,0.55), 0 10px 22px rgba(0,0,0,0.4)',
        padding: '16px 8px 20px',
      }}
    >
      {/* マットの布目テクスチャ */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'repeating-linear-gradient(45deg, rgba(255,255,255,0.025) 0 2px, transparent 2px 5px), repeating-linear-gradient(-45deg, rgba(0,0,0,0.05) 0 2px, transparent 2px 5px)',
        }}
      />

      {/* 相手列・自分列を1つの共有スクロール領域にまとめ、横スクロール時に両方が一緒に動くようにする */}
      <div ref={scrollRef} style={{ overflowX: 'auto', paddingBottom: 2 }}>
        <div style={{ position: 'relative', width: 'max-content', minWidth: '100%' }}>
          <div className="mb-2.5 flex justify-center gap-1.5" style={{ filter: 'brightness(0.82)' }}>
            {slots.map((s, i) => (
              <BoardSlot
                key={`e-${i}`}
                record={s.record}
                side="enemy"
                override={s.override}
                onClick={s.pending ? onPullUp : undefined}
                roundEffect={i === revealIndex ? roundEffects.enemy : null}
              />
            ))}
          </div>
          <div className="flex justify-center gap-1.5">
            {slots.map((s, i) => (
              <BoardSlot
                key={`s-${i}`}
                record={s.record}
                side="self"
                override={s.override}
                onClick={s.pending ? onPullUp : undefined}
                roundEffect={i === revealIndex ? roundEffects.self : null}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
