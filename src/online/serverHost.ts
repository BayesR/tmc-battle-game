/**
 * オンライン対戦サーバーの接続先
 * ------------------------------------------------------------------
 * 既定は本番（Cloudflare）。開発ビルドでだけ、URLの ?server=localhost:8787 で接続先を切り替えられる
 * （公開版でこれを許すと、悪意のあるリンクで別のサーバーに誘導できてしまうため、開発ビルド限定）。
 */
export const DEFAULT_ONLINE_HOST = 'tmc-online.tmc-fan.workers.dev';

export function resolveServerHost(search: string, isDevBuild: boolean): string {
  if (isDevBuild) {
    const override = new URLSearchParams(search).get('server');
    if (override && /^[a-z0-9.-]+(:\d{1,5})?$/i.test(override)) return override;
  }
  return DEFAULT_ONLINE_HOST;
}

/** ルームの接続URL。ローカル（localhost・127.0.0.1）だけ暗号化なし（ws）、それ以外は wss */
export function buildRoomSocketUrl(host: string, roomCode: string): string {
  const local = /^(localhost|127\.0\.0\.1)(:|$)/i.test(host);
  return `${local ? 'ws' : 'wss'}://${host}/parties/room/${roomCode}`;
}
