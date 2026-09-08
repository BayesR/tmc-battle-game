import { useCallback, useMemo, useReducer } from 'react';
import type { CardMaster } from '../types/card';
import { toDeckCard } from '../types/card';
import type { NpcProfile } from '../types/game';
import { createInitialMatchState, matchReducer } from '../logic/battleEngine';

/**
 * 対戦画面用のロジックフック。
 * DeckBuilderで確定した自分デッキ／NPCデッキを DeckCard 化して matchReducer を初期化する。
 */
export function useBattle(selfDeck: CardMaster[], npc: NpcProfile, npcDeck: CardMaster[]) {
  const [state, dispatch] = useReducer(
    matchReducer,
    undefined,
    () => createInitialMatchState()
  );

  const selfHandInit = useMemo(() => selfDeck.map(toDeckCard), [selfDeck]);
  const enemyHandInit = useMemo(() => npcDeck.map(toDeckCard), [npcDeck]);

  const start = useCallback(() => {
    dispatch({ type: 'INIT', selfHand: selfHandInit, enemyHand: enemyHandInit, npc });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selfHandInit, enemyHandInit, npc]);

  const selectCard = useCallback((instanceId: string) => {
    dispatch({ type: 'SELECT_SELF_CARD', instanceId });
  }, []);

  const pullUp = useCallback(() => {
    dispatch({ type: 'PULL_UP' });
  }, []);

  const next = useCallback(() => {
    dispatch({ type: 'NEXT' });
  }, []);

  return { state, start, selectCard, pullUp, next };
}
