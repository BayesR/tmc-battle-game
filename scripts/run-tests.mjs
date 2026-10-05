// 依存パッケージを増やさずにTypeScriptのテストを動かす小さなランナー。
// 使い方: npm test            （tests/ 配下の *.test.ts を全て実行する）
//         npm test -- room    （ファイル名に "room" を含むテストだけ実行する）
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { registerTsHook } from './ts-hook.mjs';

const require = registerTsHook();
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const testsDir = path.join(root, 'tests');
const filter = process.argv[2];
const files = fs
  .readdirSync(testsDir)
  .filter((f) => f.endsWith('.test.ts'))
  .filter((f) => !filter || f.includes(filter))
  .sort();

if (files.length === 0) {
  console.error('テストファイルが見つかりません:', testsDir);
  process.exit(1);
}
for (const f of files) require(path.join(testsDir, f));
