/**
 * 接続を許可するサイト（Origin）の判定
 * ------------------------------------------------------------------
 * 許可リストの各項目は、完全一致のURL（例：https://tmc-battle-game.vercel.app）か、
 * `*` を含むパターン（例：https://tmc-battle-game-*-bayes-r.vercel.app）。
 * Vercelの確認用デプロイは、コミットごとに別のURLが発行されるため、パターンで許可できるようにしてある。
 *
 * 安全のための決まり：
 *   - `*` は「英小文字・数字・ハイフン」の1文字以上にだけ一致する（ドット・スラッシュ・コロンには一致しない）。
 *     そのため、別のドメインやサブドメイン、ポート違いに紛れ込めない
 *   - 全体が一致した時だけ許可する（前後に余計な文字があれば不一致）。スキーム（https）も一致が必要
 */

/** 設定値（カンマ区切り）を、許可リストにする */
export function parseAllowedOrigins(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

const WILDCARD = '[a-z0-9-]+';

function patternToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, WILDCARD);
  return new RegExp(`^${escaped}$`);
}

export function isOriginAllowed(origin: string, patterns: readonly string[]): boolean {
  for (const p of patterns) {
    if (!p.includes('*')) {
      if (origin === p) return true;
      continue;
    }
    if (patternToRegExp(p).test(origin)) return true;
  }
  return false;
}
