import { useState } from 'react';
import { isValidRoomCode, normalizeRoomCode } from '../../online/roomCode';
import { OnlineNotice } from './OnlineNotice';

interface Props {
  onCreate: () => void;
  onJoin: (roomCode: string) => void;
  onBack: () => void;
}

/** オンライン対戦の入口：ルームを作る／コードで参加する */
export function OnlineMenu({ onCreate, onJoin, onBack }: Props) {
  const [input, setInput] = useState('');
  const [touched, setTouched] = useState(false);
  const code = normalizeRoomCode(input);
  const valid = isValidRoomCode(code);

  function submit() {
    setTouched(true);
    if (valid) onJoin(code);
  }

  return (
    <div className="flex flex-col gap-5">
      <header className="flex items-center justify-between">
        <button onClick={onBack} className="rounded-lg bg-zinc-800 px-3 py-1.5 text-xs font-bold text-white hover:bg-zinc-700">
          ← タイトルへ
        </button>
        <h1 className="text-sm font-extrabold tracking-wide text-white">オンライン対戦</h1>
        <span style={{ width: 68 }} />
      </header>

      <p className="rounded-xl border border-zinc-700 bg-zinc-900/60 p-3 text-xs leading-relaxed text-zinc-300">
        友達と1対1で対戦できます。ルームを作って招待リンクを送るか、教えてもらったコードを入力してください。
        使えるカードは<span className="font-bold text-white">全カード</span>です（ストーリーモードの所持カードとは関係ありません）。
      </p>

      <button
        onClick={onCreate}
        className="rounded-xl bg-emerald-600 py-3.5 text-sm font-extrabold tracking-wide text-white hover:bg-emerald-500 active:scale-[0.99]"
      >
        ルームを作る
      </button>

      <div className="rounded-xl border border-zinc-700 bg-zinc-900/60 p-3">
        <label htmlFor="room-code" className="mb-2 block text-xs font-bold text-zinc-300">
          コードで参加する
        </label>
        <div className="flex gap-2">
          <input
            id="room-code"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit();
            }}
            placeholder="例：ABC234"
            maxLength={12}
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            className="min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm font-bold uppercase tracking-widest text-white placeholder:font-normal placeholder:normal-case placeholder:tracking-normal placeholder:text-zinc-500 focus:outline-none"
          />
          <button
            onClick={submit}
            className="shrink-0 rounded-lg bg-sky-500 px-4 py-2 text-sm font-bold text-white hover:bg-sky-400"
          >
            参加
          </button>
        </div>
        {touched && !valid && (
          <p className="mt-2 text-[11px] text-rose-400">コードは6文字です（I・L・O・0・1は使われません）。もう一度確認してください。</p>
        )}
      </div>

      <OnlineNotice />
    </div>
  );
}
