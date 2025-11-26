# シフト未提出リマインダーシステム仕様書

## ③ シフト未提出プッシュメッセージ

### 概要

アルバイトスタッフのシフト未提出を検出し、LINEプッシュメッセージでリマインドを送信する自動化システム

### システム構成

```
┌─────────────────────────────────────────┐
│   Railway (shift-scheduler-ai-liff)      │
│                                          │
│  ┌────────────────────────────────┐     │
│  │   Express Server (Port 8080)    │     │
│  │                                 │     │
│  │  ┌──────────────────────────┐  │     │
│  │  │   Cron Job                │  │     │
│  │  │   毎月5日・8日 10:00     │  │     │
│  │  └──────────┬───────────────┘  │     │
│  │             │                  │     │
│  │             ▼                  │     │
│  │  ┌──────────────────────────┐  │     │
│  │  │  reminderService.js       │  │     │
│  │  │  - 未提出スタッフ検出     │  │     │
│  │  │  - LINEメッセージ送信     │  │     │
│  │  └──────────┬───────────────┘  │     │
│  └─────────────┼────────────────┘     │
└────────────────┼──────────────────────┘
                 │
         ┌───────┴────────┐
         │                 │
         ▼                 ▼
   PostgreSQL        LINE Messaging API
  (Read Only)
```

### 機能説明

#### 対象スタッフ

**条件:**

1. 雇用形態が「アルバイト」（`payment_type = 'HOURLY'`）
2. LINE連携済み（`hr.staff_line_accounts.is_active = true`）
3. 対象月のシフト希望が未提出（`ops.shift_preferences` にレコードなし）

**除外:**

- 正社員、契約社員、業務委託など（`payment_type != 'HOURLY'`）
- シフト希望提出済みのスタッフ

#### 実行タイミング

**Cronスケジュール:**

```
0 10 5,8 * *
```

**意味:**

- 毎月5日 10:00 JST
- 毎月8日 10:00 JST

**送信内容:**

- N月5日・8日 → N+1月分のシフト希望リマインド
- 例: 12月5日・8日 → 2025年1月分のリマインド

**コード位置:** `backend/src/index.js` 行47-60

---

## データベースクエリ

### 未提出スタッフ検出

**SQL:**

```sql
SELECT
  sla.line_user_id,
  s.staff_id,
  s.name,
  s.employment_type,
  st.store_name
FROM hr.staff_line_accounts sla
JOIN hr.staff s ON sla.staff_id = s.staff_id
JOIN core.stores st ON s.store_id = st.store_id
JOIN core.employment_types et
  ON s.employment_type = et.employment_code
  AND et.tenant_id = s.tenant_id
WHERE sla.tenant_id = $1
  AND sla.is_active = true
  AND s.is_active = true
  AND et.payment_type = 'HOURLY'
  AND NOT EXISTS (
    SELECT 1 FROM ops.shift_preferences sp
    WHERE sp.staff_id = s.staff_id
      AND sp.year = $2
      AND sp.month = $3
  )
```

**パラメータ:**

- `$1`: tenant_id (3)
- `$2`: 対象年 (2025)
- `$3`: 対象月 (12)

**コード位置:** `backend/src/services/reminderService.js` 行16-42

---

## LINE メッセージ送信

### 使用API

**LINE Messaging API:**

- エンドポイント: `https://api.line.me/v2/bot/message/push`
- 認証: `Authorization: Bearer {LINE_CHANNEL_ACCESS_TOKEN}`

### メッセージ内容

```
【シフト提出リマインド】

{スタッフ名} さん、こんにちは！

{年}年{月}月のシフト希望がまだ提出されていません。

📅 提出期限: {締切年}年{締切月}月10日 23:59

以下のリンクからシフト希望を入力してください：
https://liff.line.me/{LIFF_ID}

ご協力をお願いいたします。
```

**例:**

```
【シフト提出リマインド】

山田太郎 さん、こんにちは！

2025年12月のシフト希望がまだ提出されていません。

📅 提出期限: 2025年11月10日 23:59

以下のリンクからシフト希望を入力してください：
https://liff.line.me/2008227932-Rq9rJrJn

ご協力をお願いいたします。
```

**コード位置:** `backend/src/services/reminderService.js` 行68-91

---

## API エンドポイント

### ヘルスチェック

```
GET /
```

**レスポンス:**

```json
{
  "status": "ok",
  "service": "Shift Reminder Service",
  "timestamp": "2025-11-25T04:50:58.714Z"
}
```

### 手動リマインダー送信

```
POST /api/send-reminder
Content-Type: application/json

{
  "year": 2025,
  "month": 12
}
```

**レスポンス:**

```json
{
  "success": true,
  "message": "Reminders sent for 2025/12",
  "count": 3,
  "results": [
    {
      "staff_id": 391,
      "name": "山田太郎",
      "success": true
    },
    {
      "staff_id": 395,
      "name": "佐藤花子",
      "success": true
    },
    {
      "staff_id": 398,
      "name": "鈴木一郎",
      "success": false,
      "error": "LINE送信エラー"
    }
  ]
}
```

**コード位置:** `backend/src/index.js` 行20-45

---

## 環境変数

### 必須

