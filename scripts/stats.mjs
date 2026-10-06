// 対戦ログの集計（運営者用）
// ------------------------------------------------------------------
// Cloudflare の D1 に記録された、匿名の対戦ログを集計して、表で表示する。
// カードごとの採用数・勝率、よく使われたデッキ、日別の試合数、終わり方の内訳が見られる。
//
//   npm run stats                  全ての集計を表示
//   npm run stats -- cards         カードごとの集計だけ（summary / reasons / cards / decks）
//   npm run stats -- --local       自分のPC上のデータベース（wrangler dev 用）を見る
//   npm run stats -- --dry         実行する SQL を表示するだけ（何も実行しない）
//   npm run stats -- --db 名前      データベース名を指定する（既定: tmc-online-logs）
//
// 事前に worker/ で `npx wrangler login` を済ませておくこと（手順は worker/README.md）。
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { registerTsHook } from './ts-hook.mjs';

const require = registerTsHook();
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { findReports } = require(path.join(root, 'src/online/statsQueries.ts'));
const { runStatsReports } = require(path.join(root, 'src/online/statsRunner.ts'));
const { buildCardLabeler } = require(path.join(root, 'src/online/statsFormat.ts'));
const pool = require(path.join(root, 'src/data/cardPool.json'));

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const dbIndex = args.indexOf('--db');
const dbName = dbIndex > -1 ? args[dbIndex + 1] : 'tmc-online-logs';
const target = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--db')[0];

const reports = findReports(target);
if (reports.length === 0) {
  console.error(`「${target}」という集計はありません。summary / reasons / cards / decks のどれか、または指定なし（全て）を使ってください。`);
  process.exit(1);
}

if (flag('--dry')) {
  for (const r of reports) console.log(`-- ${r.title}\n${r.sql};\n`);
  process.exit(0);
}

// カードは「名前（Legacy・MP・PP・Void）」の形で表示する（同じ名前の別のカードを区別するため）
const labelOf = buildCardLabeler(pool);
const exec = (sql) => {
  const result = spawnSync('npx', ['wrangler', 'd1', 'execute', dbName, flag('--local') ? '--local' : '--remote', '--json', '--command', sql], {
    cwd: path.join(root, 'worker'),
    encoding: 'utf8',
    maxBuffer: 50 * 1024 * 1024,
  });
  if (result.error) throw new Error(`wrangler を実行できませんでした: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`wrangler がエラーで終了しました。\n${(result.stderr || result.stdout || '').trim().slice(0, 600)}`);
  return result.stdout;
};

const { text, failures } = runStatsReports({ reports, exec, nameOf: labelOf });
console.log(text);
if (failures > 0) {
  console.error(`${failures}件の集計を取得できませんでした。データベースを作成していない、または wrangler にログインしていない可能性があります（手順は worker/README.md）。`);
  process.exit(1);
}
