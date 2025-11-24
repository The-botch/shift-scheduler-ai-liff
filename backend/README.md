# Shift Reminder Backend

シフト提出リマインドを送信するバックエンドサービス

## セットアップ

1. 依存関係をインストール
```bash
cd backend
npm install
```

2. 環境変数を設定
```bash
cp .env.example .env
# .env ファイルを編集してDB接続情報とLINE Channel Access Tokenを設定
```

3. 必要な環境変数
- `DATABASE_URL`: shift-scheduler-aiのPostgreSQL接続URL
- `LINE_CHANNEL_ACCESS_TOKEN`: LINE Messaging APIのアクセストークン
- `TENANT_ID`: テナントID（デフォルト: 3）

## 使い方

### 開発環境で起動
```bash
npm run dev
```

### 本番環境で起動
```bash
npm start
```

### 手動でリマインダー送信（テスト用）
```bash
# 2025年12月分のリマインドを送信
npm run test-reminder 2025 12
```

### APIエンドポイント

#### ヘルスチェック
```
GET /
```

#### 手動リマインダー送信
```
POST /api/send-reminder
Content-Type: application/json

{
  "year": 2025,
  "month": 12
}
```

## Cronスケジュール

毎月5日と8日の10:00に、翌月分のシフト提出リマインドを自動送信します。

## デプロイ

Railwayにデプロイする場合：
1. Railwayプロジェクトを作成
2. 環境変数を設定
3. `backend`ディレクトリをデプロイ
