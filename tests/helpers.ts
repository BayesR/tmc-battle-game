import type { CardMaster } from '../src/types/card';
import rawCardPool from '../src/data/cardPool.json';

export const CARD_POOL = rawCardPool as CardMaster[];

/** 再現性のある疑似乱数（mulberry32）。テストで Math.random を差し替えるために使う */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Math.random を一時的に差し替えて fn を実行する */
export function withSeededMath<T>(seed: number, fn: () => T): T {
  const original = Math.random;
  Math.random = seededRandom(seed);
  try {
    return fn();
  } finally {
    Math.random = original;
  }
}
