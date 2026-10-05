import test from 'node:test';
import assert from 'node:assert/strict';
import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH, generateRoomCode, isValidRoomCode, normalizeRoomCode } from '../src/online/roomCode';
import { NAME_PREFIXES, NAME_SUFFIX, generateOnlineName } from '../src/online/names';
import { seededRandom } from './helpers';

test('ルームコード：6文字で、紛らわしい文字（I・L・O・0・1）を含まない', () => {
  assert.equal(ROOM_CODE_LENGTH, 6);
  for (const ch of 'ILO01') assert.ok(!ROOM_CODE_ALPHABET.includes(ch), ch);
  const rng = seededRandom(1);
  const seen = new Set<string>();
  for (let i = 0; i < 2000; i++) {
    const code = generateRoomCode(rng);
    assert.equal(code.length, 6);
    assert.ok(isValidRoomCode(code), code);
    seen.add(code);
  }
  assert.ok(seen.size > 1990, '十分にばらけている');
  // 乱数が端の値を返しても範囲外にならない
  assert.ok(isValidRoomCode(generateRoomCode(() => 0)));
  assert.ok(isValidRoomCode(generateRoomCode(() => 0.9999999)));
});

test('ルームコード：手入力の整形と、不正な形式の拒否', () => {
  assert.equal(normalizeRoomCode(' ab-cd 23 '), 'ABCD23');
  assert.equal(normalizeRoomCode('abc_def'), 'ABCDEF');
  for (const bad of ['', 'ABC', 'ABCDEFG', 'abcdef', 'ABCDE0', 'ABCDE1', 'ABCDEI', 'ABCDEL', 'ABCDEO', 'ABC DE', 123, null, undefined, {}]) {
    assert.equal(isValidRoomCode(bad), false, String(bad));
  }
  assert.equal(isValidRoomCode('ABCDEF'), true);
  assert.equal(isValidRoomCode('A2B3C4'), true);
});

test('表示名：「◯◯ジャナー」形式で、相手の名前とは必ず異なる', () => {
  const rng = seededRandom(5);
  for (let i = 0; i < 200; i++) {
    const a = generateOnlineName(rng);
    assert.ok(a.endsWith(NAME_SUFFIX));
    assert.ok(NAME_PREFIXES.some((p) => a === p + NAME_SUFFIX));
    assert.notEqual(generateOnlineName(rng, a), a);
  }
  // 乱数が固定値でも（全ての値で）相手と被らない
  for (let v = 0; v < 1; v += 0.01) {
    const avoid = generateOnlineName(() => v);
    assert.notEqual(generateOnlineName(() => v, avoid), avoid, `rng=${v}`);
  }
});
