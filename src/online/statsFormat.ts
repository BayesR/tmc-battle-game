/**
 * `wrangler d1 execute --json` の出力の読み取りと、結果を表にして表示する部分（運営者用の集計）。
 * 画面・通信・Cloudflareに依存しない純粋なコード。
 */

import type { CardMaster } from '../types/card';

/**
 * カードの表示名。同じ名前で別のカードがある（全162種類の名前のうち69）ため、名前の後ろに
 * 「Legacy・MP・PP・Void」を付けて区別する。例：CHARLIE THE FROG（環・MP1・愛+3・Void）
 * 現在のカードデータでは、この表記で全カードを区別できる（テストで確認している）。
 */
export function describeCard(card: Pick<CardMaster, 'name' | 'legacy' | 'monsterPride' | 'potentialPoints' | 'hasVoid'>): string {
  const pp = card.potentialPoints.filter((p) => p.legacy !== '未使用').map((p) => `${p.legacy}+${p.value}`);
  const parts = [card.legacy, `MP${card.monsterPride}`, ...pp, ...(card.hasVoid ? ['Void'] : [])];
  return `${card.name}（${parts.join('・')}）`;
}

/** カードID → 表示名を引く関数を作る（IDが無ければ undefined） */
export function buildCardLabeler(pool: readonly CardMaster[]): (cardId: string) => string | undefined {
  const labels = new Map(pool.map((c) => [c.id, describeCard(c)] as const));
  return (id) => labels.get(id);
}

/** wrangler の出力（JSON）から、結果の行を取り出す。形式が合わなければ例外にする */
export function parseWranglerD1Json(text: string): Record<string, unknown>[] {
  // 先頭に案内文などが付いていても読めるよう、最初の「[」または「{」から読み取る
  const start = text.search(/[[{]/);
  let data: unknown;
  try {
    data = JSON.parse(start > 0 ? text.slice(start) : text);
  } catch {
    throw new Error('wrangler の出力を読み取れませんでした（JSONではありません）');
  }
  // 形式は「結果のオブジェクトの配列」。念のため、オブジェクト単体の形式にも対応する
  const first = Array.isArray(data) ? data[0] : data;
  if (typeof first !== 'object' || first === null) throw new Error('wrangler の出力の形式が想定と違います');
  const rec = first as { success?: boolean; error?: unknown; results?: unknown };
  if (rec.success === false) throw new Error(`データベースの実行に失敗しました: ${JSON.stringify(rec.error ?? rec)}`);
  if (!Array.isArray(rec.results)) throw new Error('wrangler の出力に、結果（results）がありません');
  return rec.results.filter((r): r is Record<string, unknown> => typeof r === 'object' && r !== null);
}

/** 画面上の幅（全角・絵文字は2、半角は1）。日本語の表の列をそろえるために使う */
export function displayWidth(text: string): number {
  let w = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 0;
    const wide =
      (cp >= 0x1100 && cp <= 0x115f) ||
      (cp >= 0x2e80 && cp <= 0xa4cf) ||
      (cp >= 0xac00 && cp <= 0xd7a3) ||
      (cp >= 0xf900 && cp <= 0xfaff) ||
      (cp >= 0xfe30 && cp <= 0xfe6f) ||
      (cp >= 0xff00 && cp <= 0xff60) ||
      (cp >= 0xffe0 && cp <= 0xffe6) ||
      cp >= 0x1f300;
    w += wide ? 2 : 1;
  }
  return w;
}

const pad = (text: string, width: number, alignRight: boolean) => {
  const gap = Math.max(0, width - displayWidth(text));
  return alignRight ? ' '.repeat(gap) + text : text + ' '.repeat(gap);
};

export interface TableColumn {
  key: string;
  label: string;
}

/**
 * 結果を表にする。card 列はカード名に、deck_key 列は「1枚ずつ縦に並べたカード名」に置き換える（nameOf が名前を返せた場合）。
 * 数値は右寄せ、文字は左寄せ。複数行のセルがある表は、行と行の間に空行を入れる。結果が空なら、その旨を返す。
 */
export function renderTable(rows: Record<string, unknown>[], columns: TableColumn[], nameOf: (cardId: string) => string | undefined): string {
  if (rows.length === 0) return '（記録がありません）';

  const label = (id: string) => nameOf(id) ?? id;
  const cell = (key: string, value: unknown): string[] => {
    if (value === null || value === undefined) return ['-'];
    if (key === 'card') return [label(String(value))];
    if (key === 'deck_key') return String(value).split(',').map(label);
    return [String(value)];
  };

  const table = rows.map((row) => columns.map((c) => cell(c.key, row[c.key])));
  const numeric = columns.map((c) => rows.every((r) => r[c.key] === null || r[c.key] === undefined || typeof r[c.key] === 'number'));
  const widths = columns.map((c, i) => Math.max(displayWidth(c.label), ...table.flatMap((r) => r[i].map(displayWidth))));
  const multiLine = table.some((r) => r.some((lines) => lines.length > 1));

  const line = (cells: string[]) => cells.map((t, i) => pad(t, widths[i], numeric[i])).join('  ').trimEnd();
  const out: string[] = [line(columns.map((c) => c.label)), widths.map((w) => '-'.repeat(w)).join('  ')];
  table.forEach((cells, rowIndex) => {
    const height = Math.max(...cells.map((c) => c.length));
    for (let i = 0; i < height; i++) out.push(line(cells.map((c) => c[i] ?? '')));
    if (multiLine && rowIndex < table.length - 1) out.push('');
  });
  return out.join('\n');
}
