import test from 'node:test';
import assert from 'node:assert/strict';
import { isOriginAllowed, parseAllowedOrigins } from '../src/online/origin';

const LIST = parseAllowedOrigins(
  'http://localhost:5173, https://tmc-battle-game.vercel.app,https://tmc-battle-game-git-online-battle-bayes-r.vercel.app,https://tmc-battle-game-*-bayes-r.vercel.app'
);

test('設定値（カンマ区切り）を、空白を除いて許可リストにする', () => {
  assert.equal(LIST.length, 4);
  assert.deepEqual(parseAllowedOrigins(undefined), []);
  assert.deepEqual(parseAllowedOrigins(''), []);
  assert.deepEqual(parseAllowedOrigins(' , ,a, '), ['a']);
});

test('完全一致のURLは許可される', () => {
  assert.ok(isOriginAllowed('http://localhost:5173', LIST));
  assert.ok(isOriginAllowed('https://tmc-battle-game.vercel.app', LIST));
  assert.ok(isOriginAllowed('https://tmc-battle-game-git-online-battle-bayes-r.vercel.app', LIST));
});

test('パターン：コミットごとに発行される確認用デプロイのURLも許可される', () => {
  assert.ok(isOriginAllowed('https://tmc-battle-game-duvn0y1np-bayes-r.vercel.app', LIST));
  assert.ok(isOriginAllowed('https://tmc-battle-game-git-feature-x-bayes-r.vercel.app', LIST));
});

test('パターン：別のアカウント・別のドメイン・別のポート・別のスキームには一致しない', () => {
  const bad = [
    'https://tmc-battle-game-duvn0y1np-someoneelse.vercel.app', // 別のアカウント
    'https://tmc-battle-game-a.b-bayes-r.vercel.app', // * がドットをまたぐ
    'https://tmc-battle-game-a-bayes-r.vercel.app.evil.example', // 後ろに別のドメイン
    'https://evil.example/https://tmc-battle-game-a-bayes-r.vercel.app', // 前に別のURL
    'https://evil.example#tmc-battle-game-a-bayes-r.vercel.app',
    'http://tmc-battle-game-a-bayes-r.vercel.app', // スキームが違う
    'https://tmc-battle-game-a-bayes-r.vercel.app:8443', // ポート付き
    'https://tmc-battle-game-a-bayes-r.vercel.app/', // 末尾のスラッシュ（Originには付かない形式）
    'https://tmc-battle-game--bayes-r.vercel.app', // * が空
    'https://tmc-battle-game-A_B-bayes-r.vercel.app', // 英小文字・数字・ハイフン以外
    'https://tmc-battle-game-a@evil.example-bayes-r.vercel.app',
    'https://tmc-battle-game-a/..-bayes-r.vercel.app',
    'https://tmc-battle-gameXa-bayes-r.vercel.app',
    'https://vercel.app',
    'null',
    '',
  ];
  for (const origin of bad) assert.equal(isOriginAllowed(origin, LIST), false, origin);
});

test('完全一致の項目は、前方一致・後方一致・大文字小文字違いでは通らない', () => {
  for (const origin of [
    'https://tmc-battle-game.vercel.app.evil.example',
    'https://evil.tmc-battle-game.vercel.app',
    'https://TMC-BATTLE-GAME.vercel.app',
    'http://localhost:5174',
    'http://localhost:51730',
  ]) {
    assert.equal(isOriginAllowed(origin, LIST), false, origin);
  }
});

test('正規表現の特殊文字を含む項目も、文字どおりに扱う（ドットが「任意の1文字」にならない）', () => {
  const list = parseAllowedOrigins('https://a.example,https://b-*-c.example');
  assert.equal(isOriginAllowed('https://aXexample', list), false);
  assert.equal(isOriginAllowed('https://b-x-cXexample', list), false);
  assert.equal(isOriginAllowed('https://b-x-c.example', list), true);
});

test('許可リストが空なら、何も許可しない（空の時に制限をかけない扱いは、呼び出し側が決める）', () => {
  assert.equal(isOriginAllowed('https://anything.example', []), false);
});
