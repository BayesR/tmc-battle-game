import type { CardMaster } from '../types/card';
import {
  DECK_TIME_MS,
  DISCONNECT_GRACE_MS,
  FINISHED_LINGER_MS,
  HELLO_TIMEOUT_MS,
  LOBBY_DISCONNECT_GRACE_MS,
  LOBBY_EXPIRE_MS,
  MAX_SPECTATORS,
  PICK_TIME_MS,
  REVEAL_AUTO_ADVANCE_MS,
} from './constants';
import { createInitialOnlineState, onlineReducer, viewFor, type OnlineAction, type OnlineError } from './match';
import { generateOnlineName } from './names';
import { parseClientMessage, type RoomTimers, type ServerMessage } from './protocol';
import { SEATS, otherSeat, type OnlineMatchState, type Seat } from './types';

/**
 * ルーム（1つの対戦部屋）の本体
 * ------------------------------------------------------------------
 * プラットフォーム（PartyServer / Node の開発サーバー / テスト）に依存しない。
 * 外から次のものを差し込んで使う：
 *   - 時計（env.now）・乱数（env.rng）・カードプール（env.pool）
 *   - 接続への送信と切断（transport）
 *
 * タイマーは内部に持たない。各種の期限（deadline）を計算して持っておき、
 *   - nextDeadline() で「次に起こすべき時刻」をプラットフォームに伝え
 *   - その時刻になったら、プラットフォームが tick() を呼ぶ
 * という方式にしている。Cloudflare の Durable Object は同時に1つの alarm しか持てないため、
 * この方式が合っている。テストでは偽の時計を進めて tick() を呼ぶだけで、60秒待たずに検証できる。
 */

export interface RoomTransport {
  send(connId: string, message: ServerMessage): void;
  close(connId: string): void;
}

export interface RoomEnv {
  now(): number;
  rng(): number;
  pool: readonly CardMaster[];
  /** 観戦を許可するか（フェーズ1.5で有効化する。既定は無効） */
  allowSpectators?: boolean;
}

type Role = Seat | 'spectator';
interface ConnInfo {
  role: Role;
  token: string;
}

interface Deadlines {
  lobbyExpireAt: number | null;
  deckAt: number | null;
  pickAt: number | null;
  revealAt: number | null;
  /** 対戦終了後、ルームを閉じる時刻 */
  closeAt: number | null;
  graceAt: Record<Seat, number | null>;
}

/**
 * 永続化用の保存形式（JSONにできる）。接続そのものは含まない（再接続時に token で席に戻る）。
 * 古い形式（再戦などの項目が無い保存データ）も、復元時に不足分を補って読み込める。
 */
export interface RoomSnapshot {
  v: 1;
  state: OnlineMatchState;
  tokens: Record<Seat, string | null>;
  deadlines: Partial<Deadlines> & { graceAt?: Partial<Record<Seat, number | null>> };
  /** 閉じ済みのルームか（閉じ済みなら、新しい参加を受け付けない） */
  closed?: boolean;
}

const noDeadlines = (): Deadlines => ({
  lobbyExpireAt: null,
  deckAt: null,
  pickAt: null,
  revealAt: null,
  closeAt: null,
  graceAt: { A: null, B: null },
});

export class Room {
  private state: OnlineMatchState = createInitialOnlineState();
  private tokens: Record<Seat, string | null> = { A: null, B: null };
  private deadlines: Deadlines = noDeadlines();

  /** connId → 接続情報。null は「まだ hello を送っていない接続」 */
  private conns = new Map<string, ConnInfo | null>();
  /** 各席に現在つながっている接続（切断中なら null） */
  private seatConn: Record<Seat, string | null> = { A: null, B: null };
  /** hello を送るまでの期限（接続ごと）。何も送らない接続を放置しないため */
  private helloDeadlines = new Map<string, number>();
  /** 閉じ済み（終了後の受付期間が過ぎた）か */
  private closed = false;

  constructor(
    private readonly env: RoomEnv,
    private readonly transport: RoomTransport,
    snapshot?: RoomSnapshot
  ) {
    if (snapshot) {
      this.restore(snapshot);
    } else {
      this.deadlines.lobbyExpireAt = env.now() + LOBBY_EXPIRE_MS;
    }
  }

  // -------------------------------------------------------------------------
  // プラットフォームから呼ばれる入口
  // -------------------------------------------------------------------------

  /** 新しい接続が開いた（まだ誰かは分からない。hello を待つ） */
  handleOpen(connId: string): void {
    this.conns.set(connId, null);
    this.helloDeadlines.set(connId, this.env.now() + HELLO_TIMEOUT_MS);
  }

