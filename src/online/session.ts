/**
 * 端末（タブ）ごとの識別子（token）の保存と、暗号論的な乱数
 * ------------------------------------------------------------------
 * token は「同じ席に戻るための合言葉」。サーバーは token が一致した接続を、同じ席として扱う。
 *
 * 保存先は sessionStorage（タブごと）にする。localStorage（ブラウザ全体）にすると、
 * 同じブラウザで開いた2つ目のタブが1つ目と同じ token を使ってしまい、
 * 1人で2つのタブを使った動作確認（自分同士の対戦）ができなくなる。
 * 一方で sessionStorage は、リロードや、モバイルでタブが破棄された後の復帰では保たれる。
 */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const TOKEN_PREFIX = 'tmc_online_token_';

/** 0以上1未満の乱数（crypto 由来）。ルームコードは推測されにくいほうが安全なため */
export function secureRandom(): number {
  const buf = new Uint32Array(1);
  globalThis.crypto.getRandomValues(buf);
  return buf[0] / 4294967296;
}

export function createToken(): string {
  const c = globalThis.crypto as Crypto & { randomUUID?: () => string };
  if (typeof c.randomUUID === 'function') return c.randomUUID();
  const bytes = new Uint8Array(16);
  c.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** そのルームでの token を取り出す。なければ作って保存する（保存できない環境では、その場限りの token） */
export function getOrCreateToken(roomCode: string, storage: StorageLike | null, make: () => string = createToken): string {
  const key = TOKEN_PREFIX + roomCode;
  try {
    const existing = storage?.getItem(key);
    if (existing) return existing;
  } catch {
    // 読めない環境（プライベートモード等）
  }
  const token = make();
  try {
    storage?.setItem(key, token);
  } catch {
    // 保存できない場合は、リロードすると席に戻れないだけで、対戦自体はできる
  }
  return token;
}

export function clearToken(roomCode: string, storage: StorageLike | null): void {
  try {
    storage?.removeItem(TOKEN_PREFIX + roomCode);
  } catch {
    // noop
  }
}
