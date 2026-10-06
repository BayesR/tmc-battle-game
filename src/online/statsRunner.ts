import type { StatsReport } from './statsQueries';
import { parseWranglerD1Json, renderTable } from './statsFormat';

/**
 * 集計を実行して、表示用の文字列にする（運営者用）。
 * SQL を実際に実行する部分（exec）は外から渡す：本番では wrangler の d1 execute、テストでは SQLite。
 * 1つの集計が失敗しても、他の集計は続ける（失敗した数も返す）。
 */
export function runStatsReports(opts: {
  reports: StatsReport[];
  /** SQL を実行して、wrangler の `--json` と同じ形式の文字列を返す */
  exec: (sql: string) => string;
  nameOf: (cardId: string) => string | undefined;
}): { text: string; failures: number } {
  const lines: string[] = [];
  let failures = 0;
  for (const report of opts.reports) {
    lines.push(`■ ${report.title}`);
    try {
      const rows = parseWranglerD1Json(opts.exec(report.sql));
      lines.push(renderTable(rows, report.columns, opts.nameOf));
    } catch (err) {
      failures += 1;
      lines.push(`（取得できませんでした: ${err instanceof Error ? err.message : String(err)}）`);
    }
    lines.push('');
  }
  return { text: lines.join('\n'), failures };
}
