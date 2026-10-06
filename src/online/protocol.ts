import { MAX_NAME_LENGTH } from './constants';
import type { OnlineView } from './types';

/**
 * クライアント ⇔ サーバーのメッセージ仕様
 * ------------------------------------------------------------------
 * 方針：サーバーは「状態が変わるたびに、その接続者に見せてよい状態（OnlineView）を丸ごと送る」。
 * 差分ではなく全体を送るので、再接続・途中参加（観戦）でも「今の状態」を1回受け取るだけで追いつける。
 * 試合の状態（OnlineView）はごく小さいので、通信量の面でも問題にならない。
 */

/** クライアント → サーバー */
export type ClientMessage =
  /** 最初に必ず送る。token は端末が保存している識別子（再接続で同じ席に戻るために使う） */
  | { t: 'hello'; token: string; name?: string; spectate?: boolean }
  | { t: 'submit_deck'; cardIds: string[] }
  | { t: 'pick'; instanceId: string }
  | { t: 'ack_reveal' }
  /** 対戦終了後に、同じ相手との再戦を希望する／取り消す */
  | { t: 'rematch' }
  | { t: 'rematch_cancel' }
  | { t: 'leave' };

/** 制限時間などの期限（サーバー時刻のミリ秒）。該当しないものは null */
export interface RoomTimers {
  /** サーバーの現在時刻。クライアントの時計とのずれを補正するために送る */
  serverNow: number;
  deckDeadlineAt: number | null;
  pickDeadlineAt: number | null;
  revealDeadlineAt: number | null;
  /** 切断した相手が戻らなければ不戦敗になる時刻 */
  graceDeadlineAt: number | null;
  /** 対戦終了後、ルームが閉じられる時刻（再戦の相談ができる期限） */
  closeDeadlineAt: number | null;
}

/** サーバー → クライアント */
export type ServerMessage =
  | {
      t: 'state';
      view: OnlineView;
      timers: RoomTimers;
      /** 接続状態（視点席から見て） */
      connected: { self: boolean; enemy: boolean };
      spectators: number;
    }
  | { t: 'error'; code: string; message: string };

const MAX_TOKEN_LENGTH = 64;
const MAX_MESSAGE_BYTES = 4096;
const MAX_CARD_IDS = 10; // 5枚が正だが、5枚以外は検証側で理由付きで弾くため、ここでは極端な長さだけを拒否する
const MAX_ID_LENGTH = 100;

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isShortString = (v: unknown, max: number): v is string => typeof v === 'string' && v.length > 0 && v.length <= max;

/**
 * 受信した生の文字列を ClientMessage に変換する。形式が正しくなければ null（＝無視またはエラー応答）。
 * ネットワーク越しの入力は何が来てもおかしくないため、サーバーは必ずこの関数を通す。
 */
export function parseClientMessage(raw: unknown): ClientMessage | null {
  if (typeof raw !== 'string' || raw.length > MAX_MESSAGE_BYTES) return null;

  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isObject(data) || typeof data.t !== 'string') return null;

  switch (data.t) {
    case 'hello': {
      if (!isShortString(data.token, MAX_TOKEN_LENGTH)) return null;
      const msg: ClientMessage = { t: 'hello', token: data.token };
      if (data.name !== undefined) {
        if (typeof data.name !== 'string' || data.name.length > MAX_NAME_LENGTH * 4) return null;
        msg.name = data.name;
      }
      if (data.spectate !== undefined) {
        if (typeof data.spectate !== 'boolean') return null;
        msg.spectate = data.spectate;
      }
      return msg;
    }
    case 'submit_deck': {
      if (!Array.isArray(data.cardIds) || data.cardIds.length > MAX_CARD_IDS) return null;
      if (!data.cardIds.every((id) => isShortString(id, MAX_ID_LENGTH))) return null;
      return { t: 'submit_deck', cardIds: data.cardIds as string[] };
    }
    case 'pick': {
      if (!isShortString(data.instanceId, MAX_ID_LENGTH)) return null;
      return { t: 'pick', instanceId: data.instanceId };
    }
    case 'ack_reveal':
      return { t: 'ack_reveal' };
    case 'rematch':
      return { t: 'rematch' };
    case 'rematch_cancel':
      return { t: 'rematch_cancel' };
    case 'leave':
      return { t: 'leave' };
    default:
      return null;
  }
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * サーバーから届いた生の文字列を ServerMessage に変換する（クライアント側の防御的な検証）。
 * サーバーは自分たちのものだが、バージョンのずれ（古い画面と新しいサーバー）で想定外の形が届いても、
 * 画面が例外で止まらないよう、最低限の構造だけを確かめて、合わなければ null にする。
 */
export function parseServerMessage(raw: unknown): ServerMessage | null {
  if (typeof raw !== 'string') return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(data)) return null;

  if (data.t === 'error') {
    if (typeof data.code !== 'string' || typeof data.message !== 'string') return null;
    return { t: 'error', code: data.code, message: data.message };
  }

  if (data.t === 'state') {
    const { view, timers, connected, spectators } = data;
    if (!isRecord(view) || typeof view.phase !== 'string' || typeof view.perspective !== 'string') return null;
    if (!Array.isArray(view.rounds) || !Array.isArray(view.board) || !Array.isArray(view.selfRemaining)) return null;
    if (!isRecord(timers) || typeof timers.serverNow !== 'number') return null;
    if (!isRecord(connected) || typeof connected.self !== 'boolean' || typeof connected.enemy !== 'boolean') return null;
    if (typeof spectators !== 'number') return null;
    return data as unknown as ServerMessage;
  }
  return null;
}