```bash
# PostgreSQL接続
DATABASE_URL=postgresql://postgres:password@host:port/railway

# LINE Messaging API
LINE_CHANNEL_ACCESS_TOKEN=your_channel_access_token

# LIFF設定
LIFF_ID=2008227932-Rq9rJrJn

# システム設定
TENANT_ID=3
NODE_ENV=production
PORT=3001
```

**設定場所:**

- ローカル開発: `backend/.env`
- Railway: プロジェクトの環境変数設定

---

## ログ出力

### 起動時

```
🚀 Shift Reminder Service running on port 8080
📅 Cron job scheduled: Reminders will be sent on 5th and 8th of each month at 10:00
```

### Cron実行時

```
⏰ Cron job triggered: Sending reminders for 2025/12
📅 Sending shift reminders for 2025/12
✅ Database connected successfully
📝 Found 3 staff who haven't submitted
✅ Message sent to Ue206d8fbbf68d60c031c9ffdbb5bd41b
✅ Message sent to Udae22736840a02bf209d13b6c25de42f
✅ Message sent to U310e32115e3accdbe4e8b2c2f9ff1cfe
✅ Sent 3/3 reminders successfully
✅ Cron job completed: { success: true, count: 3, results: [...] }
```

### エラー時

```
❌ Error fetching unsubmitted staff: <error details>
❌ Error sending message to U310e32115e3accdbe4e8b2c2f9ff1cfe: <error details>
❌ Cron job failed: <error details>
```

---

## デプロイ

### Railway設定

**プロジェクト:** lucky-appreciation (production)

**サービス:** shift-scheduler-ai-liff

**設定:**

- Repository: `The-botch/shift-scheduler-ai-liff`
- Root Directory: `/backend`
- Branch: `main`
- Build Command: `npm install`
- Start Command: `npm start`

**公開URL:**

```
https://shift-scheduler-ai-liff-production.up.railway.app
```

---

## テスト手順

### 1. ローカルテスト

```bash
cd backend
npm install
npm run dev
```

### 2. 手動リマインド送信

```bash
# 方法1: npm script
npm run test-reminder 2025 12

# 方法2: Node.js直接実行
node src/jobs/shiftReminder.js 2025 12

# 方法3: API経由
curl -X POST http://localhost:3001/api/send-reminder \
  -H "Content-Type: application/json" \
  -d '{"year": 2025, "month": 12}'
```

### 3. 本番環境テスト

```bash
curl -X POST https://shift-scheduler-ai-liff-production.up.railway.app/api/send-reminder \
  -H "Content-Type: application/json" \
  -d '{"year": 2025, "month": 12}'
```

---

## トラブルシューティング

### メッセージが送信されない

**確認項目:**

1. Railway環境変数が正しく設定されているか
2. LINE_CHANNEL_ACCESS_TOKENが有効か
3. データベース接続が成功しているか
4. 対象スタッフが存在するか（未提出のアルバイト）

**ログ確認:**

```
Railwayダッシュボード → サービス → Logs
```

### Cronジョブが実行されない

**確認項目:**

1. サーバーが起動しているか
2. タイムゾーンがJSTか（Railway環境変数 `TZ=Asia/Tokyo`）
3. ログに "Cron job scheduled" が出力されているか

### データベース接続エラー

**確認項目:**

1. DATABASE_URLが正しいか
2. PostgreSQLサービスが起動しているか
3. ネットワーク接続が可能か

---

## メンテナンス

### リマインドスケジュール変更

`backend/src/index.js` の48行目を編集:

```javascript
// 現在: 毎月5日・8日 10:00
cron.schedule('0 10 5,8 * *', () => { ... })

// 例: 毎月3日・7日 9:00に変更
cron.schedule('0 9 3,7 * *', () => { ... })
```

### メッセージ内容変更

`backend/src/services/reminderService.js` の68-91行目を編集

### 対象者の条件変更

`backend/src/services/reminderService.js` の16-42行目のSQLを編集

---

## セキュリティ

### 機密情報管理

- `.env` ファイルは `.gitignore` で除外
- 環境変数はRailwayで管理
- LINE_CHANNEL_ACCESS_TOKENは外部公開禁止

### アクセス制御

- データベースは読み取り専用
- 書き込み処理なし（安全性重視）

### エラーハンドリング

- try-catchで全エラーをキャッチ
- ログにエラー詳細を出力
- スタッフごとに独立してエラーハンドリング（1件失敗しても他は送信）

---

## パフォーマンス

### 同時実行

現在は順次実行（for loop）

大量のスタッフがいる場合は並列化を検討:

```javascript
await Promise.all(
  unsubmittedStaff.map(staff => sendLineMessage(staff.line_user_id, message))
);
```

### データベースクエリ

- インデックス推奨:
  - `hr.staff_line_accounts(line_user_id)`
  - `ops.shift_preferences(staff_id, year, month)`

---

## 今後の拡張案

1. **リマインド回数制限**: 同じ月に何度も送らないようにする
2. **既読確認**: LINEのWebhookで既読を検知
3. **レポート機能**: 月次の未提出率をSlack通知
4. **カスタマイズ**: 店舗ごとにメッセージ内容を変更
5. **多言語対応**: スタッフの言語設定に応じてメッセージ切り替え
