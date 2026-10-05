import test from 'node:test';
import assert from 'node:assert/strict';
import { validateOnlineDeck } from '../src/online/deck';
import { generateLevelTunedNpcDeck } from '../src/logic/npcDeckGenerator';
import { CARD_POOL, withSeededMath } from './helpers';

const validDeck = () => withSeededMath(7, () => generateLevelTunedNpcDeck(CARD_POOL, 'Lv2') ?? []);

test('カードプールのIDは全て一意（IDでカードを特定する前提が成り立つ）', () => {
  assert.equal(new Set(CARD_POOL.map((c) => c.id)).size, CARD_POOL.length);
});

test('正しいデッキは受理され、サーバーのカードプールの実体が返る', () => {
  const deck = validDeck();
  const result = validateOnlineDeck(deck.map((c) => c.id), CARD_POOL);
  assert.ok(result.ok);
  if (result.ok) {
    assert.equal(result.cards.length, 5);
    // 返るのはクライアントの申告ではなく、プール側のカードそのもの
    result.cards.forEach((c, i) => assert.strictEqual(c, CARD_POOL.find((p) => p.id === deck[i].id)));
  }
});

test('形式が不正なものは拒否される', () => {
  for (const bad of [null, undefined, 'abc', 123, {}, [1, 2, 3, 4, 5], [null, null, null, null, null]]) {
    assert.equal(validateOnlineDeck(bad, CARD_POOL).ok, false, JSON.stringify(bad));
  }
});

test('5枚以外・重複・存在しないIDは拒否される', () => {
  const ids = validDeck().map((c) => c.id);
  assert.equal(validateOnlineDeck(ids.slice(0, 4), CARD_POOL).ok, false, '4枚');
  assert.equal(validateOnlineDeck([...ids, ids[0]], CARD_POOL).ok, false, '6枚');
  assert.equal(validateOnlineDeck([ids[0], ids[0], ids[2], ids[3], ids[4]], CARD_POOL).ok, false, '重複');
  assert.equal(validateOnlineDeck([ids[0], ids[1], ids[2], ids[3], 'NOT-A-CARD'], CARD_POOL).ok, false, '存在しないID');
  // __proto__ などのオブジェクトの組み込みキーがIDとして通らない
  assert.equal(validateOnlineDeck([ids[0], ids[1], ids[2], ids[3], '__proto__'], CARD_POOL).ok, false, '__proto__');
});

test('BATTLE RULES違反（Monster Pride合計16以上）は拒否される', () => {
  const heavy = CARD_POOL.filter((c) => c.monsterPride >= 4 && c.legacy !== '聖' && c.legacy !== '邪' && !c.hasVoid).slice(0, 5);
  assert.equal(heavy.length, 5);
  const result = validateOnlineDeck(heavy.map((c) => c.id), CARD_POOL);
  assert.equal(result.ok, false);
});

test('BATTLE RULES違反（聖・邪・Voidが4枚以上）は拒否される', () => {
  const restricted = CARD_POOL.filter((c) => c.monsterPride === 1 && (c.legacy === '聖' || c.legacy === '邪' || c.hasVoid)).slice(0, 4);
  const filler = CARD_POOL.find((c) => c.monsterPride === 1 && c.legacy !== '聖' && c.legacy !== '邪' && !c.hasVoid);
  assert.ok(restricted.length === 4 && filler, 'テスト用カードが足りない');
  const result = validateOnlineDeck([...restricted, filler!].map((c) => c.id), CARD_POOL);
  assert.equal(result.ok, false);
});

test('ストーリーモードの所持カード制限とは無関係に、プール全体のカードが使える', () => {
  // 最も希少なカードを含むデッキでも、ルール内であれば受理される
  const rarest = CARD_POOL.filter((c) => c.battleStreetRarity === 'SSUR' || c.battleStreetRarity === 'SUR');
  assert.ok(rarest.length > 0);
  const base = withSeededMath(3, () => generateLevelTunedNpcDeck(CARD_POOL, 'Lv1') ?? []);
  const candidate = rarest.find((r) => {
    const deck = [r, ...base.filter((c) => c.id !== r.id).slice(0, 4)];
    return validateOnlineDeck(deck.map((c) => c.id), CARD_POOL).ok;
  });
  assert.ok(candidate, 'SUR/SSURを含む合法デッキが組めるはず');
});

test('重複は、他のルールに引っかからないデッキでも単独で拒否される', () => {
  // 聖・邪・Voidを含まず、Monster Pride合計も15以下 → 重複以外に違反がない
  const plain = CARD_POOL.filter((c) => c.monsterPride <= 2 && c.legacy !== '聖' && c.legacy !== '邪' && !c.hasVoid);
  assert.ok(plain.length >= 4);
  const [a, b, c, d] = plain;

  // 同じ内容のデッキを、重複なしなら受理されることを先に確認（テストの前提）
  assert.equal(validateOnlineDeck([a, b, c, d, plain[4]].map((x) => x.id), CARD_POOL).ok, true, '重複なしなら合法');

  const dup = validateOnlineDeck([a, a, b, c, d].map((x) => x.id), CARD_POOL);
  assert.equal(dup.ok, false);
  if (!dup.ok) assert.match(dup.errors.join(), /同じカード/, '重複が理由で拒否されている');
  assert.equal(validateOnlineDeck(Array(5).fill(a.id), CARD_POOL).ok, false, '同じカード5枚');
});
