import { Server, routePartykitRequest, type Connection, type WSMessage } from 'partyserver';
import { Room as RoomLogic, type RoomSnapshot } from '../src/online/room';
import { isValidRoomCode } from '../src/online/roomCode';
import type { CardMaster } from '../src/types/card';
import rawCardPool from '../src/data/cardPool.json';

/**
 * Cloudflare（Durable Objects / PartyServer）への接続部分
 * ------------------------------------------------------------------
 * 試合のルールは src/online/room.ts にあり、ここはそれをCloudflareの仕組みにつなぐだけの薄い層。
 *   - 1つのルームコード = 1つの Durable Object（= 1つの Room ロジック）
 *   - 接続・メッセージ・切断を Room ロジックに渡し、Room ロジックが送りたいメッセージを接続に送る
 *   - 期限（制限時間・切断の猶予・終了後に閉じる時刻など）は Durable Object の alarm で起こす（Room ロジックの nextDeadline() に合わせる）
 *   - 状態は変更のたびに保存する。サーバーがメモリから消えても、保存した状態から復元して対戦を続けられる
 *
 * 接続URL：  wss://<ワーカーのホスト>/parties/room/<ルームコード>   （開発用サーバーと同じ形）
 */

interface Env {
  Room: DurableObjectNamespace;
  /** 接続を許可するサイトのURL（カンマ区切り）。空なら制限しない */
  ALLOWED_ORIGINS?: string;
  /** "true" で観戦を許可する（フェーズ1.5） */
  ALLOW_SPECTATORS?: string;
  /** "false" にすると、新しい接続を全て断る（緊急停止スイッチ。設定を直して再デプロイすると反映される） */
  ONLINE_ENABLED?: string;
}

const pool = rawCardPool as CardMaster[];
const SNAPSHOT_KEY = 'snapshot';

export class Room extends Server {
  private logic!: RoomLogic;

  async onStart() {
    const env = this.env as Env;
    const saved = await this.ctx.storage.get<RoomSnapshot>(SNAPSHOT_KEY);
    this.logic = new RoomLogic(
      { now: () => Date.now(), rng: Math.random, pool, allowSpectators: env.ALLOW_SPECTATORS === 'true' },
      {
        send: (connId, message) => this.getConnection(connId)?.send(JSON.stringify(message)),
        close: (connId) => this.getConnection(connId)?.close(1000, 'closed'),
      },
      saved ?? undefined
    );
    await this.commit();
  }

  async onConnect(connection: Connection) {
    this.logic.handleOpen(connection.id);
    // 何も送らない接続を、期限（10秒）で切るための目覚ましを設定する
    await this.commit();
  }

  async onMessage(connection: Connection, message: WSMessage) {
    if (typeof message !== 'string') return; // バイナリは受け付けない
    this.logic.handleMessage(connection.id, message);
    await this.commit();
  }

  async onClose(connection: Connection) {
    this.logic.handleClose(connection.id);
    await this.commit();
  }

  async onError(connection: Connection) {
    this.logic.handleClose(connection.id);
    await this.commit();
  }

  async onAlarm() {
    this.logic.tick();
    await this.commit();
  }

  /** 状態の保存と、次の期限に合わせた alarm の設定 */
  private async commit() {
    const finished = this.logic.getState().phase === 'finished';
    const hasConnections = [...this.getConnections()].length > 0;

    if (finished && !hasConnections) {
      // 終了済みで誰もいなければ、保存データごと片付ける
      await this.ctx.storage.deleteAlarm();
      await this.ctx.storage.deleteAll();
      return;
    }

    await this.ctx.storage.put(SNAPSHOT_KEY, this.logic.snapshot());
    const next = this.logic.nextDeadline();
    if (next === null) await this.ctx.storage.deleteAlarm();
    else await this.ctx.storage.setAlarm(next);
  }
}

function allowedOrigins(env: Env): string[] {
  return (env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const routed = await routePartykitRequest(request, env as unknown as Record<string, unknown>, {
      onBeforeConnect(req, lobby) {
        // 緊急停止スイッチ：新しい接続を全て断る
        if (env.ONLINE_ENABLED === 'false') return new Response('Online battles are temporarily unavailable', { status: 503 });
        // 決められた形式のルームコード以外は受け付けない（任意の名前で大量にルームを作られないように）
        if (!isValidRoomCode(lobby.name)) return new Response('Not found', { status: 404 });
        // ブラウザから、許可していないサイトを経由した接続を拒否する（Originの無い通常のクライアントは対象外）
        const origin = req.headers.get('Origin');
        const allowed = allowedOrigins(env);
        if (origin && allowed.length > 0 && !allowed.includes(origin)) return new Response('Forbidden', { status: 403 });
      },
      onBeforeRequest() {
        return new Response('Not found', { status: 404 }); // WebSocket以外のリクエストは受け付けない
      },
    });
    return routed ?? new Response('TMC online server\n', { status: 200, headers: { 'content-type': 'text/plain; charset=utf-8' } });
  },
} satisfies ExportedHandler<Env>;
