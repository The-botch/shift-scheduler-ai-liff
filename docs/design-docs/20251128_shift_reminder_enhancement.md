# シフト未提出リマインダーシステム強化仕様書

**文書バージョン:** v1.0.0
**作成日:** 2025-11-28
**対応Issue:** [#130 シフト未提出者に対するLINE通知リマインダー実装](https://github.com/The-botch/shift-scheduler-ai/issues/130)

---

## 目次

1. [概要](#1-概要)
2. [現状の課題](#2-現状の課題)
3. [要件定義](#3-要件定義)
4. [システム設計](#4-システム設計)
5. [データベース設計](#5-データベース設計)
6. [実装仕様](#6-実装仕様)
7. [テスト計画](#7-テスト計画)
8. [デプロイ](#8-デプロイ)

---

## 1. 概要

### 1.1 目的

アルバイトスタッフのシフト希望提出率を向上させるため、期限前後に段階的なリマインド通知をLINEで自動送信するシステムを構築する。

### 1.2 背景

現行システムでは月5日・8日に固定でリマインドを送信しているが、以下の問題がある：

- 提出期限がテナントごとに異なるのに対応できていない
- 期限が近づくにつれて強化する段階的なリマインドができていない
- グループチャットでの一斉通知ができていない
- 未提出者の名前を晒すことで提出を促す機能がない

### 1.3 スコープ

**対象:**

- `shift-scheduler-ai-liff/backend` の改修
- LINE Messaging API を使用したプッシュ通知
- PostgreSQL (`core.shift_deadline_settings`, `ops.reminder_logs`) との連携

**対象外:**

- フロントエンド（LIFF）の修正
- 新規データベーステーブルの作成（既存テーブルを使用）

---

## 2. 現状の課題

### 2.1 既存実装の問題点

| 問題                 | 現状                     | 影響                             |
| -------------------- | ------------------------ | -------------------------------- |
| 期限固定             | 10日で固定               | テナントごとの期限に対応できない |
| Cronスケジュール固定 | 月5日・8日のみ           | 動的な期限前リマインドができない |
| 個別通知のみ         | グループチャット未対応   | 全体への注意喚起ができない       |
| 提出状況不明         | X人中Y人未提出の表示なし | 緊迫感が伝わらない               |
| 名前晒しなし         | 未提出者名の表示なし     | プレッシャーが弱い               |
| 重複送信のリスク     | 送信履歴を保存していない | 同じ日に複数回送信される可能性   |

### 2.2 既存ファイル

```
shift-scheduler-ai-liff/backend/
├── src/
│   ├── index.js                      # Express サーバー + Cron設定
│   ├── services/
│   │   └── reminderService.js        # リマインド送信ロジック
│   └── jobs/
│       └── shiftReminder.js          # 手動実行スクリプト
└── .env                               # 環境変数
```

---

## 3. 要件定義

### 3.1 機能要件

#### FR-1: 動的期限取得

- `core.shift_deadline_settings` から雇用形態ごとの期限設定を取得
- テナントID、雇用形態に基づいて動的に期限を計算

#### FR-2: 段階的リマインド送信

| タイミング | 送信先           | 内容                                                                 |
| ---------- | ---------------- | -------------------------------------------------------------------- |
| 期限7日前  | グループチャット | 「X人中Y人未提出です。早めの提出をお願いします」                     |
| 期限3日前  | グループチャット | 「X人中Y人未提出です。提出期限が近づいています」                     |
| 期限1日前  | グループチャット | 「X人中Y人未提出です。未提出者: 山田、佐藤、鈴木」（バイネーム晒し） |
| 期限超過後 | 個別DM           | 「{名前}さん、提出期限を過ぎています。至急提出してください」         |

#### FR-3: 提出状況の表示

- アルバイト総数をカウント
- 提出済み人数をカウント
- 未提出人数をカウント
- メッセージに「X人中Y人未提出」を表示

#### FR-4: 重複送信防止

- `ops.reminder_logs` テーブルに送信履歴を記録
- 同じ月・同じリマインドタイプは1回のみ送信

### 3.2 非機能要件

- **信頼性**: LINE API 送信失敗時もリトライ（最大3回）
- **パフォーマンス**: 100人程度のスタッフに対して10秒以内に送信完了
- **保守性**: ログ出力を充実させ、トラブルシューティングを容易に
- **セキュリティ**: 環境変数で機密情報管理

---

## 4. システム設計

### 4.1 システム構成図

```
┌────────────────────────────────────────────────┐
│   Railway (shift-scheduler-ai-liff/backend)    │
│                                                 │
│  ┌──────────────────────────────────────┐      │
│  │   Express Server (Port 8080)          │      │
│  │                                       │      │
│  │  ┌─────────────────────────────────┐ │      │
│  │  │   Daily Cron Job                │ │      │
│  │  │   毎日 00:00 JST                │ │      │
│  │  └──────────┬──────────────────────┘ │      │
│  │             │                         │      │
│  │             ▼                         │      │
│  │  ┌─────────────────────────────────┐ │      │
│  │  │  checkAndSendReminders()        │ │      │
│  │  │  1. 期限設定取得                │ │      │
│  │  │  2. 今日送信すべきリマインド判定 │ │      │
│  │  │  3. 送信履歴チェック            │ │      │
│  │  │  4. リマインド送信              │ │      │
│  │  └──────────┬──────────────────────┘ │      │
│  │             │                         │      │
│  │             ▼                         │      │
│  │  ┌─────────────────────────────────┐ │      │
│  │  │  Enhanced reminderService.js    │ │      │
│  │  │  - send7DaysBeforeReminder()    │ │      │
│  │  │  - send3DaysBeforeReminder()    │ │      │
│  │  │  - send1DayBeforeReminder()     │ │      │
│  │  │  - sendOverdueReminder()        │ │      │
│  │  │  - getSubmissionStatus()        │ │      │
│  │  │  - sendGroupMessage()           │ │      │
│  │  │  - recordReminderLog()          │ │      │
│  │  └──────────┬──────────────────────┘ │      │
│  └─────────────┼──────────────────────┘      │
└────────────────┼──────────────────────────────┘
                 │
         ┌───────┴────────┐
         │                 │
         ▼                 ▼
   PostgreSQL        LINE Messaging API
  ┌──────────┐      ┌──────────────────┐
  │ Tables:  │      │ - Push Message   │
  │ - core.  │      │ - Group Message  │
  │   shift_ │      └──────────────────┘
  │   deadline│
  │   settings│
  │ - ops.   │
  │   reminder│
  │   _logs  │
  │ - ops.   │
  │   shift_ │
  │   preferences│
  └──────────┘
```

### 4.2 処理フロー

#### 4.2.1 メインフロー（毎日00:00実行）

```
開始
 │
 ├─ テナントID取得（環境変数）
 │
 ├─ 対象月を決定（翌月）
 │
 ├─ 期限設定取得（core.shift_deadline_settings）
 │   └─ 雇用形態ごとの期限（日、時、分）
 │
 ├─ 今日送信すべきリマインドタイプを判定
 │   ├─ 期限7日前？ → 7_DAYS_BEFORE
 │   ├─ 期限3日前？ → 3_DAYS_BEFORE
 │   ├─ 期限1日前？ → DAY_BEFORE
 │   └─ 期限超過？   → OVERDUE
 │
 ├─ 送信履歴チェック（ops.reminder_logs）
 │   └─ 既に送信済み？ → スキップ
 │
 ├─ リマインド送信処理
 │   ├─ 7日前 → グループチャットに送信
 │   ├─ 3日前 → グループチャットに送信
 │   ├─ 1日前 → グループチャットに送信（バイネーム晒し）
 │   └─ 超過後 → 個別DMに送信
 │
 ├─ 送信履歴記録（ops.reminder_logs）
 │
 └─ 終了
```

#### 4.2.2 グループチャット送信フロー（7日前、3日前、1日前）

```
開始
 │
 ├─ 提出状況取得
 │   ├─ アルバイト総数カウント
 │   ├─ 提出済み人数カウント
 │   └─ 未提出人数カウント
 │
 ├─ メッセージ作成
 │   ├─ 7日前・3日前: 「X人中Y人未提出です」
 │   └─ 1日前: 「X人中Y人未提出です。未提出者: 山田、佐藤、鈴木」
 │
 ├─ グループチャットに送信
 │   └─ LINE Messaging API (Push Message to Group)
 │
 └─ 終了
```

#### 4.2.3 個別DM送信フロー（期限超過後）

```
開始
 │
 ├─ 未提出スタッフ一覧取得
 │
 ├─ 各スタッフに対してループ
 │   ├─ メッセージ作成（個別）
 │   ├─ LINE DMに送信
 │   └─ エラーハンドリング
 │
 └─ 終了
```

### 4.3 期限計算ロジック

```javascript
/**
 * 期限計算例
 *
 * 設定:
 * - deadline_day: 10
 * - deadline_hour: 23
 * - deadline_minute: 59
 *
 * 対象月: 2025年12月
 *
 * 期限: 2025年11月10日 23:59
 *
 * リマインド日:
 * - 7日前: 2025年11月3日
 * - 3日前: 2025年11月7日
 * - 1日前: 2025年11月9日
 * - 超過後: 2025年11月11日以降
 */

function calculateDeadline(
  targetYear,
  targetMonth,
  deadlineDay,
  deadlineHour,
  deadlineMinute
) {
  // 対象月の前月に期限がある
  const deadlineMonth = targetMonth - 1;
  const deadlineYear = deadlineMonth === 0 ? targetYear - 1 : targetYear;
  const adjustedMonth = deadlineMonth === 0 ? 12 : deadlineMonth;

  return new Date(
    deadlineYear,
    adjustedMonth - 1,
    deadlineDay,
    deadlineHour,
    deadlineMinute
  );
}
```

---

## 5. データベース設計

### 5.1 使用テーブル

#### 5.1.1 core.shift_deadline_settings（既存）

期限設定マスタ

```sql
SELECT
  employment_type,
  deadline_day,
  deadline_hour,
  deadline_minute,
  is_enabled,
  description
FROM core.shift_deadline_settings
WHERE tenant_id = 3
  AND is_enabled = true
ORDER BY employment_type;
```

#### 5.1.2 ops.reminder_logs（新規作成が必要）

リマインド送信履歴

```sql
CREATE TABLE IF NOT EXISTS ops.reminder_logs (
  reminder_log_id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  target_year INTEGER NOT NULL,
  target_month INTEGER NOT NULL,
  reminder_type VARCHAR(50) NOT NULL, -- '7_DAYS_BEFORE', '3_DAYS_BEFORE', 'DAY_BEFORE', 'OVERDUE'
  sent_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  recipient_count INTEGER,
  success BOOLEAN NOT NULL DEFAULT true,
  error_message TEXT,
  CONSTRAINT uq_reminder_logs_tenant_month_type
    UNIQUE(tenant_id, target_year, target_month, reminder_type)
);

CREATE INDEX idx_reminder_logs_tenant_month
  ON ops.reminder_logs(tenant_id, target_year, target_month);
```

**カラム説明:**

| カラム          | 型          | 説明                       |
| --------------- | ----------- | -------------------------- |
| reminder_log_id | SERIAL      | 主キー                     |
| tenant_id       | INTEGER     | テナントID                 |
| target_year     | INTEGER     | 対象年（例: 2025）         |
| target_month    | INTEGER     | 対象月（例: 12）           |
| reminder_type   | VARCHAR(50) | リマインド種別             |
| sent_at         | TIMESTAMP   | 送信日時                   |
| recipient_count | INTEGER     | 送信対象人数               |
| success         | BOOLEAN     | 送信成功フラグ             |
| error_message   | TEXT        | エラーメッセージ（失敗時） |

**reminder_type 種別:**

- `7_DAYS_BEFORE`: 期限7日前
- `3_DAYS_BEFORE`: 期限3日前
- `DAY_BEFORE`: 期限1日前
- `OVERDUE`: 期限超過後

#### 5.1.3 ops.shift_preferences（既存）

シフト希望提出データ

```sql
-- 提出済みスタッフのカウント
SELECT COUNT(DISTINCT staff_id) as submitted_count
FROM ops.shift_preferences
WHERE year = 2025 AND month = 12;
```

#### 5.1.4 hr.staff_line_accounts（既存）

LINE連携情報

```sql
-- 未提出スタッフの取得
SELECT
  sla.line_user_id,
  s.staff_id,
  s.name,
  s.employment_type
FROM hr.staff_line_accounts sla
JOIN hr.staff s ON sla.staff_id = s.staff_id
WHERE sla.tenant_id = 3
  AND sla.is_active = true
  AND s.is_active = true
  AND NOT EXISTS (
    SELECT 1 FROM ops.shift_preferences sp
    WHERE sp.staff_id = s.staff_id
      AND sp.year = 2025
      AND sp.month = 12
  );
```

---

## 6. 実装仕様

### 6.1 修正ファイル一覧

| ファイル                                  | 修正内容                                |
| ----------------------------------------- | --------------------------------------- |
| `backend/src/index.js`                    | Cronスケジュール変更（毎日00:00に変更） |
| `backend/src/services/reminderService.js` | 全面的な書き換え（新機能追加）          |
| `backend/.env`                            | グループチャットID追加                  |

### 6.2 backend/src/index.js 修正

#### 修正前（現行）

```javascript
cron.schedule('0 10 5,8 * *', () => {
  console.log('⏰ Cron job triggered');
  const now = new Date();
  const targetYear = now.getFullYear();
  const targetMonth = now.getMonth() + 2; // 翌月

  sendShiftReminders(targetYear, targetMonth);
});
```

#### 修正後

```javascript
// 毎日00:00に実行
cron.schedule('0 0 * * *', async () => {
  console.log('⏰ Daily reminder check triggered at', new Date().toISOString());

  try {
    await checkAndSendReminders();
  } catch (error) {
    console.error('❌ Daily reminder check failed:', error);
  }
});
```

### 6.3 backend/src/services/reminderService.js 新機能

#### 6.3.1 主要関数一覧

| 関数名                                            | 説明                                         |
| ------------------------------------------------- | -------------------------------------------- |
| `checkAndSendReminders()`                         | メイン処理（期限計算、リマインド判定、送信） |
| `getDeadlineSettings(tenantId)`                   | 期限設定取得                                 |
| `calculateDeadline(year, month, settings)`        | 期限計算                                     |
| `determineReminderType(today, deadline)`          | リマインド種別判定                           |
| `hasBeenSent(tenantId, year, month, type)`        | 送信履歴チェック                             |
| `getSubmissionStatus(tenantId, year, month)`      | 提出状況取得                                 |
| `getUnsubmittedStaffNames(tenantId, year, month)` | 未提出者名一覧取得                           |
| `send7DaysBeforeReminder(...)`                    | 7日前リマインド送信                          |
| `send3DaysBeforeReminder(...)`                    | 3日前リマインド送信                          |
| `send1DayBeforeReminder(...)`                     | 1日前リマインド送信                          |
| `sendOverdueReminder(...)`                        | 期限超過リマインド送信                       |
| `sendGroupMessage(groupId, message)`              | グループチャット送信                         |
| `sendIndividualMessage(userId, message)`          | 個別DM送信                                   |
| `recordReminderLog(...)`                          | 送信履歴記録                                 |

#### 6.3.2 実装例: getSubmissionStatus()

```javascript
/**
 * 提出状況を取得
 */
async function getSubmissionStatus(tenantId, year, month) {
  const client = await pool.connect();

  try {
    // アルバイト総数（LINE連携済み、アクティブ）
    const totalResult = await client.query(
      `
      SELECT COUNT(DISTINCT s.staff_id) as total
      FROM hr.staff s
      JOIN hr.staff_line_accounts sla ON s.staff_id = sla.staff_id
      JOIN core.employment_types et
        ON s.employment_type = et.employment_code
        AND et.tenant_id = s.tenant_id
      WHERE s.tenant_id = $1
        AND s.is_active = true
        AND sla.is_active = true
        AND et.payment_type = 'HOURLY'
    `,
      [tenantId]
    );

    const total = parseInt(totalResult.rows[0].total);

    // 提出済み人数
    const submittedResult = await client.query(
      `
      SELECT COUNT(DISTINCT sp.staff_id) as submitted
      FROM ops.shift_preferences sp
      JOIN hr.staff s ON sp.staff_id = s.staff_id
      JOIN core.employment_types et
        ON s.employment_type = et.employment_code
        AND et.tenant_id = s.tenant_id
      WHERE s.tenant_id = $1
        AND sp.year = $2
        AND sp.month = $3
        AND et.payment_type = 'HOURLY'
    `,
      [tenantId, year, month]
    );

    const submitted = parseInt(submittedResult.rows[0].submitted);
    const unsubmitted = total - submitted;

    return {
      total,
      submitted,
      unsubmitted,
    };
  } finally {
    client.release();
  }
}
```

#### 6.3.3 実装例: send1DayBeforeReminder()

```javascript
/**
 * 期限1日前リマインド（バイネーム晒し）
 */
async function send1DayBeforeReminder(tenantId, year, month, deadline) {
  const status = await getSubmissionStatus(tenantId, year, month);
  const unsubmittedNames = await getUnsubmittedStaffNames(
    tenantId,
    year,
    month
  );

  const message = `【シフト提出リマインド - 期限1日前】

⚠️ ${year}年${month}月のシフト希望提出期限は明日です！

📊 提出状況: ${status.total}人中${status.unsubmitted}人未提出

📅 提出期限: ${deadline.getFullYear()}年${deadline.getMonth() + 1}月${deadline.getDate()}日 ${deadline.getHours()}:${String(deadline.getMinutes()).padStart(2, '0')}

❌ 未提出者: ${unsubmittedNames.join('、')}

至急提出をお願いします！
https://liff.line.me/${process.env.LIFF_ID}`;

  const groupId = process.env.LINE_GROUP_CHAT_ID;
  await sendGroupMessage(groupId, message);

  await recordReminderLog(
    tenantId,
    year,
    month,
    'DAY_BEFORE',
    status.unsubmitted,
    true
  );

  console.log(`✅ 1日前リマインド送信完了: ${status.unsubmitted}人未提出`);
}
```

#### 6.3.4 実装例: sendGroupMessage()

```javascript
/**
 * グループチャットにメッセージ送信
 */
async function sendGroupMessage(groupId, message) {
  const response = await axios.post(
    'https://api.line.me/v2/bot/message/push',
    {
      to: groupId,
      messages: [
        {
          type: 'text',
          text: message,
        },
      ],
    },
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`,
      },
    }
  );

  console.log(`✅ グループメッセージ送信成功: ${groupId}`);
  return response.data;
}
```

### 6.4 環境変数追加

#### backend/.env

```bash
# 既存
LINE_CHANNEL_ACCESS_TOKEN=your_channel_access_token
LIFF_ID=2008227932-Rq9rJrJn
TENANT_ID=3

# 新規追加
LINE_GROUP_CHAT_ID=C1234567890abcdef1234567890abcdef  # グループチャットID
TZ=Asia/Tokyo  # タイムゾーン
```

**グループチャットIDの取得方法:**

1. LINE Developersコンソールでボットをグループに追加
2. Webhook URLでグループメッセージを受信
3. `event.source.groupId` を取得

---

## 7. テスト計画

### 7.1 単体テスト

| テスト項目                   | 入力                        | 期待結果                               |
| ---------------------------- | --------------------------- | -------------------------------------- |
| 期限計算                     | 2025/12, deadline_day=10    | 2025/11/10 23:59                       |
| リマインド種別判定（7日前）  | today=11/3, deadline=11/10  | 7_DAYS_BEFORE                          |
| リマインド種別判定（3日前）  | today=11/7, deadline=11/10  | 3_DAYS_BEFORE                          |
| リマインド種別判定（1日前）  | today=11/9, deadline=11/10  | DAY_BEFORE                             |
| リマインド種別判定（超過後） | today=11/11, deadline=11/10 | OVERDUE                                |
| 提出状況取得                 | total=10, submitted=7       | {total:10, submitted:7, unsubmitted:3} |
| 未提出者名取得               | 3人未提出                   | ['山田太郎', '佐藤花子', '鈴木一郎']   |

### 7.2 統合テスト

#### テストケース1: 7日前リマインド送信

**前提条件:**

- 今日: 2025年11月3日
- 期限: 2025年11月10日 23:59
- 未提出: 3人

**手順:**

1. `checkAndSendReminders()` 実行
2. ログ確認
3. LINE グループチャット確認

**期待結果:**

- グループチャットに「10人中3人未提出」のメッセージが送信される
- `ops.reminder_logs` に記録される

#### テストケース2: 1日前リマインド送信（バイネーム晒し）

**前提条件:**

- 今日: 2025年11月9日
- 期限: 2025年11月10日 23:59
- 未提出: 山田太郎、佐藤花子

**手順:**

1. `checkAndSendReminders()` 実行
2. ログ確認
3. LINE グループチャット確認

**期待結果:**

- グループチャットに「未提出者: 山田太郎、佐藤花子」が表示される

#### テストケース3: 重複送信防止

**前提条件:**

- 今日: 2025年11月3日
- `ops.reminder_logs` に既に7_DAYS_BEFOREの記録あり

**手順:**

1. `checkAndSendReminders()` を2回実行
2. ログ確認

**期待結果:**

- 2回目の実行では送信されない
- ログに「既に送信済み」と出力される

### 7.3 手動テスト手順

#### ローカル環境

```bash
cd shift-scheduler-ai-liff/backend

# 環境変数設定
cp .env.example .env
# .env を編集

# 依存パッケージインストール
npm install

# サーバー起動
npm run dev

# 別ターミナルで手動実行
node src/jobs/testReminder.js 2025 12
```

#### 本番環境（Railway）

```bash
# 環境変数確認
railway variables

# ログ確認
railway logs --tail

# 手動リマインド送信
curl -X POST https://shift-scheduler-ai-liff-production.up.railway.app/api/send-reminder \
  -H "Content-Type: application/json" \
  -d '{"year": 2025, "month": 12}'
```

---

## 8. デプロイ

### 8.1 デプロイ手順

#### ステップ1: データベース準備

```sql
-- ops.reminder_logs テーブル作成
-- （SQL は「5.1.2」を参照）
```

#### ステップ2: コード修正

```bash
git checkout -b feature/reminder-enhancement
# ファイル修正
git add .
git commit -m "feat: シフト未提出リマインダー強化 (#130)"
git push origin feature/reminder-enhancement
```

#### ステップ3: プルリクエスト作成

- タイトル: `feat: シフト未提出リマインダー強化 (#130)`
- 説明: 本設計書のリンクを貼る

#### ステップ4: Railway環境変数設定

```
LINE_GROUP_CHAT_ID=C1234567890abcdef1234567890abcdef
TZ=Asia/Tokyo
```

#### ステップ5: デプロイ

```bash
git checkout main
git merge feature/reminder-enhancement
git push origin main
```

Railway が自動デプロイ

#### ステップ6: 動作確認

```bash
# ログ確認
railway logs --tail

# ヘルスチェック
curl https://shift-scheduler-ai-liff-production.up.railway.app/

# 手動リマインド送信テスト
curl -X POST https://shift-scheduler-ai-liff-production.up.railway.app/api/send-reminder \
  -H "Content-Type: application/json" \
  -d '{"year": 2025, "month": 12}'
```

### 8.2 ロールバック手順

```bash
# 問題発生時
git revert <commit-hash>
git push origin main
```

### 8.3 監視

#### ログ監視

```bash
railway logs --tail | grep "reminder"
```

#### エラー通知

Railway の Notifications 設定でデプロイ失敗時に通知

---

## 9. 今後の拡張案

1. **Slack通知連携**: 管理者にSlackで提出状況を日次報告
2. **多言語対応**: スタッフの言語設定に応じてメッセージ切り替え
3. **リマインド設定のカスタマイズ**: テナントごとにリマインドタイミングを変更可能に
4. **リッチメッセージ**: LINE Flex Messageで視覚的に魅力的な通知
5. **既読確認**: Webhookで既読率を追跡

---

## 10. 参考資料

- [Issue #130](https://github.com/The-botch/shift-scheduler-ai/issues/130)
- [LINE Messaging API ドキュメント](https://developers.line.biz/ja/docs/messaging-api/)
- [node-cron ドキュメント](https://github.com/node-cron/node-cron)
- [既存 REMINDER_SYSTEM.md](../REMINDER_SYSTEM.md)