  handleMessage(connId: string, raw: unknown): void {
    if (!this.conns.has(connId)) return;
    const info = this.conns.get(connId) ?? null;

    const msg = parseClientMessage(raw);
    if (!msg) return this.sendError(connId, 'bad-message', 'メッセージの形式が正しくありません');

    if (msg.t === 'hello') return this.onHello(connId, info, msg.token, msg.spectate === true);
    if (!info) return this.sendError(connId, 'hello-required', '先に hello を送ってください');

    if (msg.t === 'leave') return this.onLeave(connId, info);
    if (info.role === 'spectator') return this.sendError(connId, 'not-a-player', '観戦者は操作できません');

    const seat = info.role;
    let action: OnlineAction;
    switch (msg.t) {
      case 'submit_deck':
        action = { type: 'SUBMIT_DECK', seat, cardIds: msg.cardIds };
        break;
      case 'pick':
        action = { type: 'PICK', seat, instanceId: msg.instanceId };
        break;
      case 'ack_reveal':
        action = { type: 'ACK_REVEAL', seat };
        break;
      case 'rematch':
        // 相手が接続していない時は、希望を受け付けない（再戦の開始時に、両者がそろっている必要があるため）
        if (this.seatConn[otherSeat(seat)] === null) {
          return this.sendError(connId, 'rematch-unavailable', '相手が接続していないため、再戦はできません');
        }
        action = { type: 'REMATCH_VOTE', seat };
        break;
      case 'rematch_cancel':
        action = { type: 'REMATCH_CANCEL', seat };
        break;
    }
    this.apply(action, connId);
  }

  handleClose(connId: string): void {
    const info = this.conns.get(connId);
    this.conns.delete(connId);
    this.helloDeadlines.delete(connId);
    if (!info) return;

    if (info.role === 'spectator') {
      this.broadcast();
      return;
    }
    // すでに別の接続に置き換えられていた場合は何もしない
    if (this.seatConn[info.role] !== connId) return;

    this.seatConn[info.role] = null;
    if (this.state.phase !== 'finished') {
      const grace = this.state.phase === 'lobby' ? LOBBY_DISCONNECT_GRACE_MS : DISCONNECT_GRACE_MS;
      this.deadlines.graceAt[info.role] = this.env.now() + grace;
    }
    // 再戦を希望していた人が切断したら、希望を取り消す（再戦は、両者が接続している時にだけ始める）
    if (!this.cancelRematchVote(info.role)) this.broadcast();
  }

  /** 期限が来ているものを全て処理する。プラットフォームの alarm から呼ぶ */
  tick(): void {
    this.expireUnidentified();

    // 対戦終了後の受付期間が過ぎたら、ルームを閉じる
    const closeAt = this.deadlines.closeAt;
    if (!this.closed && closeAt !== null && closeAt <= this.env.now()) {
      this.closeRoom();
      return;
    }

    for (let guard = 0; guard < 50; guard++) {
      const action = this.nextDueAction();
      if (!action) return;
      this.apply(action, null);
    }
  }

  /** 次に tick() を呼ぶべき時刻（なければ null） */
  nextDeadline(): number | null {
    const d = this.deadlines;
    const all = [d.lobbyExpireAt, d.deckAt, d.pickAt, d.revealAt, d.closeAt, d.graceAt.A, d.graceAt.B, ...this.helloDeadlines.values()].filter(
      (t): t is number => t !== null
    );
    return all.length > 0 ? Math.min(...all) : null;
  }

  snapshot(): RoomSnapshot {
    return {
      v: 1,
      state: this.state,
      tokens: { ...this.tokens },
      deadlines: { ...this.deadlines, graceAt: { ...this.deadlines.graceAt } },
      closed: this.closed,
    };
  }

  /** 読み取り専用で現在の状態を見る（テスト・デバッグ用） */
  getState(): Readonly<OnlineMatchState> {
    return this.state;
  }

  // -------------------------------------------------------------------------
  // hello（参加・再接続・観戦）
  // -------------------------------------------------------------------------

