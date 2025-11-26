# システムアーキテクチャ

## 概要

シフトスケジューラーシステムのLIFFアプリケーションとリマインダーサービス

## システム構成

```
┌─────────────────────────────────────────────────────────────┐
│                        ユーザー (LINE)                        │
└───────────────────┬─────────────────────────────────────────┘
                    │
                    │ LIFF SDK
                    ▼
┌─────────────────────────────────────────────────────────────┐
│           LIFF Frontend (Vercel)                             │
│  - ユーザー登録                                                │
│  - シフト希望入力（アルバイト）                                 │
│  - 休み希望入力（社員）                                         │
│  File: index.html                                            │
└───────────────────┬─────────────────────────────────────────┘
                    │
                    │ HTTPS
                    ▼
┌─────────────────────────────────────────────────────────────┐
│      Backend API (Railway)                                   │
│  shift-scheduler-ai                                          │
│  - /api/liff/* - LIFF専用エンドポイント                       │
│  - /api/shifts/* - シフト管理                                 │
│  - /api/master/* - マスタデータ                               │
└───────────────────┬─────────────────────────────────────────┘
                    │
                    │ SQL
                    ▼
┌─────────────────────────────────────────────────────────────┐
│           PostgreSQL Database (Railway)                      │
│  - core.* - マスタデータ                                       │
│  - hr.* - 人事データ                                           │
│  - ops.* - 運用データ                                          │
└─────────────────────────────────────────────────────────────┘
                    ▲
                    │ SQL (Read Only)
                    │
┌─────────────────────────────────────────────────────────────┐
│      Reminder Service (Railway)                              │
│  shift-scheduler-ai-liff/backend                             │
│  - Cronジョブでシフト未提出者を検出                            │
│  - LINE Messaging APIでプッシュ通知                           │
└───────────────────┬─────────────────────────────────────────┘
                    │
                    │ LINE Messaging API
                    ▼
┌─────────────────────────────────────────────────────────────┐
│                     LINE Platform                            │
└─────────────────────────────────────────────────────────────┘
```

## 技術スタック

### フロントエンド (LIFF)

- HTML/CSS/JavaScript (Vanilla)
- LIFF SDK v2
- ホスティング: Vercel

### バックエンド API

- Node.js + Express
- PostgreSQL (pg)
- ホスティング: Railway

### リマインダーサービス

- Node.js + Express
- node-cron (スケジューラー)
- @line/bot-sdk (Messaging API)
- ホスティング: Railway

## データベーススキーマ

### core.stores

店舗マスタ

- `store_id`: 店舗ID
- `store_name`: 店舗名
- `tenant_id`: テナントID

### core.roles

役職マスタ

- `role_id`: 役職ID
- `role_name`: 役職名
- `tenant_id`: テナントID

### core.employment_types

雇用形態マスタ

- `employment_type_id`: 雇用形態ID
- `employment_code`: コード (FULL_TIME, PART_TIME, OUTSOURCE等)
- `employment_name`: 名称
- `payment_type`: 給与形態 (HOURLY, MONTHLY, CONTRACT)
- `tenant_id`: テナントID

### hr.staff

スタッフマスタ

- `staff_id`: スタッフID
- `tenant_id`: テナントID
- `store_id`: 店舗ID
- `role_id`: 役職ID
- `name`: 氏名
- `employment_type`: 雇用形態コード
- `is_active`: 有効フラグ

### hr.staff_line_accounts

LINE連携情報

- `staff_line_id`: 連携ID
- `tenant_id`: テナントID
- `staff_id`: スタッフID
- `line_user_id`: LINE User ID
- `display_name`: LINE表示名
- `linked_at`: 連携日時
- `is_active`: 有効フラグ

### ops.shift_preferences

シフト希望

- `preference_id`: 希望ID
- `tenant_id`: テナントID
- `staff_id`: スタッフID
- `year`: 年
- `month`: 月
- `preferred_days`: 出勤希望日（カンマ区切り）
- `ng_days`: 休み希望日（カンマ区切り）
- `preferred_time_slots`: 希望時間帯（カンマ区切り）
- `status`: ステータス (PENDING, APPROVED等)

### ops.shifts

確定シフト・第1案

- `shift_id`: シフトID
- `tenant_id`: テナントID
- `staff_id`: スタッフID
- `plan_id`: プランID
- `shift_date`: シフト日
- `start_time`: 開始時刻
- `end_time`: 終了時刻
- `shift_type`: シフト種別 (FIRST, SECOND等)

### ops.shift_plans

シフトプラン

- `plan_id`: プランID
- `tenant_id`: テナントID
- `store_id`: 店舗ID
- `year`: 年
- `month`: 月
- `plan_type`: プラン種別 (FIRST, SECOND)
- `status`: ステータス

## デプロイ環境

### Vercel (フロントエンド)

- リポジトリ: `The-botch/shift-scheduler-ai-liff`
- デプロイファイル: `index.html`
- 自動デプロイ: mainブランチへのpush時

### Railway (バックエンドAPI)

- リポジトリ: `The-botch/shift-scheduler-ai`
- プロジェクト: shift-scheduler-ai
- サービス: shift-scheduler-ai
- 環境変数: DATABASE_URL, LINE_CHANNEL_ID等

### Railway (リマインダーサービス)

- リポジトリ: `The-botch/shift-scheduler-ai-liff`
- Root Directory: `/backend`
- プロジェクト: shift-scheduler-ai (同じプロジェクト)
- サービス: shift-scheduler-ai-liff
- URL: https://shift-scheduler-ai-liff-production.up.railway.app
- 環境変数: DATABASE_URL, LINE_CHANNEL_ACCESS_TOKEN等

### Railway (データベース)

- PostgreSQL 16
- 共有: バックエンドAPIとリマインダーサービスで共用

## 環境変数

### LIFF (index.html)

```javascript
LIFF_ID = '2008227932-Rq9rJrJn';
API_BASE = 'https://shift-scheduler-ai-production.up.railway.app';
TENANT_ID = 3;
ENABLE_DEADLINE_CHECK = true; // 締切チェック有効化フラグ
```

### バックエンドAPI (.env)

```
DATABASE_URL=postgresql://...
LINE_CHANNEL_ID=...
LINE_CHANNEL_SECRET=...
```

### リマインダーサービス (.env)

```
DATABASE_URL=postgresql://...
LINE_CHANNEL_ACCESS_TOKEN=...
LIFF_ID=2008227932-Rq9rJrJn
TENANT_ID=3
NODE_ENV=production
PORT=3001
```

## セキュリティ

- LINE ID Token検証（jose）による認証
- PostgreSQL SSL接続
- 環境変数による機密情報管理
- .gitignoreで.envファイルを除外
