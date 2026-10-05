/**
 * PartyServer の代用品（テスト専用）。
 * 公式ドキュメント（partyserver の README）に書かれている API の形だけを再現している。
 * 本物の Cloudflare 上の動作を保証するものではない（本物の確認は npm run smoke:online を使う）。
 */
export type WSMessage = string | ArrayBuffer | ArrayBufferView;

export class FakeConnection {
  sent: string[] = [];
  closed = false;
  constructor(public id: string) {}
  send(message: string) {
    this.sent.push(message);
  }
  close() {
    this.closed = true;
  }
}
export type Connection = FakeConnection;

export class Server {
  ctx: any;
  env: any;
  conns = new Map<string, FakeConnection>();
  constructor(ctx: any, env: any) {
    this.ctx = ctx;
    this.env = env;
  }
  getConnection(id: string) {
    return this.conns.get(id);
  }
  getConnections() {
    return this.conns.values();
  }
}

export async function routePartykitRequest(request: Request, _env: unknown, options: any): Promise<Response | null> {
  const url = new URL(request.url);
  const m = /^\/parties\/([^/]+)\/([^/]+)/.exec(url.pathname);
  if (!m) return null;
  const lobby = { party: m[1], name: m[2] };
  const hook = request.headers.get('Upgrade') === 'websocket' ? options?.onBeforeConnect : options?.onBeforeRequest;
  const res = await hook?.(request, lobby);
  if (res instanceof Response) return res;
  return new Response('stub: passed to the Durable Object', { status: 200 });
}
