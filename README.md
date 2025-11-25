# Shift Scheduler LIFF Application

シフトスケジューラーのLINE Front-end Framework (LIFF) アプリケーションとリマインダーサービス

## 概要

LINE公式アカウントと連携したシフト管理システムのフロントエンド部分です。

### 主な機能

1. **ユーザー登録**: LINEアカウントとスタッフ情報を紐付け
2. **シフト希望入力（アルバイト）**: 出勤可能な日と時間帯を選択
3. **休み希望入力（社員）**: 第1案の出勤日から休み希望を選択
4. **シフト未提出リマインダー**: 未提出のアルバイトに自動通知

## システム構成

```
shift-scheduler-ai-liff/
├── index.html                 # LIFFアプリケーション (Vercelにデプロイ)
├── backend/                   # リマインダーサービス (Railwayにデプロイ)
│   ├── src/
│   │   ├── index.js          # Expressサーバー & Cronジョブ
│   │   ├── config/
│   │   │   └── database.js   # PostgreSQL接続設定
│   │   ├── services/
│   │   │   └── reminderService.js  # リマインド送信ロジック
│   │   └── jobs/
│   │       └── shiftReminder.js     # 手動実行スクリプト
│   ├── package.json
│   └── README.md
└── docs/                      # ドキュメント
    ├── ARCHITECTURE.md        # システムアーキテクチャ
    ├── LIFF_FEATURES.md       # LIFF機能仕様
    └── REMINDER_SYSTEM.md     # リマインダーシステム仕様
```

## クイックスタート

### LIFFアプリケーション

1. LINEアプリでLIFFのURLを開く
2. LINE認証を実施
3. スタッフ登録 or シフト入力

### リマインダーサービス（開発環境）

```bash
cd backend
npm install
cp .env.example .env
# .env ファイルを編集して環境変数を設定
npm run dev
```

## デプロイ

### Vercel (LIFFフロントエンド)

- 自動デプロイ: mainブランチへのpush時
- デプロイ対象: `index.html`
- URL: https://shift-scheduler-ai-liff.vercel.app

### Railway (リマインダーバックエンド)

- Root Directory: `/backend`
- ビルドコマンド: `npm install`
- 起動コマンド: `npm start`
- URL: https://shift-scheduler-ai-liff-production.up.railway.app

## ドキュメント

詳細な仕様は `docs/` フォルダを参照してください:

- [システムアーキテクチャ](docs/ARCHITECTURE.md)
- [LIFF機能仕様](docs/LIFF_FEATURES.md)
- [リマインダーシステム仕様](docs/REMINDER_SYSTEM.md)

## 技術スタック

### フロントエンド
- HTML/CSS/JavaScript (Vanilla)
- LIFF SDK v2

### バックエンド
- Node.js + Express
- PostgreSQL (pg)
- node-cron
- @line/bot-sdk

## ライセンス

ISC

## 開発者

Generated with Claude Code
