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

## 更新したとき（サーバーの内容を変えたとき）

サーバーの内容（`index.ts` や `../src/online/` の試合ルール）を更新したら、再デプロイします。

```bash
cd worker
npx wrangler deploy
```

デプロイ後に、ゲーム本体のフォルダで通しの確認を実行してください（`npm run smoke:online -- wss://tmc-online.<サブドメイン>.workers.dev`）。
通しの確認には、何も送らない接続を切る確認があり、完了まで約10秒余計にかかります。

## 緊急停止スイッチ

何か問題が起きたときに、新しい接続を全て断ります。

1. `wrangler.jsonc` の `"ONLINE_ENABLED"` を `"false"` に書き換える
2. `npx wrangler deploy`

元に戻すときは、`"true"` に戻して、もう一度デプロイします。すでに接続中の対戦は、そのまま続きます。

## 設定（`wrangler.jsonc`）

| 項目 | 内容 |
|---|---|
| `ALLOWED_ORIGINS` | ブラウザからの接続を許可するサイト（カンマ区切り）。`*` を含むパターン（例：`https://tmc-battle-game-*-bayes-r.vercel.app`）も使える。`*` は「英小文字・数字・ハイフン」にだけ一致し、ドットには一致しない（別のドメインに紛れ込めない）。Vercelの確認用デプロイから接続するときは、そのURLが許可されている必要がある |
| `ALLOW_SPECTATORS` | `"true"` で観戦を許可（フェーズ1.5で使用） |
| `ONLINE_ENABLED` | `"false"` で、新しい接続を全て断る（緊急停止スイッチ） |

## 料金の目安（2026年10月時点の公式ドキュメントによる。デプロイ前に最新を確認してください）

- 無料プラン（Workers Free）で、SQLite方式のDurable Objectsを使えます。この設定は、その方式です
- 無料枠の目安：DOへのリクエスト月約300万（受信メッセージは20通で1回換算）、**稼働時間 月約39万GB-秒**、保存の書き込み月約300万行（いずれも毎日0時UTCにリセット）
- 今の作りは、接続している間ずっと稼働時間が加算されます。128MBで1試合10分なら約75GB-秒で、**無料枠では1日に約170試合**が目安です
- 無料プランでは請求は発生しません。上限に達した場合は、請求ではなく、その日の残りが利用できなくなります（毎日0時UTC＝日本時間9時にリセット）
- 利用が増えたら、有料プラン（月$5〜）や、接続の合間にサーバーを休ませる機能（ハイバネーション）の導入を検討します

## 対戦ログ（運営者用の匿名統計）のセットアップ

試合が終わるたびに、1試合を1行、Cloudflare の D1（データベース）に記録します。カードごとの勝率や、よく使われるデッキが分かり、バランス調整に使えます。
**D1を用意しなくても、サーバーは今までどおり動きます**（記録されないだけです）。

**記録される内容**：終了時刻（秒）、何戦目か、終わり方、勝者の席（A/B）、両者のデッキ（カードID）、各ラウンドの結果
**記録されない内容**：表示名、再接続用のtoken、ルームコード、IPアドレス（利用者を特定できる情報は、一切保存しません）
**保存期間**：90日。毎日（日本時間の午前3時）、これより古い記録を自動で削除します（`LOG_RETENTION_DAYS` で変更できます）

### 手順（初回だけ）

```bash
cd worker
npx wrangler d1 create tmc-online-logs
```

表示された `database_id`（`xxxxxxxx-xxxx-...` の形）をコピーします。「設定ファイルに追加しますか」のように聞かれたら、**いいえ**を選んでください（次の手順で手動で書き換えます。コメントが保たれるためです）。

1. `wrangler.jsonc` を開き、`// "d1_databases": [...]` の行の**行頭の `//` を外して**、`ここに表示されたIDを入れる` の部分を、コピーしたIDに書き換えて保存します。
2. テーブルを作ります。

```bash
npx wrangler d1 execute tmc-online-logs --remote --file=schema.sql
```

3. サーバーを再デプロイします。

```bash
npx wrangler deploy
```

4. 動作確認として、ゲーム本体のフォルダで通しの確認を実行します。通しの確認の対戦（2試合）も記録されるので、**確認が済んだら、一度全て消してください**（統計に、確認用の対戦が混ざらないようにするため）。

```bash
cd ..
npm run smoke:online -- wss://tmc-online.<サブドメイン>.workers.dev
cd worker
npx wrangler d1 execute tmc-online-logs --remote --command "DELETE FROM matches"
```

### 集計を見る

ゲーム本体のフォルダで、次を実行します。

```bash
npm run stats               # 全ての集計
npm run stats -- cards      # カードごとの採用数・勝率だけ（summary / reasons / cards / decks）
npm run stats -- --dry      # 実行するSQLを表示するだけ
```

表示される集計：日別の試合数（直近14日）、終わり方の内訳、カードごとの採用数とデッキ勝率・ラウンド勝率、よく使われたデッキ。
カードは、同じ名前の別のカードを区別するため、**「名前（Legacy・MP・PP・Void）」**の形で表示します（例：`CHARLIE THE FROG（環・MP1・愛+3・Void）`）。デッキは、5枚を1枚ずつ縦に並べて表示します。
カードごとの集計は、通常の決着の試合だけが対象です。「デッキ勝率」は、そのカードを入れたデッキが試合に勝った割合、「ラウンド勝率」は、そのカードを出したラウンドに勝った割合です。

### 止める・消す

| やりたいこと | 方法 |
|---|---|
| 記録を止める | `wrangler.jsonc` の `"LOG_MATCHES"` を `"false"` にして `npx wrangler deploy`（すでにある記録は残る） |
| 全ての記録を消す | `npx wrangler d1 execute tmc-online-logs --remote --command "DELETE FROM matches"` |
| 保存期間を変える | `wrangler.jsonc` の `"LOG_RETENTION_DAYS"` を書き換えて `npx wrangler deploy` |

### 料金の目安

D1の無料枠は、書き込みが1日10万行、保存が合計5GBまでです（毎日0時UTCにリセット。公式の料金ページによる）。1試合を1行で記録するので、書き込みは1日10万試合まで収まり、保存も数百万試合ぶんの余裕があります。

## よくあるつまずき

- `npm install` で `ERESOLVE could not resolve`：部品（wrangler / partyserver / @cloudflare/workers-types）のバージョンの組み合わせが合っていません。`package.json` の3つのバージョンを、エラーに出ている最新の組み合わせに合わせてください（2026年10月時点では、workers-types は 5系）

- `wrangler dev` で `Address already in use`：段階1の開発用サーバーが動いたままです。止めてから実行してください
- `wrangler deploy` で認証エラー：`npx wrangler login` をやり直してください
- ブラウザの画面から接続できず、サーバー側のログに `403`：`ALLOWED_ORIGINS` に、その画面のURLを追加してください
