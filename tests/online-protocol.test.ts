import test from 'node:test';
import assert from 'node:assert/strict';
import { parseClientMessage } from '../src/online/protocol';
import { sanitizeDisplayName } from '../src/online/match';

test('正しいメッセージは解釈される', () => {
  assert.deepEqual(parseClientMessage('{"t":"hello","token":"abc123"}'), { t: 'hello', token: 'abc123' });
  assert.deepEqual(parseClientMessage('{"t":"hello","token":"abc","name":"タロウ","spectate":true}'), {
    t: 'hello', token: 'abc', name: 'タロウ', spectate: true,
  });
  assert.deepEqual(parseClientMessage('{"t":"submit_deck","cardIds":["a","b","c","d","e"]}'), {
    t: 'submit_deck', cardIds: ['a', 'b', 'c', 'd', 'e'],
  });
  assert.deepEqual(parseClientMessage('{"t":"pick","instanceId":"A:xyz"}'), { t: 'pick', instanceId: 'A:xyz' });
  assert.deepEqual(parseClientMessage('{"t":"ack_reveal"}'), { t: 'ack_reveal' });
  assert.deepEqual(parseClientMessage('{"t":"leave"}'), { t: 'leave' });
});

test('不正なメッセージは全て null になる', () => {
  const bad: unknown[] = [
    null, undefined, 42, {}, [], 'not json', '', '[]', 'null', '"str"',
    '{"t":123}', '{"t":"unknown"}', '{"t":"hello"}', '{"t":"hello","token":""}',
    '{"t":"hello","token":123}', `{"t":"hello","token":"${'x'.repeat(65)}"}`,
    '{"t":"hello","token":"a","name":123}', '{"t":"hello","token":"a","spectate":"yes"}',
    '{"t":"submit_deck"}', '{"t":"submit_deck","cardIds":"abc"}', '{"t":"submit_deck","cardIds":[1,2,3,4,5]}',
    `{"t":"submit_deck","cardIds":[${Array(11).fill('"a"').join(',')}]}`,
    '{"t":"pick"}', '{"t":"pick","instanceId":123}', '{"t":"pick","instanceId":""}',
    `{"t":"pick","instanceId":"${'x'.repeat(101)}"}`,
    'x'.repeat(5000),
  ];
  for (const input of bad) assert.equal(parseClientMessage(input), null, String(input).slice(0, 60));
});

test('余計なフィールドは取り除かれる（サーバー内部の状態を書き換える入口にならない）', () => {
  const msg = parseClientMessage('{"t":"pick","instanceId":"A:x","seat":"B","admin":true,"__proto__":{"x":1}}');
  assert.deepEqual(msg, { t: 'pick', instanceId: 'A:x' });
});

test('表示名の整形：制御文字の除去・前後の空白除去・文字数制限・空なら代替名', () => {
  assert.equal(sanitizeDisplayName('  タロウ  '), 'タロウ');
  assert.equal(sanitizeDisplayName('a\u0000b\u0007c\u200bd'), 'abcd');
  assert.equal(sanitizeDisplayName('x'.repeat(50)).length, 20);
  assert.equal(Array.from(sanitizeDisplayName('🎴'.repeat(30))).length, 20); // 絵文字は1文字として数える
  assert.equal(sanitizeDisplayName('   '), 'ジャナー');
  assert.equal(sanitizeDisplayName(123 as unknown), 'ジャナー');
  assert.equal(sanitizeDisplayName(undefined, '名無し'), '名無し');
});
