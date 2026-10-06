import { useMemo, useState } from 'react';
import type { CardMaster } from '../../types/card';
import { useCountdownSeconds, useOnlineRoom } from '../../hooks/useOnlineRoom';
import { DEFAULT_ONLINE_HOST, buildRoomSocketUrl } from '../../online/serverHost';
import { clearToken, getOrCreateToken, type StorageLike } from '../../online/session';
import type { EndedReason } from '../../online/client';
import { OnlineBattleView } from './OnlineBattleView';
import { OnlineDeckBuilder } from './OnlineDeckBuilder';
import { OnlineLobby } from './OnlineLobby';
import { OnlineResultView } from './OnlineResultView';

interface Props {
  roomCode: string;
  host: string;
  pool: CardMaster[];
  onExit: () => void;
}

function safeSessionStorage(): StorageLike | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

const END_MESSAGES: Partial<Record<EndedReason, string>> = {
  replaced: 'このルームには、別の画面から接続されました。この画面での対戦は終了します。',
  'room-full': 'このルームは満員です（すでに2人が参加しています）。',
  'spectating-disabled': '観戦はまだ利用できません。',
  'room-closed': 'このルームは終了しました。もう一度対戦するときは、新しいルームを作ってください。',
  'gave-up': 'サーバーに接続できませんでした。通信環境を確認して、もう一度お試しください。',
};

/** 1つのルーム（接続中の対戦部屋）の画面。サーバーから届く状態（フェーズ）に合わせて表示を切り替える */
export function OnlineRoomScreen({ roomCode, host, pool, onExit }: Props) {
  const token = useMemo(() => getOrCreateToken(roomCode, safeSessionStorage()), [roomCode]);
  const url = useMemo(() => buildRoomSocketUrl(host, roomCode), [host, roomCode]);
  const { client, snapshot } = useOnlineRoom(url, token);
  const { view, status, endedReason, connected, timers, lastError, reconnectAttempts } = snapshot;

  const deckSeconds = useCountdownSeconds(timers?.deckDeadlineAt, client);
  const graceSeconds = useCountdownSeconds(timers?.graceDeadlineAt, client);
  const [confirmLeave, setConfirmLeave] = useState(false);

  function exit() {
    client.leave();
    clearToken(roomCode, safeSessionStorage());
    onExit();
  }

  // 席を奪われた・満員・接続できない、など「もうこの画面では続けられない」場合
  const endMessage = status === 'ended' && endedReason ? END_MESSAGES[endedReason] : undefined;
  if (endMessage) {
    return (
      <div className="flex flex-col items-center gap-4 pt-10 text-center">
        <p className="max-w-xs text-sm leading-relaxed text-amber-300">{endMessage}</p>
        <button onClick={exit} className="rounded-xl bg-zinc-800 px-6 py-3 text-sm font-extrabold text-white hover:bg-zinc-700">
          オンライン対戦のトップへ
        </button>
      </div>
    );
  }

  const phase = view?.phase;
  const playing = phase === 'deck' || phase === 'pick' || phase === 'reveal';
  const enemyGone = playing && connected?.enemy === false && view?.enemyPlayer;

  return (
    <div className="flex flex-col gap-3">
      <header className="flex items-center justify-between">
        {phase === 'finished' ? (
          <span style={{ width: 68 }} />
        ) : confirmLeave ? (
          <div className="flex items-center gap-1.5">
            <button onClick={exit} className="rounded-lg bg-rose-600 px-2.5 py-1.5 text-[11px] font-bold text-white hover:bg-rose-500">
              退出する
            </button>
            <button onClick={() => setConfirmLeave(false)} className="rounded-lg bg-zinc-800 px-2.5 py-1.5 text-[11px] font-bold text-white hover:bg-zinc-700">
              やめる
            </button>
          </div>
        ) : (
          <button
            onClick={() => (playing ? setConfirmLeave(true) : exit())}
            className="rounded-lg bg-zinc-800 px-3 py-1.5 text-xs font-bold text-white hover:bg-zinc-700"
          >
            ← 退出
          </button>
        )}
        <span className="text-[11px] text-zinc-500">ルーム {roomCode}</span>
        <span style={{ width: 68 }} />
      </header>

      {confirmLeave && <p className="text-center text-[11px] text-rose-300">対戦中に退出すると、不戦敗になります。</p>}

      {(status === 'connecting' || status === 'reconnecting') && (
        <p className="rounded-lg bg-zinc-900 px-3 py-2 text-center text-[11px] text-zinc-300" data-testid="connection-banner">
          {status === 'connecting' ? 'サーバーに接続しています…' : `接続が切れました。再接続しています…（${reconnectAttempts}回目）`}
        </p>
      )}

      {enemyGone && (
        <p className="rounded-lg bg-amber-950/60 px-3 py-2 text-center text-[11px] text-amber-300" data-testid="enemy-gone-banner">
          相手の接続が切れています。{graceSeconds !== null ? `あと${graceSeconds}秒で戻らなければ、あなたの不戦勝になります。` : '戻るのを待っています。'}
        </p>
      )}

      {lastError && phase !== 'deck' && <p className="text-center text-[11px] text-rose-400">{lastError.message}</p>}

      {!view && status !== 'connecting' && status !== 'reconnecting' && <p className="text-center text-sm text-zinc-400">接続中…</p>}

      {view && phase === 'lobby' && <OnlineLobby roomCode={roomCode} inviteServer={host === DEFAULT_ONLINE_HOST ? null : host} />}

      {view && phase === 'deck' && (
        <OnlineDeckBuilder
          pool={pool}
          submitted={view.selfDeckSubmitted}
          enemyName={view.enemyPlayer?.name ?? null}
          enemySubmitted={view.enemyDeckSubmitted}
          secondsLeft={deckSeconds}
          error={lastError?.message ?? null}
          initialDeckIds={view.selfLastDeckIds}
          matchNumber={view.matchNumber}
          onSubmit={(ids) => client.submitDeck(ids)}
        />
      )}

      {view && (phase === 'pick' || phase === 'reveal') && <OnlineBattleView view={view} client={client} snapshot={snapshot} />}

      {view && phase === 'finished' && <OnlineResultView view={view} client={client} snapshot={snapshot} onExit={exit} />}
    </div>
  );
}
