# LIFFデータベース連携仕様書

LIFFアプリケーションからデータベースへのデータ書き込み仕様

---

## 目次

1. [概要](#概要)
2. [データフロー全体像](#データフロー全体像)
3. [ユーザー登録](#ユーザー登録)
4. [シフト希望入力](#シフト希望入力)
5. [データ責任分担](#データ責任分担)

---

## 概要

LIFFアプリケーションは以下の2つの主要な機能でデータベースにデータを書き込みます：

1. **ユーザー登録**: 新規スタッフのLINE連携
2. **シフト希望入力**: 月次のシフト希望提出（アルバイト/社員で異なる）

---

## データフロー全体像

```
LIFF (フロントエンド)
│
├─ ① ユーザー登録
│  └─ POST /api/liff/register-staff
│     ├─ hr.staff (スタッフ基本情報)
│     └─ hr.staff_line_accounts (LINE連携情報)
│
└─ ② シフト希望入力
   └─ POST /api/shifts/preferences (新規)
   └─ PUT /api/shifts/preferences/:id (更新)
      └─ ops.shift_preferences (シフト希望データ)
```

---

## ユーザー登録

### 使用テーブル

| テーブル | 用途 |
|---------|------|
| `hr.staff` | スタッフ基本情報 |
| `hr.staff_line_accounts` | LINE連携情報 |

### API

**エンドポイント:** `POST /api/liff/register-staff`

**トランザクション:** 両テーブルへの挿入が成功した場合のみコミット

---

### データ分担

#### 🎨 LIFF内で作成（ユーザー入力 or フロントエンド設定）

| フィールド | 作成方法 | 値の例 |
|-----------|---------|--------|
| `tenant_id` | フロントエンドで固定値設定 | `3` |
| `store_id` | ユーザーがセレクトボックスで選択 | `1` (COME 麻布台) |
| `role_id` | ユーザーがセレクトボックスで選択 | `183` (スタッフ) |
| `name` | ユーザーがテキスト入力 | `"山田太郎"` |
| `staff_code` | ユーザーがテキスト入力 | `"STAFF001"` |
| `employment_type` | ユーザーがセレクトボックスで選択 | `"PART_TIME"` |
| `email` | ユーザーがテキスト入力 | `"yamada@example.com"` |
| `phone_number` | ユーザーがテキスト入力 | `"090-1234-5678"` |
| `line_user_id` | LIFF SDK から取得 | `"Ue206d8fbbf68d60c..."` |

#### 🗄️ DB/API側で自動生成

| フィールド | 生成方法 | 説明 |
|-----------|---------|------|
| `staff_id` | SERIAL (自動採番) | スタッフの一意ID |
| `is_active` | DEFAULT true | アクティブフラグ |
| `created_at` | DEFAULT CURRENT_TIMESTAMP | 作成日時 |
| `updated_at` | DEFAULT CURRENT_TIMESTAMP | 更新日時 |

---

### リクエストボディ例

```json
{
  "tenant_id": 3,
  "store_id": 1,
  "role_id": 183,
  "name": "山田太郎",
  "staff_code": "STAFF001",
  "employment_type": "PART_TIME",
  "email": "yamada@example.com",
  "phone_number": "090-1234-5678"
}
```

**コード位置:** `index.html` 行679-763

---

## シフト希望入力

### 使用テーブル

| テーブル | 用途 |
|---------|------|
| `ops.shift_preferences` | シフト希望データ |

### API

- **新規登録:** `POST /api/shifts/preferences`
- **更新:** `PUT /api/shifts/preferences/:id`

---

### テーブル定義（ops.shift_preferences）

| カラム名 | 型 | 説明 | NULL許可 | デフォルト値 |
|---------|-----|------|----------|------------|
| `preference_id` | SERIAL | 主キー（自動採番） | NO | - |
| `tenant_id` | INT | テナントID | NO | - |
| `store_id` | INT | 店舗ID | NO | - |
| `staff_id` | INT | スタッフID | NO | - |
| `staff_name` | VARCHAR(100) | スタッフ名 | YES | - |
| `year` | INT | 対象年 | NO | - |
| `month` | INT | 対象月 | NO | - |
| `preferred_days` | TEXT | 出勤希望日（カンマ区切り） | YES | - |
| `ng_days` | TEXT | 休み希望日（カンマ区切り） | YES | - |
| `preferred_time_slots` | TEXT | 希望時間帯（カンマ区切り） | YES | - |
| `max_hours_per_week` | DECIMAL(5,2) | 週最大労働時間 | YES | - |
| `notes` | TEXT | 備考 | YES | - |
| `submitted_at` | TIMESTAMP | 提出日時 | YES | - |
| `status` | VARCHAR(20) | ステータス | NO | 'PENDING' |
| `created_at` | TIMESTAMP | 作成日時 | NO | CURRENT_TIMESTAMP |
| `updated_at` | TIMESTAMP | 更新日時 | NO | CURRENT_TIMESTAMP |

**制約:**
- `status` は 'PENDING', 'APPROVED', 'REJECTED' のいずれか
- 外部キー: `tenant_id`, `store_id`, `staff_id`（CASCADE DELETE）

---

## パターン別データ形式

### パターンA: アルバイト（出勤希望入力）

#### 判定条件

雇用形態の `payment_type = 'HOURLY'`

#### 🎨 LIFF内で作成

| フィールド | 作成方法 | 値の例 |
|-----------|---------|--------|
| `tenant_id` | フロントエンドで固定値 | `3` |
| `store_id` | ログイン中スタッフの店舗ID | `1` |
| `staff_id` | ログイン中スタッフID | `391` |
| `year` | フロントエンドで月選択時に設定 | `2025` |
| `month` | フロントエンドで月選択時に設定 | `12` |
| **`preferred_days`** | カレンダーで日付選択 | `"2025-12-01,2025-12-03,2025-12-05"` |
| **`ng_days`** | 空文字 | `""` |
| **`preferred_time_slots`** | パターン選択 or 時刻入力 | `"09:00-18:00,13:00-22:00,10:00-20:00"` |
| `notes` | テキスト入力（現状未使用） | `""` |
| `status` | フロントエンドで固定値 | `"PENDING"` |

#### 🗄️ DB/API側で自動生成

| フィールド | 生成方法 |
|-----------|---------|
| `preference_id` | SERIAL (自動採番) |
| `staff_name` | hr.staffテーブルから取得 |
| `submitted_at` | CURRENT_TIMESTAMP |
| `created_at` | CURRENT_TIMESTAMP |
| `updated_at` | CURRENT_TIMESTAMP |

#### リクエストボディ例

```json
{
  "tenant_id": 3,
  "store_id": 1,
  "staff_id": 391,
  "year": 2025,
  "month": 12,
  "preferred_days": "2025-12-01,2025-12-03,2025-12-05",
  "ng_days": "",
  "preferred_time_slots": "09:00-18:00,13:00-22:00,10:00-20:00",
  "notes": "",
  "status": "PENDING"
}
```

#### 時間帯パターン（ハードコーディング）

```javascript
const PATTERNS = [
  {key:"早番", start:"09:00", end:"18:00"},
  {key:"遅番", start:"13:00", end:"22:00"},
  {key:"通し", start:"10:00", end:"20:00"},
  {key:"どの時間帯でも可", start:"09:00", end:"22:00"},
];
```

**コード位置:** `index.html` 行170-175

#### 締切チェック

- **締切ロジック:** N月のシフト希望締切 = N-1月10日 23:59
- **例:** 12月のシフト希望は11月10日23:59まで
- **設定:** `ENABLE_DEADLINE_CHECK = true` (index.html 行167)

**コード位置:** `index.html` 行192-220

---

### パターンB: 社員（休み希望入力）

#### 判定条件

雇用形態の `payment_type != 'HOURLY'` (MONTHLY, CONTRACT, OUTSOURCEなど)

#### 🎨 LIFF内で作成

| フィールド | 作成方法 | 値の例 |
|-----------|---------|--------|
| `tenant_id` | フロントエンドで固定値 | `3` |
| `store_id` | ログイン中スタッフの店舗ID | `1` |
| `staff_id` | ログイン中スタッフID | `392` |
| `year` | フロントエンドで月選択時に設定 | `2025` |
| `month` | フロントエンドで月選択時に設定 | `12` |
| **`preferred_days`** | 空文字 | `""` |
| **`ng_days`** | カレンダーで日付選択（第1案の出勤日から） | `"2025-12-05,2025-12-12,2025-12-19"` |
| **`preferred_time_slots`** | 空文字 | `""` |
| `notes` | テキスト入力（現状未使用） | `""` |
| `status` | フロントエンドで固定値 | `"PENDING"` |

#### 🗄️ DB/API側で自動生成

アルバイトと同じ

#### リクエストボディ例

```json
{
  "tenant_id": 3,
  "store_id": 1,
  "staff_id": 392,
  "year": 2025,
  "month": 12,
  "preferred_days": "",
  "ng_days": "2025-12-05,2025-12-12,2025-12-19",
  "preferred_time_slots": "",
  "notes": "",
  "status": "PENDING"
}
```

#### 第1案データ取得

社員は第1案の出勤日からのみ休み希望を選択可能

**API:** `GET /api/shifts/?tenant_id=3&store_id=1&staff_id=392&year=2025&month=12&plan_type=FIRST`

**レスポンス例:**
```json
{
  "success": true,
  "count": 20,
  "data": [
    {
      "shift_id": 1001,
      "shift_date": "2025-12-01",
      "start_time": "09:00:00",
      "end_time": "18:00:00"
    }
  ]
}
```

**コード位置:** `index.html` 行278-315

---

## データ責任分担

### LIFF側の責任

✅ **ユーザー入力の収集**
- フォーム入力値の取得
- セレクトボックスの選択値
- カレンダーでの日付選択
- 時刻入力

✅ **入力値のバリデーション**
- 締切チェック（N-1月10日23:59）
- 必須項目チェック
- 日付範囲チェック

✅ **データ形式の整形**
- 日付のカンマ区切り化（`"2025-12-01,2025-12-03"`）
- 時刻範囲の整形（`"09:00-18:00"`）
- 配列から文字列への変換

✅ **固定値の設定**
- `tenant_id`: 3（ハードコーディング）
- `status`: "PENDING"

✅ **LINE認証情報の取得**
- LIFF SDK経由で `line_user_id` を取得
- ID Tokenの取得と送信

---

### API/DB側の責任

✅ **一意IDの採番**
- `staff_id`: SERIAL (自動採番)
- `preference_id`: SERIAL (自動採番)

✅ **タイムスタンプの自動設定**
- `created_at`: CURRENT_TIMESTAMP
- `updated_at`: CURRENT_TIMESTAMP
- `submitted_at`: API側で設定

✅ **関連データの取得**
- `staff_name`: hr.staffテーブルから取得してops.shift_preferencesに設定

✅ **データ整合性の保証**
- 外部キー制約のチェック
- CHECK制約のチェック（status値）
- トランザクション管理

✅ **ビジネスロジック**
- 重複チェック（同一スタッフ・年月の既存データ）
- 更新時の既存データ取得
- 認証・認可チェック

---

## データフロー図

### ユーザー登録フロー

```
LIFF (フロントエンド)
├─ ユーザー入力
│  ├─ 店舗選択 → store_id
│  ├─ 役職選択 → role_id
│  ├─ 名前入力 → name
│  ├─ スタッフコード → staff_code
│  ├─ 雇用形態選択 → employment_type
│  ├─ メール入力 → email
│  └─ 電話番号入力 → phone_number
├─ LIFF SDK
│  └─ LINE認証 → line_user_id
└─ フロントエンド設定
   └─ 固定値 → tenant_id: 3

    ↓ POST /api/liff/register-staff

API (バックエンド)
├─ hr.staff テーブルに挿入
│  ├─ staff_id ← SERIAL (自動採番)
│  ├─ created_at ← CURRENT_TIMESTAMP
│  └─ updated_at ← CURRENT_TIMESTAMP
└─ hr.staff_line_accounts テーブルに挿入
   ├─ line_user_id (LIFFから受信)
   ├─ staff_id (上で生成されたID)
   └─ is_active ← true
```

### シフト希望入力フロー - アルバイト

```
LIFF (フロントエンド)
├─ カレンダーで日付選択
│  └─ selected dates → preferred_days
├─ パターン選択 or 時刻入力
│  └─ time ranges → preferred_time_slots
├─ 自動設定
│  ├─ 年月 → year, month
│  ├─ ログイン中スタッフ → staff_id, store_id
│  ├─ 固定値 → tenant_id: 3
│  ├─ 空文字 → ng_days: ""
│  └─ 固定値 → status: "PENDING"

    ↓ POST /api/shifts/preferences

API (バックエンド)
├─ ops.shift_preferences テーブルに挿入
│  ├─ preference_id ← SERIAL (自動採番)
│  ├─ staff_name ← hr.staff から取得
│  ├─ submitted_at ← CURRENT_TIMESTAMP
│  ├─ created_at ← CURRENT_TIMESTAMP
│  └─ updated_at ← CURRENT_TIMESTAMP
```

### シフト希望入力フロー - 社員

```
LIFF (フロントエンド)
├─ 第1案APIから出勤日を取得
│  └─ GET /api/shifts/?plan_type=FIRST
├─ 第1案の出勤日から休み希望選択
│  └─ selected dates → ng_days
├─ 自動設定
│  ├─ 年月 → year, month
│  ├─ ログイン中スタッフ → staff_id, store_id
│  ├─ 固定値 → tenant_id: 3
│  ├─ 空文字 → preferred_days: ""
│  ├─ 空文字 → preferred_time_slots: ""
│  └─ 固定値 → status: "PENDING"

    ↓ POST /api/shifts/preferences

API (バックエンド)
├─ ops.shift_preferences テーブルに挿入
   （アルバイトと同じ）
```

---

## 参考情報

### 関連ドキュメント

- [LIFF機能仕様](./LIFF_FEATURES.md)
- [リマインダーシステム仕様](./REMINDER_SYSTEM.md)
- [システムアーキテクチャ](./ARCHITECTURE.md)

### コード位置

| 機能 | ファイル | 行番号 |
|------|---------|--------|
| LIFF ID / API Base URL | index.html | 162-187 |
| 時間帯パターン | index.html | 170-175 |
| 締切チェック | index.html | 192-220 |
| 雇用形態判定 | index.html | 268-276 |
| 第1案データ取得 | index.html | 278-315 |
| ユーザー登録処理 | index.html | 679-763 |
| シフト希望送信処理 | index.html | 1005-1073 |

### テナント情報

| 項目 | 値 |
|------|-----|
| tenant_id | 3 |
| tenant_code | STAND_BANH_MI |
| tenant_name | Stand Banh Mi |
| contract_plan | STANDARD |
| max_stores | 10 |
| max_staff | 100 |

**⚠️ 重要:** `tenant_id = 3` のデータは**絶対に削除してはいけません**。削除すると、全ての関連データ（スタッフ、店舗、シフトなど）が連鎖削除（CASCADE DELETE）されます。

---

## 変更履歴

| 日付 | 変更内容 | 担当者 |
|------|---------|--------|
| 2025-11-26 | 初版作成 | Claude Code |

