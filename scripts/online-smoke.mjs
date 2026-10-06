// オンライン対戦サーバーの通し確認（スモークテスト）
// ------------------------------------------------------------------
// 本物のWebSocketで2人分のクライアントを動かし、対戦を最後まで行う。
// 開発用サーバーでも、Cloudflareにデプロイしたサーバーでも、同じ内容を確認できる。
//
//   npm run dev:online            （別のターミナルで起動しておく）
//   npm run smoke:online          → ws://localhost:8787 に対して実行
//   npm run smoke:online -- wss://あなたのサーバー.workers.dev
//
// 確認すること：参加と席の割り当て／満員／不正なメッセージ／デッキ提出／対戦の進行／
//               途中の切断と同じ席への再接続／両者から見た結果の一致／終了後に「閉じる期限」だけが残ること／
//               再戦（希望・取り消し・両者の同意でデッキ構築に戻る・2戦目の完走）／
//               何も送らない接続が約10秒で切られること（サーバーの alarm が実際に動く確認でもある）
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { registerTsHook } from './ts-hook.mjs';

const require = registerTsHook();
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { generateLevelTunedNpcDeck } = require(path.join(root, 'src/logic/npcDeckGenerator.ts'));
const { generateRoomCode } = require(path.join(root, 'src/online/roomCode.ts'));
const pool = require(path.join(root, 'src/data/cardPool.json'));

const base = (process.argv[2] || 'ws://localhost:8787').replace(/\/$/, '');
const code = generateRoomCode(Math.random);
const url = `${base}/parties/room/${code}`;

const failures = [];
const check = (cond, label) => {
  if (cond) console.log(`  ✓ ${label}`);
  else {
    console.log(`  ✗ ${label}`);
    failures.push(label);
  }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class Client {
  constructor(label, token) {
    this.label = label;
    this.token = token;
    this.state = null; // 最新の state メッセージ
    this.errors = [];
    this.waiters = [];
    this.autoplay = false;
    this.received = 0;
  }
  open() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(url);
      this.ws.onopen = () => resolve();
      this.ws.onerror = () => reject(new Error(`${this.label}: 接続できません（${url}）`));
      this.ws.onmessage = (ev) => this.onMessage(JSON.parse(String(ev.data)));
    });
  }
  hello() {
    this.send({ t: 'hello', token: this.token });
  }
  send(obj) {
    this.ws.send(typeof obj === 'string' ? obj : JSON.stringify(obj));
  }
  close() {
    this.ws.close();
  }
  onMessage(msg) {
    this.received++;
    if (msg.t === 'error') this.errors.push(msg.code);
    if (msg.t === 'state') this.state = msg;
    if (this.autoplay && msg.t === 'state') this.play(msg.view);
    this.waiters = this.waiters.filter((w) => !w.test(msg) || (w.resolve(msg), false));
  }
  /** 手番が来たら自動で進める（カードは残りからランダムに選ぶ） */
  play(view) {
    if (view.phase === 'pick' && !view.selfHasPicked && view.selfRemaining.length > 0) {
      const card = view.selfRemaining[Math.floor(Math.random() * view.selfRemaining.length)];
      this.send({ t: 'pick', instanceId: card.instanceId });
    } else if (view.phase === 'reveal' && !view.selfHasAcked) {
      this.send({ t: 'ack_reveal' });
    }
  }
  waitFor(label, test, ms = 8000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`${this.label}: 「${label}」を待っている間にタイムアウトしました`)), ms);
      this.waiters.push({ test, resolve: (m) => (clearTimeout(timer), resolve(m)) });
      // すでに条件を満たしている場合は即座に解決する
      if (this.state && test(this.state)) {
        clearTimeout(timer);
        this.waiters.pop();
        resolve(this.state);
      }
    });
  }
  waitForPhase(phase, ms) {
    return this.waitFor(`phase=${phase}`, (m) => m.t === 'state' && m.view.phase === phase, ms);
  }
}

