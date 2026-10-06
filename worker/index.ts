import { Server, routePartykitRequest, type Connection, type WSMessage } from 'partyserver';
import { Room as RoomLogic, type RoomSnapshot } from '../src/online/room';
import { deleteOldMatchLogs, parseRetentionDays, saveMatchLog, type D1Like } from '../src/online/matchLog';
import { isOriginAllowed, parseAllowedOrigins } from '../src/online/origin';
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
 *   - 試合が終わるたびに、運営者用の匿名の対戦ログを D1 に1行記録する（D1が無ければ記録しない。src/online/matchLog.ts）
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
  /** 対戦ログ（運営者用の匿名統計）の保存先（D1）。用意していなければ、ログは記録されない */
  DB?: D1Like;
  /** "false" にすると、D1があっても対戦ログを記録しない */
  LOG_MATCHES?: string;
  /** 対戦ログを残す日数（既定は90日。これより古い記録は、毎日の掃除で削除する） */
  LOG_RETENTION_DAYS?: string;
}

const pool = rawCardPool as CardMaster[];
const SNAPSHOT_KEY = 'snapshot';

export class Room extends Server {
  private logic!: RoomLogic;

  async onStart() {
    const env = this.env as Env;
    const saved = await this.ctx.storage.get<RoomSnapshot>(SNAPSHOT_KEY);
    // 対戦ログ：D1が用意されていて、止められていなければ、試合が終わるたびに1行記録する（失敗しても対戦には影響しない）
    const db = env.DB;
    const onMatchFinished =
      db && env.LOG_MATCHES !== 'false'
        ? (record: Parameters<typeof saveMatchLog>[1]) => {
            const saving = saveMatchLog(db, record).catch((err) => console.error('対戦ログの保存に失敗しました', err));
            this.ctx.waitUntil(saving);
          }
        : undefined;

    this.logic = new RoomLogic(
      { now: () => Date.now(), rng: Math.random, pool, allowSpectators: env.ALLOW_SPECTATORS === 'true', onMatchFinished },
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
        const allowed = parseAllowedOrigins(env.ALLOWED_ORIGINS);
        if (origin && allowed.length > 0 && !isOriginAllowed(origin, allowed)) return new Response('Forbidden', { status: 403 });
      },
      onBeforeRequest() {
        return new Response('Not found', { status: 404 }); // WebSocket以外のリクエストは受け付けない
      },
    });
    return routed ?? new Response('TMC online server\n', { status: 200, headers: { 'content-type': 'text/plain; charset=utf-8' } });
  },

  /** 毎日の掃除（wrangler.jsonc の triggers.crons）：保存期間を過ぎた対戦ログを削除する。D1が無ければ何もしない */
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    const db = env.DB;
    if (!db) return;
    ctx.waitUntil(
      deleteOldMatchLogs(db, Date.now(), parseRetentionDays(env.LOG_RETENTION_DAYS)).catch((err) =>
        console.error('古い対戦ログの削除に失敗しました', err)
      )
    );
  },
} satisfies ExportedHandler<Env>;
