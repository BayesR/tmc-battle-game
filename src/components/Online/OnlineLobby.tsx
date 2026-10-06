import { useState } from 'react';
import { buildInviteUrl } from '../../online/entry';

interface Props {
  roomCode: string;
  /** 開発中にローカルのサーバーを使っている場合の接続先（招待リンクに引き継ぐ）。本番では null */
  inviteServer: string | null;
}

/** 相手の参加を待つ画面：招待リンクとコードを表示し、コピー・共有できる */
export function OnlineLobby({ roomCode, inviteServer }: Props) {
  const inviteUrl = buildInviteUrl(window.location.origin, window.location.pathname, roomCode, inviteServer);
  const [copied, setCopied] = useState<'link' | 'code' | null>(null);
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  async function copy(text: string, kind: 'link' | 'code') {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      window.setTimeout(() => setCopied(null), 2000);
    } catch {
      // クリップボードが使えない環境では、下の入力欄を選択して手動でコピーしてもらう
    }
  }

  return (
    <div className="flex flex-col items-center gap-4 pt-4">
      <p className="text-sm font-bold text-white">相手の参加を待っています…</p>

      <div className="w-full rounded-xl border border-zinc-700 bg-zinc-900/60 p-4 text-center">
        <p className="text-[11px] text-zinc-400">ルームコード</p>
        <p className="my-1 font-mono text-3xl font-black tracking-[0.3em] text-white" data-testid="room-code">
          {roomCode}
        </p>
        <button onClick={() => copy(roomCode, 'code')} className="rounded-lg bg-zinc-800 px-3 py-1.5 text-xs font-bold text-white hover:bg-zinc-700">
          {copied === 'code' ? 'コピーしました' : 'コードをコピー'}
        </button>
      </div>

      <div className="w-full rounded-xl border border-zinc-700 bg-zinc-900/60 p-4">
        <p className="mb-2 text-[11px] text-zinc-400">招待リンク（友達に送ってください）</p>
        <input
          readOnly
          value={inviteUrl}
          onFocus={(e) => e.currentTarget.select()}
          className="mb-3 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs text-zinc-200 focus:outline-none"
          data-testid="invite-url"
        />
        <div className="flex gap-2">
          <button
            onClick={() => copy(inviteUrl, 'link')}
            className="flex-1 rounded-lg bg-emerald-600 py-2 text-xs font-extrabold text-white hover:bg-emerald-500"
          >
            {copied === 'link' ? 'コピーしました' : 'リンクをコピー'}
          </button>
          {canShare && (
            <button
              onClick={() => navigator.share({ title: 'TMC BATTLE GAME', text: 'オンライン対戦しよう！', url: inviteUrl }).catch(() => undefined)}
              className="flex-1 rounded-lg bg-sky-500 py-2 text-xs font-extrabold text-white hover:bg-sky-400"
            >
              共有する
            </button>
          )}
        </div>
      </div>

      <p className="max-w-xs text-center text-[11px] leading-relaxed text-zinc-500">
        5分以内に相手が参加しないと、ルームは閉じられます。リンクを送るためにアプリを切り替えても、そのまま待っています。
      </p>
    </div>
  );
}
