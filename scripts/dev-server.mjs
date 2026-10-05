// オンライン対戦の開発用サーバー（ローカル専用）
// ------------------------------------------------------------------
// Cloudflareにデプロイしなくても、自分のPCでオンライン対戦の通信を試すためのサーバー。
// Node標準の機能だけで動く（WebSocketの最低限の部分を自前で実装している）ので、追加の部品は不要。
//
//   npm run dev:online                 → ws://localhost:8787 で待ち受ける
//   npm run dev:online -- --port 9000  → ポートを変える
//
// 接続URLは本番（Cloudflare / PartyServer）と同じ形：  ws://localhost:8787/parties/room/<ルームコード>
// → 画面側のコードは、開発用と本番で接続先のホスト名を変えるだけで済む。
//
// ※ 本番用ではない。ルームの状態はメモリ上にしかなく、再起動すると消える。
import http from 'node:http';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { registerTsHook } from './ts-hook.mjs';

const require = registerTsHook();
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { Room } = require(path.join(root, 'src/online/room.ts'));
const { isValidRoomCode } = require(path.join(root, 'src/online/roomCode.ts'));
const pool = require(path.join(root, 'src/data/cardPool.json'));

const portArg = process.argv.indexOf('--port');
const PORT = portArg > -1 ? Number(process.argv[portArg + 1]) : Number(process.env.PORT || 8787);
const ALLOW_SPECTATORS = process.argv.includes('--spectators');
const MAX_PAYLOAD = 64 * 1024;
const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

// ---------------------------------------------------------------------------
// WebSocket フレームの読み書き（RFC 6455 の必要最小限）
// ---------------------------------------------------------------------------
function encodeFrame(opcode, payload) {
  const len = payload.length;
  let header;
  if (len < 126) {
    header = Buffer.from([0x80 | opcode, len]);
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x80 | opcode;
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x80 | opcode;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  return Buffer.concat([header, payload]);
}

/** バッファの先頭から1フレーム読む。足りなければ null */
function decodeFrame(buf) {
  if (buf.length < 2) return null;
  const fin = (buf[0] & 0x80) !== 0;
  const opcode = buf[0] & 0x0f;
  const masked = (buf[1] & 0x80) !== 0;
  let len = buf[1] & 0x7f;
  let off = 2;
  if (len === 126) {
    if (buf.length < 4) return null;
    len = buf.readUInt16BE(2);
    off = 4;
  } else if (len === 127) {
    if (buf.length < 10) return null;
    const big = buf.readBigUInt64BE(2);
    if (big > BigInt(MAX_PAYLOAD)) return { tooBig: true };
    len = Number(big);
    off = 10;
  }
  if (len > MAX_PAYLOAD) return { tooBig: true };
  let mask = null;
  if (masked) {
    if (buf.length < off + 4) return null;
    mask = buf.subarray(off, off + 4);
    off += 4;
  }
  if (buf.length < off + len) return null;
  const payload = Buffer.from(buf.subarray(off, off + len));
  if (mask) for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i % 4];
  return { fin, opcode, payload, consumed: off + len };
}

// ---------------------------------------------------------------------------
// ルームの管理（URLのルームコードごとに Room を1つ持つ）
// ---------------------------------------------------------------------------
/** @type {Map<string, {room: any, sockets: Map<string, import('node:net').Socket>, timer: NodeJS.Timeout | null}>} */
const rooms = new Map();

function getRoom(code) {
  let entry = rooms.get(code);
  if (entry) return entry;
  entry = { room: null, sockets: new Map(), timer: null };
  entry.room = new Room(
    { now: () => Date.now(), rng: Math.random, pool, allowSpectators: ALLOW_SPECTATORS },
    {
      send: (connId, message) => {
        const socket = entry.sockets.get(connId);
        if (socket && !socket.destroyed) socket.write(encodeFrame(0x1, Buffer.from(JSON.stringify(message))));
      },
      close: (connId) => {
        const socket = entry.sockets.get(connId);
        if (socket && !socket.destroyed) {
          socket.write(encodeFrame(0x8, Buffer.from([0x03, 0xe8])));
          socket.end();
        }
      },
    }
  );
  rooms.set(code, entry);
  return entry;
}

/** 次の期限に合わせて tick() を呼ぶ予約を付け直す（本番の alarm に相当） */
function rearm(code, entry) {
  if (entry.timer) clearTimeout(entry.timer);
  entry.timer = null;
  const next = entry.room.nextDeadline();
  if (next !== null) {
    entry.timer = setTimeout(() => {
      entry.room.tick();
      rearm(code, entry);
    }, Math.max(0, next - Date.now()) + 1);
  } else if (entry.sockets.size === 0) {
    rooms.delete(code); // 期限もなく、誰もいなければ片付ける
  }
}

// ---------------------------------------------------------------------------
// HTTP サーバー（WebSocket の upgrade だけを処理する）
// ---------------------------------------------------------------------------
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
  res.end('TMC online dev server\n');
});

server.on('upgrade', (req, socket) => {
  const match = /^\/parties\/room\/([^/?#]+)/.exec(req.url || '');
  const key = req.headers['sec-websocket-key'];
  if (!match || !isValidRoomCode(match[1]) || !key) {
    socket.write('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
    socket.destroy();
    return;
  }
  const code = match[1];
  const accept = crypto.createHash('sha1').update(key + GUID).digest('base64');
  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n' + `Sec-WebSocket-Accept: ${accept}\r\n\r\n`
  );

  const connId = crypto.randomUUID();
  const entry = getRoom(code);
  entry.sockets.set(connId, socket);
  entry.room.handleOpen(connId);
  rearm(code, entry);

  let buf = Buffer.alloc(0);
  let fragments = [];
  let closed = false;

  const finish = () => {
    if (closed) return;
    closed = true;
    entry.sockets.delete(connId);
    entry.room.handleClose(connId);
    rearm(code, entry);
  };

  socket.on('data', (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    for (;;) {
      const frame = decodeFrame(buf);
      if (!frame) return;
      if (frame.tooBig) {
        socket.write(encodeFrame(0x8, Buffer.from([0x03, 0xf1]))); // 1009: Message Too Big
        socket.end();
        return;
      }
      buf = buf.subarray(frame.consumed);

      if (frame.opcode === 0x8) {
        socket.write(encodeFrame(0x8, frame.payload.subarray(0, 2)));
        socket.end();
        return;
      }
      if (frame.opcode === 0x9) {
        socket.write(encodeFrame(0xa, frame.payload)); // ping → pong
        continue;
      }
      if (frame.opcode === 0xa) continue;

      if (frame.opcode === 0x1 || frame.opcode === 0x2) fragments = [frame.payload];
      else if (frame.opcode === 0x0) fragments.push(frame.payload);
      else continue;

      if (frame.fin) {
        const text = Buffer.concat(fragments).toString('utf8');
        fragments = [];
        entry.room.handleMessage(connId, text);
        rearm(code, entry);
      }
    }
  });
  socket.on('close', finish);
  socket.on('error', finish);
});

server.listen(PORT, () => {
  console.log(`TMC online dev server: ws://localhost:${PORT}/parties/room/<ルームコード>`);
  console.log(ALLOW_SPECTATORS ? '観戦: 有効' : '観戦: 無効（--spectators で有効化）');
});
