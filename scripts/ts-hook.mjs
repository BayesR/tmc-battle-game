// .ts ファイルを、ビルドなしで Node から直接 require できるようにする小さな仕組み。
// テストランナー（run-tests.mjs）と開発用サーバー（dev-server.mjs）、通し確認（online-smoke.mjs）で共有する。
//   - typescript の transpileModule で .ts を都度変換する（型チェックはしない。型は npm run build / lint 側で確認）
//   - 拡張子なしの import（'./compareCards' など）は、.ts を require.extensions に登録することで解決する
import { createRequire } from 'node:module';
import fs from 'node:fs';

const require = createRequire(import.meta.url);
const ts = require('typescript');

let registered = false;
export function registerTsHook() {
  if (registered) return require;
  registered = true;
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
  return require;
}
