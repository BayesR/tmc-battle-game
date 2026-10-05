import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createInitialMatchState, matchReducer } from '../src/logic/battleEngine';
import { generateLevelTunedNpcDeck, generateReaperDeck } from '../src/logic/npcDeckGenerator';
import { toDeckCard } from '../src/types/card';
import type { NpcLevel } from '../src/types/card';
import type { MatchState } from '../src/types/game';
import { CARD_POOL, withSeededMath } from './helpers';

/**
 * NPC対戦の特性テスト（characterization test）。
 * 乱数を固定して NPC 対戦を多数回シミュレートし、各試合の「全ラウンドの内容と最終結果」を
 * フィクスチャに保存して照合する。リファクタリングで既存のNPC対戦の挙動が変わっていないことを守る。
 *
 * 意図的に挙動を変えた場合のみ、次のコマンドでフィクスチャを更新する:
 *   UPDATE_BASELINE=1 npm test
 */
const FIXTURE = path.join(__dirname, 'fixtures', 'npc-baseline.json');
const LEVELS: NpcLevel[] = ['Lv1', 'Lv2', 'Lv3', 'Lv4', 'Lv5'];

function playOneMatch(seed: number): string {
  return withSeededMath(seed, () => {
    const level = LEVELS[seed % LEVELS.length];
    const playerDeck = generateLevelTunedNpcDeck(CARD_POOL, 'Lv2') ?? [];
    const npcDeck = level === 'Lv5' ? generateReaperDeck(CARD_POOL) : (generateLevelTunedNpcDeck(CARD_POOL, level) ?? []);

    let state: MatchState = matchReducer(createInitialMatchState(), {
      type: 'INIT',
      selfHand: playerDeck.map(toDeckCard),
      enemyHand: npcDeck.map(toDeckCard),
      npc: { name: 'テスト', level, personality: 'random' },
    });

    for (let guard = 0; guard < 400 && state.phase !== 'match-over'; guard++) {
      if (state.phase === 'select' || state.phase === 'ready') {
        const pick = state.selfRemaining[Math.floor(Math.random() * state.selfRemaining.length)];
        state = matchReducer(state, { type: 'SELECT_SELF_CARD', instanceId: pick.instanceId });
        state = matchReducer(state, { type: 'PULL_UP' });
      } else if (state.phase === 'reveal') {
        state = matchReducer(state, { type: 'NEXT' });
      }
    }

    const fmt = (rs: MatchState['rounds']) =>
      rs.map((r) => `${r.selfCard.id}>${r.enemyCard.id}:${r.result.winner}:${r.result.selfPower}-${r.result.enemyPower}:${r.result.rootCounter ? 'RC' : ''}`).join('|');
    return `L=${level} W=${state.matchWinner} SD=${state.isSuddenDeath} N=${fmt(state.rounds)} S=${fmt(state.suddenDeathRounds)}`;
  });
}

test('NPC対戦の進行・勝敗が、リファクタ前のフィクスチャと一致する', () => {
  const digests: string[] = [];
  for (let seed = 1; seed <= 150; seed++) digests.push(playOneMatch(seed));

  if (process.env.UPDATE_BASELINE === '1') {
    fs.writeFileSync(FIXTURE, JSON.stringify(digests, null, 0));
    console.log(`baseline updated: ${digests.length} matches`);
    return;
  }
  const expected = JSON.parse(fs.readFileSync(FIXTURE, 'utf8')) as string[];
  assert.equal(digests.length, expected.length);
  digests.forEach((d, i) => assert.equal(d, expected[i], `seed ${i + 1} の結果が変わりました`));
});

test('特性テストが実際にサドンデスと各レベルをカバーしている', () => {
  const expected = JSON.parse(fs.readFileSync(FIXTURE, 'utf8')) as string[];
  assert.ok(expected.some((d) => d.includes('SD=true')), 'サドンデスに入った試合が1つも無い');
  for (const lv of LEVELS) assert.ok(expected.some((d) => d.startsWith(`L=${lv} `)), `${lv} の試合が無い`);
});
