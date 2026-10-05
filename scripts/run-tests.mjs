// 依存パッケージを増やさずにTypeScriptのテストを動かす小さなランナー。
// 使い方: npm test   （tests/ 配下の *.test.ts を全て実行する）
//
// - typescript の transpileModule で .ts を都度変換して require する（型チェックはしない。型は npm run lint 側で確認）
// - 拡張子なしの import（'./compareCards' など）は、.ts を require.extensions に登録することで解決する
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

require.extensions['.ts'] = (module, filename) => {
  const source = fs.readFileSync(filename, 'utf8');
  const { outputText } = ts.transpileModule(source, {
    fileName: filename,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
  });
  module._compile(outputText, filename);
};

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
