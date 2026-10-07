import test from 'node:test';
import assert from 'node:assert/strict';
import {
  NPC_CARD_MODE_KEY,
  describeModeSwitch,
  keepUsableIds,
  loadNpcCardMode,
  parseNpcCardMode,
  poolForMode,
  saveNpcCardMode,
} from '../src/logic/npcCardMode';
import { deckOf } from './helpers';

const owned = deckOf('o', [1, 2, 3, 4]); // o1..o4
const full = [...owned, ...deckOf('f', [1, 2, 3])]; // o1..o4, f1..f3

class MemoryStorage {
  data = new Map<string, string>();
  getItem(k: string) {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.data.set(k, v);
  }
}
const broken = {
  getItem() {
    throw new Error('denied');
  },
  setItem() {
    throw new Error('denied');
  },
};

test('モードの読み取り：標準は「所持カード」。不正な値・未保存も標準', () => {
  assert.equal(parseNpcCardMode('all'), 'all');
  assert.equal(parseNpcCardMode('owned'), 'owned');
  for (const bad of [null, undefined, '', 'ALL', 'full', '1']) assert.equal(parseNpcCardMode(bad), 'owned', String(bad));
});

test('モードの保存と読み込み：最後に選んだほうが覚えられる。保存できない環境でも例外にならない', () => {
  const s = new MemoryStorage();
  assert.equal(loadNpcCardMode(s), 'owned', '初めては標準');
  saveNpcCardMode(s, 'all');
  assert.equal(s.data.get(NPC_CARD_MODE_KEY), 'all');
  assert.equal(loadNpcCardMode(s), 'all');
  saveNpcCardMode(s, 'owned');
  assert.equal(loadNpcCardMode(s), 'owned');

  assert.equal(loadNpcCardMode(broken), 'owned');
  assert.doesNotThrow(() => saveNpcCardMode(broken, 'all'));
  assert.equal(loadNpcCardMode(null), 'owned');
  assert.doesNotThrow(() => saveNpcCardMode(null, 'all'));
});

test('使えるカードのプール：所持カードか全カードかが切り替わる（元の配列は変わらない）', () => {
  assert.deepEqual(poolForMode('owned', owned, full).map((c) => c.id), ['o1', 'o2', 'o3', 'o4']);
  assert.deepEqual(poolForMode('all', owned, full).map((c) => c.id), ['o1', 'o2', 'o3', 'o4', 'f1', 'f2', 'f3']);
  const copy = poolForMode('all', owned, full);
  copy.pop();
  assert.equal(full.length, 7, '返された配列を変えても、元のプールは変わらない');
});

test('モードを切り替えた時のデッキ：新しいプールで使えるカードだけを、順番を保って残す', () => {
  assert.deepEqual(keepUsableIds(['f1', 'o2', 'f3', 'o1'], owned), ['o2', 'o1'], '全カード→所持：所持していないカードが外れる');
  assert.deepEqual(keepUsableIds(['o2', 'o1'], full), ['o2', 'o1'], '所持→全カード：全て残る');
  assert.deepEqual(keepUsableIds([], owned), []);
  assert.deepEqual(keepUsableIds(['zz'], owned), [], '存在しないIDは外れる');
  assert.deepEqual(keepUsableIds(['o1', 'o1', 'o2'], owned), ['o1', 'o2'], '重複は1枚にする');
  assert.deepEqual(keepUsableIds(['o1', 'o2', 'o3', 'o4', 'f1', 'f2'], full), ['o1', 'o2', 'o3', 'o4', 'f1'], '5枚まで');
});

test('切り替えの案内文：外れたカードがあった時だけ出る', () => {
  assert.equal(describeModeSwitch(['f1', 'o1'], ['o1'], 'owned'), '所持していないカード1枚を、デッキから外しました');
  assert.equal(describeModeSwitch(['f1', 'f2', 'o1'], ['o1'], 'owned'), '所持していないカード2枚を、デッキから外しました');
  assert.equal(describeModeSwitch(['o1', 'o2'], ['o1', 'o2'], 'owned'), null, '外れなければ案内なし');
  assert.equal(describeModeSwitch([], [], 'all'), null);
  assert.ok(describeModeSwitch(['a', 'b'], ['a'], 'all')?.includes('1枚'));
});
