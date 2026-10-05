# TMC オンライン対戦サーバー（Cloudflare）

ゲーム本体（Vercel）とは別に、オンライン対戦の通信を受け持つサーバーです。
試合のルールは `../src/online/` にあり、ここ（`index.ts`）はそれをCloudflareにつなぐ薄い層です。

> **この `worker/` フォルダは、ゲーム本体とは別に `npm install` します。**
> （`wrangler` などは容量が大きいため、Vercelでのゲーム本体のビルドに影響しないよう分けてあります）

## 確認の段階（上から順に進めてください）

### 段階1：自分のPCだけで確認する（Cloudflare不要）

ゲーム本体のフォルダ（`tmc-battle-game`）で、ターミナルを2つ使います。

```bash
# ターミナル1：開発用サーバーを起動（止めるときは Ctrl + C）
npm run dev:online

# ターミナル2：通しの確認を実行
npm run smoke:online
```

最後に **「全ての確認に成功しました ✅」** と出れば成功です。

### 段階2：Cloudflareと同じ環境をPC上で再現して確認する

```bash
cd worker
npm install
npx wrangler dev
```

`Ready on http://localhost:8787` と出たら、**別のターミナル**（ゲーム本体のフォルダ）で：

```bash
npm run smoke:online
```

※ 段階1の開発用サーバーと同じポート（8787）を使うので、**同時には起動しないでください**。
※ ログインは不要です（PC上で完結します）。

### 段階3：Cloudflareにデプロイする

```bash
cd worker
npx wrangler login      # ブラウザが開くので、Cloudflareにログインして許可する
npx wrangler deploy
```

完了すると `https://tmc-online.<あなたのサブドメイン>.workers.dev` というURLが表示されます。
ゲーム本体のフォルダに戻って、通しの確認を実行します（`https` を `wss` に変えて指定します）：

```bash
npm run smoke:online -- wss://tmc-online.<あなたのサブドメイン>.workers.dev
```

## 設定（`wrangler.jsonc`）

| 項目 | 内容 |
|---|---|
| `ALLOWED_ORIGINS` | ブラウザからの接続を許可するサイト（カンマ区切り）。Vercelの確認用デプロイ（ブランチごとのURL）から接続するときは、そのURLを追加する |
| `ALLOW_SPECTATORS` | `"true"` で観戦を許可（フェーズ1.5で使用） |

## 料金の目安（2026年10月時点の公式ドキュメントによる。デプロイ前に最新を確認してください）

- 無料プラン（Workers Free）で、SQLite方式のDurable Objectsを使えます。この設定は、その方式です
- 無料枠の目安：DOへのリクエスト月約300万（受信メッセージは20通で1回換算）、**稼働時間 月約39万GB-秒**、保存の書き込み月約300万行（いずれも毎日0時UTCにリセット）
- 今の作りは、接続している間ずっと稼働時間が加算されます。128MBで1試合10分なら約75GB-秒で、**無料枠では1日に約170試合**が目安です
- 無料プランでは請求は発生しません。上限に達した場合は、請求ではなく、その日の残りが利用できなくなります（毎日0時UTC＝日本時間9時にリセット）
- 利用が増えたら、有料プラン（月$5〜）や、接続の合間にサーバーを休ませる機能（ハイバネーション）の導入を検討します

## よくあるつまずき

- `wrangler dev` で `Address already in use`：段階1の開発用サーバーが動いたままです。止めてから実行してください
- `wrangler deploy` で認証エラー：`npx wrangler login` をやり直してください
- ブラウザの画面から接続できず、サーバー側のログに `403`：`ALLOWED_ORIGINS` に、その画面のURLを追加してください