  private onHello(connId: string, info: ConnInfo | null, token: string, spectate: boolean): void {
    if (info) return this.sendError(connId, 'already-hello', 'すでに参加しています');
    if (this.closed) return this.sendError(connId, 'room-closed', 'このルームは終了しました。新しいルームを作ってください');

    // 1) 再接続：保存してある token と一致する席に戻す
    for (const seat of SEATS) {
      if (this.tokens[seat] === token) {
        const old = this.seatConn[seat];
        if (old && old !== connId) {
          this.sendError(old, 'replaced', '別の画面で同じ席に接続されました');
          this.conns.delete(old);
          this.transport.close(old);
        }
        this.seatConn[seat] = connId;
        this.conns.set(connId, { role: seat, token });
        this.helloDeadlines.delete(connId);
        this.deadlines.graceAt[seat] = null;
        this.broadcast();
        return;
      }
    }

    // 2) 観戦
    if (spectate) {
      if (!this.env.allowSpectators) return this.sendError(connId, 'spectating-disabled', '観戦はまだ利用できません');
      if (this.spectatorCount() >= MAX_SPECTATORS) return this.sendError(connId, 'room-full', '観戦者が上限に達しています');
      this.conns.set(connId, { role: 'spectator', token });
      this.helloDeadlines.delete(connId);
      this.broadcast();
      return;
    }

    // 3) 新しい参加者：ロビーで空いている席に着く（表示名はサーバーが自動生成する）
    if (this.state.phase === 'lobby') {
      const seat = SEATS.find((s) => this.state.players[s] === null);
      if (seat) {
        const name = generateOnlineName(this.env.rng, this.state.players[otherSeat(seat)]?.name ?? null);
        this.tokens[seat] = token;
        this.seatConn[seat] = connId;
        this.conns.set(connId, { role: seat, token });
        this.helloDeadlines.delete(connId);
        this.apply({ type: 'SEAT', seat, name }, connId);
        return;
      }
    }
    this.sendError(connId, 'room-full', 'このルームは満員です');
  }

  private onLeave(connId: string, info: ConnInfo): void {
    if (info.role !== 'spectator' && this.state.phase !== 'finished') {
      this.apply({ type: 'FORFEIT', seat: info.role, cause: 'left' }, connId);
    }
    this.conns.delete(connId);
    this.helloDeadlines.delete(connId);
    let cancelled = false;
    if (info.role !== 'spectator' && this.seatConn[info.role] === connId) {
      this.seatConn[info.role] = null;
      cancelled = this.cancelRematchVote(info.role);
    }
    this.transport.close(connId);
    if (!cancelled) this.broadcast();
  }

  /** 終了後に、その席の再戦の希望が入っていれば取り消す（取り消した場合は true。状態の送信も済ませる） */
  private cancelRematchVote(seat: Seat): boolean {
    if (this.state.phase !== 'finished' || !this.state.rematchVotes[seat]) return false;
    this.apply({ type: 'REMATCH_CANCEL', seat }, null);
    return true;
  }

  /** hello を送らないまま期限が過ぎた接続を切る */
  private expireUnidentified(): void {
    const now = this.env.now();
    for (const [connId, at] of [...this.helloDeadlines]) {
      if (at > now) continue;
      this.helloDeadlines.delete(connId);
      if (this.conns.get(connId) !== null) continue; // すでに参加済み
      this.sendError(connId, 'hello-timeout', '参加の手続きが行われなかったため、接続を終了しました');
      this.conns.delete(connId);
      this.transport.close(connId);
    }
  }

  /** 対戦終了後の受付期間が過ぎたので、全ての接続を閉じ、以後の参加を受け付けない */
  private closeRoom(): void {
    this.closed = true;
    this.deadlines.closeAt = null;
    for (const connId of [...this.conns.keys()]) this.transport.close(connId);
    this.conns.clear();
    this.helloDeadlines.clear();
    this.seatConn = { A: null, B: null };
  }

  // -------------------------------------------------------------------------
  // 状態の更新・期限の管理・送信
  // -------------------------------------------------------------------------

  /** リデューサーを通して状態を更新する。拒否された場合は、送信元にだけエラーと現在の状態を返す */
  private apply(action: OnlineAction, from: string | null): void {
    const result = onlineReducer(this.state, action, { pool: this.env.pool, rng: this.env.rng });
    if (result.error) {
      if (from) {
        this.sendError(from, result.error.code, result.error.message);
        this.sendStateTo(from);
      }
      return;
    }
    this.state = result.state;
    this.syncDeadlines();
    this.broadcast();
  }

  /** フェーズに合わせて期限を付け外しする（各ラウンドごとに選択の期限は新しく付け直される） */
  private syncDeadlines(): void {
    const now = this.env.now();
    const phase = this.state.phase;
    const d = this.deadlines;

    d.lobbyExpireAt = phase === 'lobby' ? d.lobbyExpireAt : null;
    d.deckAt = phase === 'deck' ? (d.deckAt ?? now + DECK_TIME_MS) : null;
    d.pickAt = phase === 'pick' ? (d.pickAt ?? now + PICK_TIME_MS) : null;
    d.revealAt = phase === 'reveal' ? (d.revealAt ?? now + REVEAL_AUTO_ADVANCE_MS) : null;
    d.closeAt = phase === 'finished' ? (d.closeAt ?? now + FINISHED_LINGER_MS) : null;

    if (phase === 'finished') d.graceAt = { A: null, B: null };
  }

