/**
 * ルームコード（招待リンクの末尾・口頭で伝える時のコード）
 * ------------------------------------------------------------------
 * 紛らわしい文字（I・L・O・0・1）を除いた31文字から6文字を作る（約8.9億通り）。
 * サーバーはこの形式に合わないルーム名への接続を拒否する（任意のルーム名で大量にルームを
 * 作られることを防ぐため）。
 */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_LENGTH = 6;

export function generateRoomCode(rng: () => number): string {
  let code = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    code += ROOM_CODE_ALPHABET[Math.min(ROOM_CODE_ALPHABET.length - 1, Math.floor(rng() * ROOM_CODE_ALPHABET.length))];
  }
  return code;
}

/** 手入力されたコードを整える（大文字化・空白とハイフンの除去） */
export function normalizeRoomCode(input: string): string {
  return input.toUpperCase().replace(/[\s\-_]/g, '');
}

const VALID = new RegExp(`^[${ROOM_CODE_ALPHABET}]{${ROOM_CODE_LENGTH}}$`);

export function isValidRoomCode(code: unknown): code is string {
  return typeof code === 'string' && VALID.test(code);
}
