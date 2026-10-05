import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { OnlineClient, type ClientSnapshot } from '../online/client';

/**
 * オンライン対戦のルームに接続するフック。
 * 画面を離れる時に接続を止め、画面に戻ってきた時（モバイルでアプリを切り替えた後など）や、
 * ネットワークが復旧した時は、再接続の待ち時間を飛ばしてすぐ再接続する。
 */
export function useOnlineRoom(url: string, token: string): { client: OnlineClient; snapshot: ClientSnapshot } {
  const client = useMemo(() => new OnlineClient({ url, token }), [url, token]);

  useEffect(() => {
    client.start();
    const wake = () => {
      if (document.visibilityState === 'visible') client.reconnectNow();
    };
    document.addEventListener('visibilitychange', wake);
    window.addEventListener('online', wake);
    return () => {
      document.removeEventListener('visibilitychange', wake);
      window.removeEventListener('online', wake);
      client.stop();
    };
  }, [client]);

  const snapshot = useSyncExternalStore(client.subscribe, client.getSnapshot);
  return { client, snapshot };
}

/** サーバー時刻の期限までの残り秒数（期限がなければ null）。0.25秒ごとに更新する */
export function useCountdownSeconds(serverDeadline: number | null | undefined, client: OnlineClient): number | null {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (serverDeadline == null) return;
    const id = window.setInterval(() => setTick((t) => t + 1), 250);
    return () => window.clearInterval(id);
  }, [serverDeadline]);

  if (serverDeadline == null) return null;
  return Math.max(0, Math.ceil((client.toLocalTime(serverDeadline) - Date.now()) / 1000));
}
