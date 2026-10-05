import { useMemo, useState } from 'react';
import type { CardMaster } from '../../types/card';
import { searchWithRoom } from '../../online/entry';
import { generateRoomCode } from '../../online/roomCode';
import { resolveServerHost } from '../../online/serverHost';
import { secureRandom } from '../../online/session';
import { OnlineMenu } from './OnlineMenu';
import { OnlineRoomScreen } from './OnlineRoomScreen';

interface Props {
  /** 全カード（オンライン対戦はストーリーモードの所持カード制限を受けない） */
  pool: CardMaster[];
  /** 招待リンクで指定されたルームコード */
  initialRoomCode: string | null;
  onBackToTitle: () => void;
}

/** URLのクエリに、入っているルームを反映する。リロードしても同じルームの同じ席に戻れるようにするため */
function reflectRoomInUrl(roomCode: string | null) {
  window.history.replaceState(null, '', window.location.pathname + searchWithRoom(window.location.search, roomCode));
}

/** オンライン対戦のトップ：メニュー（ルーム作成・参加）と、ルーム画面を切り替える */
export function OnlineScreen({ pool, initialRoomCode, onBackToTitle }: Props) {
  const [roomCode, setRoomCode] = useState<string | null>(initialRoomCode);
  // ?server= による接続先の切り替えは、開発ビルドでだけ有効
  const host = useMemo(() => resolveServerHost(window.location.search, import.meta.env.DEV), []);

  function enterRoom(code: string) {
    reflectRoomInUrl(code);
    setRoomCode(code);
  }
  function exitRoom() {
    reflectRoomInUrl(null);
    setRoomCode(null);
  }

  if (roomCode === null) {
    return <OnlineMenu onCreate={() => enterRoom(generateRoomCode(secureRandom))} onJoin={enterRoom} onBack={onBackToTitle} />;
  }
  return <OnlineRoomScreen key={roomCode} roomCode={roomCode} host={host} pool={pool} onExit={exitRoom} />;
}