  /** いま期限が来ている処理を1つ返す（切断の猶予切れを、フェーズの時間切れより先に処理する） */
  private nextDueAction(): OnlineAction | null {
    const now = this.env.now();
    const d = this.deadlines;
    if (this.state.phase === 'finished') return null;

    for (const seat of SEATS) {
      const at = d.graceAt[seat];
      if (at !== null && at <= now) {
        d.graceAt[seat] = null;
        const other = otherSeat(seat);
        const otherAlsoGone = this.state.players[other] !== null && this.seatConn[other] === null;
        return otherAlsoGone ? { type: 'ABANDON' } : { type: 'FORFEIT', seat, cause: 'disconnect' };
      }
    }

    if (d.lobbyExpireAt !== null && d.lobbyExpireAt <= now) {
      d.lobbyExpireAt = null;
      return { type: 'ABANDON' };
    }
    if (d.deckAt !== null && d.deckAt <= now) {
      d.deckAt = null;
      const missing = SEATS.filter((s) => !this.state.deckSubmitted[s]);
      if (missing.length === 0) return null;
      if (missing.length === 2) return { type: 'ABANDON' };
      return { type: 'FORFEIT', seat: missing[0], cause: 'deck-timeout' };
    }
    if (d.pickAt !== null && d.pickAt <= now) {
      d.pickAt = null;
      return { type: 'TIMEOUT_PICK' };
    }
    if (d.revealAt !== null && d.revealAt <= now) {
      d.revealAt = null;
      return { type: 'TIMEOUT_REVEAL' };
    }
    return null;
  }

  private spectatorCount(): number {
    let n = 0;
    for (const info of this.conns.values()) if (info?.role === 'spectator') n++;
    return n;
  }

  private timersFor(role: Role): RoomTimers {
    const d = this.deadlines;
    // 切断中の「相手」が戻らなければ不戦敗になる時刻（観戦者には、より早い方を見せる）
    let grace: number | null;
    if (role === 'spectator') {
      const times = [d.graceAt.A, d.graceAt.B].filter((t): t is number => t !== null);
      grace = times.length > 0 ? Math.min(...times) : null;
    } else {
      grace = d.graceAt[otherSeat(role)];
    }
    return {
      serverNow: this.env.now(),
      deckDeadlineAt: d.deckAt,
      pickDeadlineAt: d.pickAt,
      revealDeadlineAt: d.revealAt,
      graceDeadlineAt: grace,
      closeDeadlineAt: d.closeAt,
    };
  }

  private stateMessage(role: Role): ServerMessage {
    const perspective: Seat = role === 'spectator' ? 'A' : role;
    return {
      t: 'state',
      view: viewFor(this.state, role),
      timers: this.timersFor(role),
      connected: {
        self: this.seatConn[perspective] !== null,
        enemy: this.seatConn[otherSeat(perspective)] !== null,
      },
      spectators: this.spectatorCount(),
    };
  }

  private sendStateTo(connId: string): void {
    const info = this.conns.get(connId);
    if (info) this.transport.send(connId, this.stateMessage(info.role));
  }

  private broadcast(): void {
    for (const [connId, info] of this.conns) {
      if (info) this.transport.send(connId, this.stateMessage(info.role));
    }
  }

  private sendError(connId: string, code: OnlineError['code'] | string, message: string): void {
    this.transport.send(connId, { t: 'error', code, message });
  }

  // -------------------------------------------------------------------------
  // 復元
  // -------------------------------------------------------------------------

  private restore(snapshot: RoomSnapshot): void {
    if (snapshot.v !== 1) throw new Error(`未対応のスナップショット形式です: ${String((snapshot as { v: unknown }).v)}`);
    // 古い形式の保存データ（再戦などの項目が無いもの）でも読み込めるよう、不足分を補う
    this.state = { ...createInitialOnlineState(), ...snapshot.state };
    this.tokens = { ...snapshot.tokens };
    const blank = noDeadlines();
    this.deadlines = { ...blank, ...snapshot.deadlines, graceAt: { ...blank.graceAt, ...snapshot.deadlines.graceAt } } as Deadlines;
    this.closed = snapshot.closed === true;

    if (this.closed) {
      this.deadlines = noDeadlines();
      return;
    }

    const now = this.env.now();
    if (this.state.phase === 'finished') {
      // 終了済みのルームには、必ず閉じる期限を付ける（付いていないと、接続が残る限り開き続けてしまう）
      if (this.deadlines.closeAt === null) this.deadlines.closeAt = now + FINISHED_LINGER_MS;
      return;
    }

    // 復元した直後は誰も接続していない。着席済みの席には、戻ってくるための猶予を与える
    const grace = this.state.phase === 'lobby' ? LOBBY_DISCONNECT_GRACE_MS : DISCONNECT_GRACE_MS;
    for (const seat of SEATS) {
      if (this.state.players[seat] !== null && this.deadlines.graceAt[seat] === null) {
        this.deadlines.graceAt[seat] = now + grace;
      }
    }
  }
}
