import test from 'node:test';
import assert from 'node:assert/strict';
import { buildInviteUrl, resolveOnlineEntry, searchWithRoom } from '../src/online/entry';
import { buildRoomSocketUrl, DEFAULT_ONLINE_HOST, resolveServerHost } from '../src/online/serverHost';
import { clearToken, getOrCreateToken, secureRandom, type StorageLike } from '../src/online/session';

class MemoryStorage implements StorageLike {
  data = new Map<string, string>();
  getItem(k: string) {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.data.set(k, v);
  }
  removeItem(k: string) {
    this.data.delete(k);
  }
}
const brokenStorage: StorageLike = {
  getItem() {
    throw new Error('denied');
  },
  setItem() {
    throw new Error('denied');
  },
  removeItem() {
    throw new Error('denied');
  },
};

test('機能の切り替え：既定は無効。?online=1 で有効になり、そのタブでは保たれ、?online=0 で戻る', () => {
  const s = new MemoryStorage();
  assert.deepEqual(resolveOnlineEntry('', s), { enabled: false, roomCode: null });
  assert.deepEqual(resolveOnlineEntry('?online=1', s), { enabled: true, roomCode: null });
  assert.deepEqual(resolveOnlineEntry('', s), { enabled: true, roomCode: null }, 'リロードしても有効のまま');
  assert.deepEqual(resolveOnlineEntry('?online=0', s), { enabled: false, roomCode: null });
  assert.deepEqual(resolveOnlineEntry('', s), { enabled: false, roomCode: null }, '無効に戻った');
});

test('招待リンク：正しいルームコードがあれば有効になる。不正なコードは無視される', () => {
  const s = new MemoryStorage();
  assert.deepEqual(resolveOnlineEntry('?online=1&room=ABC234', s), { enabled: true, roomCode: 'ABC234' });
  assert.deepEqual(resolveOnlineEntry('?room=abc234', new MemoryStorage()), { enabled: true, roomCode: 'ABC234' }, '小文字も整える');
  for (const bad of ['ABC', 'ABCDEO', '../x', 'ABCDEFG', '']) {
    const r = resolveOnlineEntry(`?room=${bad}`, new MemoryStorage());
    assert.deepEqual(r, { enabled: false, roomCode: null }, `room=${bad}`);
  }
  // 不正なコードでも ?online=1 があれば有効（コードは使わない）
  assert.deepEqual(resolveOnlineEntry('?online=1&room=xxx', new MemoryStorage()), { enabled: true, roomCode: null });
  assert.deepEqual(resolveOnlineEntry('?online=0&room=ABC234', new MemoryStorage()), { enabled: false, roomCode: null }, '無効の指定が優先');
});

test('保存できない環境（プライベートモード等）でも、例外にならず動く', () => {
  assert.deepEqual(resolveOnlineEntry('?online=1', brokenStorage), { enabled: true, roomCode: null });
  assert.deepEqual(resolveOnlineEntry('', brokenStorage), { enabled: false, roomCode: null });
  assert.deepEqual(resolveOnlineEntry('?online=1', null), { enabled: true, roomCode: null });
});

test('招待リンクとURLのクエリの組み立て', () => {
  assert.equal(buildInviteUrl('https://example.test', '/', 'ABC234'), 'https://example.test/?online=1&room=ABC234');
  assert.equal(
    buildInviteUrl('http://localhost:5173', '/', 'ABC234', 'localhost:8787'),
    'http://localhost:5173/?online=1&room=ABC234&server=localhost%3A8787',
    '開発中のサーバー指定が引き継がれる'
  );
  // 受け取った側で、招待リンクがそのまま解釈できる（往復で壊れない）
  const roundTrip = buildInviteUrl('http://localhost:5173', '/', 'ABC234', 'localhost:8787').split('?')[1];
  assert.deepEqual(resolveOnlineEntry(`?${roundTrip}`, new MemoryStorage()), { enabled: true, roomCode: 'ABC234' });
  assert.equal(resolveServerHost(`?${roundTrip}`, true), 'localhost:8787');
  assert.equal(searchWithRoom('', 'ABC234'), '?online=1&room=ABC234');
  assert.equal(searchWithRoom('?server=localhost:8787&room=OLD123', 'ABC234'), '?server=localhost%3A8787&room=ABC234&online=1');
  assert.equal(searchWithRoom('?online=1&room=ABC234&server=localhost%3A8787', null), '?online=1&server=localhost%3A8787');
});

test('サーバーの接続先：本番が既定。?server= は開発ビルドでだけ有効で、不正な値は無視する', () => {
  assert.equal(resolveServerHost('', false), DEFAULT_ONLINE_HOST);
  assert.equal(resolveServerHost('?server=localhost:8787', false), DEFAULT_ONLINE_HOST, '公開版では上書きできない');
  assert.equal(resolveServerHost('?server=localhost:8787', true), 'localhost:8787');
  assert.equal(resolveServerHost('?server=evil.example/path', true), DEFAULT_ONLINE_HOST);
  assert.equal(resolveServerHost('?server=a b', true), DEFAULT_ONLINE_HOST);
  assert.equal(resolveServerHost('?server=javascript:alert(1)', true), DEFAULT_ONLINE_HOST);
});

test('接続URL：ローカルだけ ws、それ以外は wss', () => {
  assert.equal(buildRoomSocketUrl('localhost:8787', 'ABC234'), 'ws://localhost:8787/parties/room/ABC234');
  assert.equal(buildRoomSocketUrl('127.0.0.1:8787', 'ABC234'), 'ws://127.0.0.1:8787/parties/room/ABC234');
  assert.equal(buildRoomSocketUrl('tmc-online.tmc-fan.workers.dev', 'ABC234'), 'wss://tmc-online.tmc-fan.workers.dev/parties/room/ABC234');
  assert.equal(buildRoomSocketUrl('localhost.evil.example', 'ABC234'), 'wss://localhost.evil.example/parties/room/ABC234', 'localhost で始まる別ホストを誤判定しない');
});

test('token：ルームごとに保存され、同じタブでは同じ値が返り、別のルームとは別の値', () => {
  const s = new MemoryStorage();
  let n = 0;
  const make = () => `tok-${++n}`;
  const t1 = getOrCreateToken('ROOM11', s, make);
  assert.equal(getOrCreateToken('ROOM11', s, make), t1, 'リロードしても同じ token');
  assert.notEqual(getOrCreateToken('ROOM22', s, make), t1);
  clearToken('ROOM11', s);
  assert.notEqual(getOrCreateToken('ROOM11', s, make), t1, '消した後は新しい token');
  assert.equal(typeof getOrCreateToken('ROOM33', brokenStorage, make), 'string', '保存できなくても token は作れる');
});

test('secureRandom は 0以上1未満で、ばらける', () => {
  const seen = new Set<number>();
  for (let i = 0; i < 1000; i++) {
    const v = secureRandom();
    assert.ok(v >= 0 && v < 1);
    seen.add(v);
  }
  assert.ok(seen.size > 990);
});
