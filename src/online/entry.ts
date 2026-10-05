import { isValidRoomCode, normalizeRoomCode } from './roomCode';
import type { StorageLike } from './session';

/**
 * オンライン対戦の入口（機能の切り替えと、招待リンク）
 * ------------------------------------------------------------------
 * 公開版のタイトル画面には、オンライン対戦のボタンを出さない。次のどれかの時だけ有効にする：
 *   - URLに ?online=1 がある（有効にして、そのタブでは以後も有効のまま）
 *   - URLに正しい形式の ?room=ルームコード がある（招待リンクから来た人）
 * ?online=0 で無効に戻せる。
 */
const FLAG_KEY = 'tmc_online_enabled';

export interface OnlineEntry {
  enabled: boolean;
  /** 招待リンクなどで指定された、正しい形式のルームコード（なければ null） */
  roomCode: string | null;
}

export function resolveOnlineEntry(search: string, storage: StorageLike | null): OnlineEntry {
  const params = new URLSearchParams(search);
  const online = params.get('online');
  const raw = params.get('room');
  const roomCode = raw !== null && isValidRoomCode(normalizeRoomCode(raw)) ? normalizeRoomCode(raw) : null;

  const write = (v: string | null) => {
    try {
      if (v === null) storage?.removeItem(FLAG_KEY);
      else storage?.setItem(FLAG_KEY, v);
    } catch {
      // noop
    }
  };

  if (online === '0') {
    write(null);
    return { enabled: false, roomCode: null };
  }
  if (online === '1' || roomCode !== null) {
    write('1');
    return { enabled: true, roomCode };
  }
  let stored: string | null = null;
  try {
    stored = storage?.getItem(FLAG_KEY) ?? null;
  } catch {
    // noop
  }
  return { enabled: stored === '1', roomCode: null };
}

/**
 * 友達に送る招待リンク。
 * 開発中にローカルのサーバーを使っている場合（serverOverride）は、リンクにもその指定を引き継ぐ
 * （引き継がないと、リンクを開いた側が本番のサーバーに接続してしまう）。
 */
export function buildInviteUrl(origin: string, pathname: string, roomCode: string, serverOverride: string | null = null): string {
  const server = serverOverride ? `&server=${encodeURIComponent(serverOverride)}` : '';
  return `${origin}${pathname}?online=1&room=${roomCode}${server}`;
}

/** 現在のURLのクエリ（?server= など他の指定は残す）に、ルームコードを反映した新しいクエリを作る */
export function searchWithRoom(search: string, roomCode: string | null): string {
  const params = new URLSearchParams(search);
  params.set('online', '1');
  if (roomCode) params.set('room', roomCode);
  else params.delete('room');
  return `?${params.toString()}`;
}