async function main() {
  console.log(`接続先: ${url}\n`);
  const a = new Client('プレイヤーA', crypto.randomUUID());
  const b = new Client('プレイヤーB', crypto.randomUUID());

  console.log('1. 参加');
  await a.open();
  a.hello();
  await a.waitForPhase('lobby');
  check(a.state.view.viewer === 'A', '最初の参加者は席A');
  await b.open();
  b.hello();
  await a.waitForPhase('deck');
  await b.waitForPhase('deck');
  check(b.state.view.viewer === 'B', '2人目は席B');
  check(a.state.view.selfPlayer.name !== a.state.view.enemyPlayer.name, '表示名が自動生成され、互いに異なる');

  console.log('2. 満員・不正なメッセージ');
  const c = new Client('3人目', crypto.randomUUID());
  await c.open();
  c.hello();
  await sleep(300);
  check(c.errors.includes('room-full'), '3人目は「満員」で断られる');
  a.send('これはJSONではありません');
  await sleep(300);
  check(a.errors.includes('bad-message'), '不正なメッセージはエラーで返される');

  console.log('3. デッキ提出');
  const deckA = generateLevelTunedNpcDeck(pool, 'Lv1').map((x) => x.id);
  const deckB = generateLevelTunedNpcDeck(pool, 'Lv1').map((x) => x.id);
  a.send({ t: 'submit_deck', cardIds: ['存在しないカード'] });
  await sleep(300);
  check(a.errors.includes('invalid-deck'), '不正なデッキは拒否される');
  a.send({ t: 'submit_deck', cardIds: deckA });
  b.send({ t: 'submit_deck', cardIds: deckB });
  await a.waitForPhase('pick');
  await b.waitForPhase('pick');
  check(a.state.view.selfRemaining.length === 5, '自分の手札5枚が届く');
  check(a.state.view.enemyRemainingCount === 5 && !JSON.stringify(a.state).includes('"B:'), '相手の手札の中身は届かない（枚数のみ）');
  check(a.state.timers.pickDeadlineAt > a.state.timers.serverNow, '選択の制限時間が届く');

  console.log('4. 1ラウンド目を進めてから、Aが切断して再接続する');
  for (const cl of [a, b]) cl.autoplay = false;
  const first = a.state.view.selfRemaining[0].instanceId;
  a.send({ t: 'pick', instanceId: first });
  b.send({ t: 'pick', instanceId: b.state.view.selfRemaining[0].instanceId });
  await a.waitForPhase('reveal');
  await b.waitForPhase('reveal');
  check(a.state.view.rounds.length === 1, '1ラウンド目が公開された');

  a.close();
  await b.waitFor('相手の切断通知', (m) => m.t === 'state' && m.connected.enemy === false);
  check(b.state.timers.graceDeadlineAt !== null, '切断の猶予（不戦敗になる時刻）が相手に届く');
  const a2 = new Client('プレイヤーA(再接続)', a.token);
  await a2.open();
  a2.hello();
  await a2.waitFor('再接続', (m) => m.t === 'state' && m.view.viewer === 'A' && m.view.rounds.length === 1);
  check(true, '同じ token で同じ席に戻れ、進行中の対戦が復元された');
  await b.waitFor('復帰通知', (m) => m.t === 'state' && m.connected.enemy === true);
  check(b.state.timers.graceDeadlineAt === null, '復帰すると猶予が解除される');

  console.log('5. 最後まで対戦する');
  for (const cl of [a2, b]) {
    cl.autoplay = true;
    cl.play(cl.state.view);
  }
  await a2.waitForPhase('finished', 20000);
  await b.waitForPhase('finished', 20000);
  const va = a2.state.view;
  const vb = b.state.view;
  check(va.endReason === 'normal' && vb.endReason === 'normal', '通常の決着');
  check(va.matchWinner !== null && va.matchWinner !== vb.matchWinner, '勝者が両者で食い違わない（片方が self、もう片方が enemy）');
  check(
    va.rounds.length === vb.rounds.length && va.rounds.every((r, i) => r.selfCard.id === vb.rounds[i].enemyCard.id && r.enemyCard.id === vb.rounds[i].selfCard.id),
    '全ラウンドの記録が、両者から見て鏡写しで一致する'
  );
  check(va.rounds.length === 5, `通常戦は5戦行われた（サドンデス: ${va.isSuddenDeath ? `あり・${va.suddenDeathRounds.length}戦` : 'なし'}）`);
  check(
    [a2.state.timers, b.state.timers].every((t) => t.pickDeadlineAt === null && t.revealDeadlineAt === null && t.deckDeadlineAt === null && t.graceDeadlineAt === null),
    '終了後に、対戦中のタイマー（選択・公開・デッキ・切断の猶予）が残っていない'
  );
  check(
    [a2.state.timers, b.state.timers].every((t) => typeof t.closeDeadlineAt === 'number' && t.closeDeadlineAt > t.serverNow),
    '終了後は、ルームを閉じる期限（約2分後）だけが伝わる'
  );

  console.log('6. 再戦');
  a2.autoplay = false;
  b.autoplay = false;
  a2.send({ t: 'rematch' });
  await b.waitFor('相手の再戦の希望', (m) => m.t === 'state' && m.view.rematchEnemyVoted === true);
  check(true, '一方が再戦を希望すると、相手の画面に伝わる');
  a2.send({ t: 'rematch_cancel' });
  await b.waitFor('希望の取り消し', (m) => m.t === 'state' && m.view.rematchEnemyVoted === false);
  check(true, '希望を取り消せる');
  a2.send({ t: 'rematch' });
  b.send({ t: 'rematch' });
  await a2.waitForPhase('deck');
  await b.waitForPhase('deck');
  check(a2.state.view.matchNumber === 2 && b.state.view.matchNumber === 2, '両者が希望すると、同じ2人で2戦目のデッキ構築に戻る');
  check(JSON.stringify(a2.state.view.selfLastDeckIds) === JSON.stringify(deckA), '前回のデッキのIDが、本人に届く');
  check(a2.state.view.rounds.length === 0 && a2.state.timers.closeDeadlineAt === null, '1戦目の記録は消え、閉じる期限も無くなる');
  check(a2.state.timers.deckDeadlineAt > a2.state.timers.serverNow, 'デッキ構築の制限時間が、新しく付く');
  a2.send({ t: 'submit_deck', cardIds: deckA });
  b.send({ t: 'submit_deck', cardIds: deckB });
  await a2.waitForPhase('pick');
  for (const cl of [a2, b]) {
    cl.autoplay = true;
    cl.play(cl.state.view);
  }
  await a2.waitForPhase('finished', 20000);
  await b.waitForPhase('finished', 20000);
  const v2a = a2.state.view;
  const v2b = b.state.view;
  check(v2a.endReason === 'normal' && v2a.matchWinner !== null && v2a.matchWinner !== v2b.matchWinner, '2戦目も最後まで進み、勝者が両者で食い違わない');
  check(v2a.rounds.length === 5 && v2a.rounds.every((r, i) => r.selfCard.id === v2b.rounds[i].enemyCard.id), '2戦目の記録が、1戦目と混ざらず、両者で鏡写しに一致する');

  console.log('7. 何も送らない接続は、約10秒で切られる');
  const idle = new Client('無言の接続', crypto.randomUUID());
  await idle.open();
  const closedByServer = await new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), 25000);
    idle.ws.onclose = () => {
      clearTimeout(timer);
      resolve(true);
    };
  });
  check(closedByServer, 'hello を送らない接続は、サーバーに切られる');
  check(idle.errors.includes('hello-timeout'), '理由（hello-timeout）が伝えられる');

  for (const cl of [a2, b, c]) cl.close();
}

const overall = setTimeout(() => {
  console.error('\n全体のタイムアウト（60秒）');
  process.exit(1);
}, 60000);

main()
  .then(() => {
    clearTimeout(overall);
    if (failures.length > 0) {
      console.error(`\n失敗: ${failures.length}件`);
      process.exit(1);
    }
    console.log('\n全ての確認に成功しました ✅');
    process.exit(0);
  })
  .catch((err) => {
    clearTimeout(overall);
    console.error('\n実行エラー:', err.message);
    process.exit(1);
  });
