import { parseServerMessage, type ClientMessage, type RoomTimers } from './protocol';
import type { OnlineView } from './types';

/**
 * オンライン対戦のクライアント（画面から独立した通信部分）
 * ------------------------------------------------------------------
 * - 接続、hello の送信、状態の受信、切断時の自動再接続（同じ token で同じ席に戻る）を受け持つ
 * - Reactには依存しない。useSyncExternalStore にそのまま渡せる（subscribe / getSnapshot）
 * - WebSocket と時計は外から差し込める。テストでは偽物を使い、実際の画面では window.WebSocket を使う
 */

export interface SocketLike {
  send(data: string): void;
  close(code?: number, reason?: string): void;
  onopen: ((ev?: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onclose: ((ev?: unknown) => void) | null;
  onerror: ((ev?: unknown) => void) | null;
}

export interface ClientClock {
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export type ClientStatus =
  | 'idle' // まだ開始していない／停止中
  | 'connecting' // 最初の接続中
  | 'open' // 接続済み
  | 'reconnecting' // 切断され、再接続を試みている
  | 'ended'; // これ以上つながらない（理由は endedReason）

export type EndedReason =
  | 'left' // 自分で退出した
  | 'finished' // 対戦が終了し、切断された
  | 'replaced' // 別の画面（タブ）が同じ席に接続した
  | 'room-full' // 満員
  | 'spectating-disabled' // 観戦は利用できない
  | 'room-closed' // 対戦の終了後に閉じられたルームに入ろうとした
  | 'gave-up'; // 再接続を諦めた

export interface ClientSnapshot {
  status: ClientStatus;
  endedReason: EndedReason | null;
  view: OnlineView | null;
  timers: RoomTimers | null;
  connected: { self: boolean; enemy: boolean } | null;
  spectators: number;
  /** サーバーの時計 − 自分の時計（ミリ秒）。サーバー時刻の期限を、自分の時計に直すのに使う */
  clockOffsetMs: number;
  /** 直近の操作が拒否された理由（次の操作をすると消える） */
  lastError: { code: string; message: string } | null;
  reconnectAttempts: number;
}

export interface ClientOptions {
  /** wss://ホスト/parties/room/<コード> */
  url: string;
  /** 端末（タブ）ごとの識別子。再接続で同じ席に戻るために使う */
  token: string;
  spectate?: boolean;
  createSocket?: (url: string) => SocketLike;
  clock?: ClientClock;
  /** 再接続の待ち時間（最初の値と上限、ミリ秒）と、諦めるまでの回数 */
  reconnect?: { baseMs: number; maxMs: number; maxAttempts: number };
}

const DEFAULT_RECONNECT = { baseMs: 500, maxMs: 5_000, maxAttempts: 40 };

const realClock: ClientClock = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};

/** サーバーが「もうつながらない」と伝えてくるエラー（再接続しない） */
const TERMINAL_ERRORS: Record<string, EndedReason> = {
  replaced: 'replaced',
  'room-full': 'room-full',
  'spectating-disabled': 'spectating-disabled',
  'room-closed': 'room-closed',
};

export class OnlineClient {
  private readonly clock: ClientClock;
  private readonly reconnectCfg: { baseMs: number; maxMs: number; maxAttempts: number };
  private readonly listeners = new Set<() => void>();

  private snapshot: ClientSnapshot = {
    status: 'idle',
    endedReason: null,
    view: null,
    timers: null,
    connected: null,
    spectators: 0,
    clockOffsetMs: 0,
    lastError: null,
    reconnectAttempts: 0,
  };

  private socket: SocketLike | null = null;
  private retryTimer: unknown = null;
  private running = false;

  constructor(private readonly opts: ClientOptions) {
    this.clock = opts.clock ?? realClock;
    this.reconnectCfg = opts.reconnect ?? DEFAULT_RECONNECT;
  }

  // --- useSyncExternalStore 用 -------------------------------------------------
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  getSnapshot = (): ClientSnapshot => this.snapshot;

  // --- 操作 --------------------------------------------------------------------
  /** 接続を開始する（停止後の再開もできる） */
  start(): void {
    if (this.running) return;
    this.running = true;
    this.update({ status: 'connecting', endedReason: null, reconnectAttempts: 0 });
    this.openSocket();
  }

  /** 画面を離れるなどで接続を止める。サーバーには「切断」として見える（猶予の間は席が保たれる） */
  stop(): void {
    this.running = false;
    this.clearRetry();
    this.detachSocket(true);
    this.update({ status: 'idle' });
  }

  /** 自分から退出する（対戦中なら不戦敗になる） */
  leave(): void {
    this.sendRaw({ t: 'leave' });
    this.running = false;
    this.clearRetry();
    this.detachSocket(true);
    this.update({ status: 'ended', endedReason: 'left' });
  }

  /** 再接続の待ち時間を飛ばして、すぐに再接続する（画面に戻ってきた時など） */
  reconnectNow(): void {
    if (!this.running || this.snapshot.status !== 'reconnecting') return;
    this.clearRetry();
    this.openSocket();
  }

  submitDeck(cardIds: string[]): boolean {
    return this.sendAction({ t: 'submit_deck', cardIds });
  }
  pick(instanceId: string): boolean {
    return this.sendAction({ t: 'pick', instanceId });
  }
  ackReveal(): boolean {
    return this.sendAction({ t: 'ack_reveal' });
  }
  /** 対戦終了後に、同じ相手との再戦を希望する */
  rematch(): boolean {
    return this.sendAction({ t: 'rematch' });
  }
  /** 再戦の希望を取り消す */
  cancelRematch(): boolean {
    return this.sendAction({ t: 'rematch_cancel' });
  }

  /** サーバーの期限（サーバー時刻）を、自分の時計での時刻に直す */
  toLocalTime(serverTime: number): number {
    return serverTime - this.snapshot.clockOffsetMs;
  }

  // --- 内部 --------------------------------------------------------------------
  private update(patch: Partial<ClientSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const l of [...this.listeners]) l();
  }

  private sendRaw(msg: ClientMessage): boolean {
    const s = this.socket;
    if (!s || this.snapshot.status !== 'open') return false;
    try {
      s.send(JSON.stringify(msg));
      return true;
    } catch {
      return false;
    }
  }

  private sendAction(msg: ClientMessage): boolean {
    if (this.snapshot.lastError) this.update({ lastError: null });
    return this.sendRaw(msg);
  }

  private openSocket(): void {
    this.detachSocket(true);
    const create = this.opts.createSocket ?? ((url: string) => new WebSocket(url) as unknown as SocketLike);
    let socket: SocketLike;
    try {
      socket = create(this.opts.url);
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.socket = socket;

    socket.onopen = () => {
      if (this.socket !== socket) return;
      this.update({ status: 'open', reconnectAttempts: 0 });
      const hello: ClientMessage = { t: 'hello', token: this.opts.token };
      if (this.opts.spectate) hello.spectate = true;
      socket.send(JSON.stringify(hello));
    };
    socket.onmessage = (ev) => {
      if (this.socket !== socket) return;
      this.onMessage(ev.data);
    };
    socket.onclose = () => {
      if (this.socket !== socket) return; // 自分で切り離した古い接続の通知は無視する
      this.socket = null;
      this.onUnexpectedClose();
    };
    socket.onerror = () => {
      // 続けて onclose が呼ばれるので、ここでは何もしない
    };
  }

  private onMessage(raw: unknown): void {
    const msg = parseServerMessage(raw);
    if (!msg) return;

    if (msg.t === 'state') {
      this.update({
        view: msg.view,
        timers: msg.timers,
        connected: msg.connected,
        spectators: msg.spectators,
        clockOffsetMs: msg.timers.serverNow - this.clock.now(),
      });
      return;
    }

    const terminal = TERMINAL_ERRORS[msg.code];
    if (terminal) {
      this.running = false;
      this.clearRetry();
      this.detachSocket(true);
      this.update({ status: 'ended', endedReason: terminal, lastError: { code: msg.code, message: msg.message } });
      return;
    }
    this.update({ lastError: { code: msg.code, message: msg.message } });
  }

  private onUnexpectedClose(): void {
    if (!this.running) return;
    // 対戦が終わっていれば、再接続せずに終わる（結果は表示したまま）
    if (this.snapshot.view?.phase === 'finished') {
      this.running = false;
      this.update({ status: 'ended', endedReason: 'finished' });
      return;
    }
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    const { baseMs, maxMs, maxAttempts } = this.reconnectCfg;
    const attempts = this.snapshot.reconnectAttempts;
    if (attempts >= maxAttempts) {
      this.running = false;
      this.update({ status: 'ended', endedReason: 'gave-up' });
      return;
    }
    const delay = Math.min(maxMs, baseMs * 2 ** attempts);
    this.update({ status: 'reconnecting', reconnectAttempts: attempts + 1 });
    this.clearRetry();
    this.retryTimer = this.clock.setTimeout(() => {
      this.retryTimer = null;
      if (this.running) this.openSocket();
    }, delay);
  }

  private clearRetry(): void {
    if (this.retryTimer !== null) {
      this.clock.clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
  }

  /** 現在の接続を切り離す（切り離した接続からの通知は、以後すべて無視される） */
  private detachSocket(close: boolean): void {
    const s = this.socket;
    this.socket = null;
    if (s && close) {
      try {
        s.close(1000, 'client');
      } catch {
        // 既に閉じている場合など
      }
    }
  }
}
