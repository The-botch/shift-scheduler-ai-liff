# LIFF機能仕様書

## 概要

LINE Front-end Framework (LIFF)を使用したシフト管理アプリケーション

## ① ユーザー登録画面

### 機能説明

新規スタッフがLINEアカウントとスタッフ情報を紐付ける画面

### UI要素

- 店舗選択（セレクトボックス）
- 役職選択（セレクトボックス）
- スタッフ名（テキスト入力）
- スタッフコード（テキスト入力）
- 雇用形態選択（セレクトボックス）
- メールアドレス（テキスト入力）
- 電話番号（テキスト入力）
- 登録ボタン

### データソース

#### 参照DB

**店舗リスト**

- テーブル: `core.stores`
- クエリ: `SELECT * FROM core.stores WHERE tenant_id = 3 AND is_active = true`
- API: `GET /api/master/stores?tenant_id=3`

**役職リスト**

- テーブル: `core.roles`
- クエリ: `SELECT * FROM core.roles WHERE tenant_id = 3 AND is_active = true`
- API: `GET /api/master/roles?tenant_id=3`

**雇用形態リスト**

- テーブル: `core.employment_types`
- クエリ: `SELECT * FROM core.employment_types WHERE tenant_id = 3 AND is_active = true`
- API: `GET /api/master/employment-types?tenant_id=3`

#### ハードコーディング

```javascript
// index.html 行162-164
const LIFF_ID = '2008227932-Rq9rJrJn';
const API_BASE = 'https://shift-scheduler-ai-production.up.railway.app';
const TENANT_ID = 3;
```

### 登録処理

**API:** `POST /api/liff/register-staff`

**リクエストボディ:**

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

**処理内容:**

1. `hr.staff` テーブルにスタッフ情報を登録
2. `hr.staff_line_accounts` テーブルにLINE連携情報を登録
3. トランザクション処理で両方が成功した場合のみコミット

**コード位置:** `index.html` 行679-763

---

## ②-1 アルバイトシフト入力

### 機能説明

アルバイトスタッフが出勤可能な日と時間帯を入力する画面

### 判定ロジック

雇用形態の `payment_type` が `HOURLY` の場合、アルバイトとして扱う

```javascript
// index.html 行268-276
function determineRoleFromEmploymentType(employmentTypeCode) {
  const empType = employmentTypesMap.get(employmentTypeCode);
  if (!empType) {
    return employmentTypeCode === 'PART_TIME' || employmentTypeCode === 'PART'
      ? 'part'
      : 'emp';
  }
  // payment_typeで判定: HOURLYならアルバイト
  return empType.payment_type === 'HOURLY' ? 'part' : 'emp';
}
```

### UI要素

- 月選択（前月/次月ボタン）
- カレンダー（日付選択）
- パターン選択 or 時刻入力
- 選択日数カウント
- 送信ボタン

### パターン定義

#### ハードコーディング

```javascript
// index.html 行170-175
const PATTERNS = [
  { key: '早番', start: '09:00', end: '18:00' },
  { key: '遅番', start: '13:00', end: '22:00' },
  { key: '通し', start: '10:00', end: '20:00' },
  { key: 'どの時間帯でも可', start: '09:00', end: '22:00' },
];
```

**コード位置:** `index.html` 行170-175

### 締切チェック

#### ハードコーディング

```javascript
// index.html 行167
const ENABLE_DEADLINE_CHECK = true; // テスト時はfalseに設定可能
```

**締切ロジック:**

- N月のシフト希望締切 = N-1月10日 23:59
- 例: 12月のシフト希望は11月10日23:59まで

**コード位置:** `index.html` 行192-220

### データ保存

#### 参照・更新DB

**既存データ取得:**

- テーブル: `ops.shift_preferences`
- API: `GET /api/shifts/preferences?tenant_id=3&staff_id=X&year=2025&month=12`

**データ保存:**

- テーブル: `ops.shift_preferences`
- API: `POST /api/shifts/preferences` (新規) または `PUT /api/shifts/preferences/:id` (更新)

**保存データ形式:**

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

**コード位置:** `index.html` 行1005-1073

---

## ②-2 社員休み入力

### 機能説明

社員スタッフが第1案の出勤日から休み希望を選択する画面

### 判定ロジック

雇用形態の `payment_type` が `HOURLY` **以外**の場合、社員として扱う

**対象雇用形態:**

- `MONTHLY` (正社員)
- `CONTRACT` (契約社員)
- `OUTSOURCE` (業務委託)
- その他 HOURLY 以外

**コード位置:** `index.html` 行268-276

### 第1案データ取得

#### 参照DB

**第1案の出勤日リスト:**

- テーブル: `ops.shifts`, `ops.shift_plans`
- API: `GET /api/shifts/?tenant_id=3&store_id=1&staff_id=392&year=2025&month=12&plan_type=FIRST`

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
    },
    ...
  ]
}
```

**コード位置:** `index.html` 行278-315

### UI動作

- 第1案が未作成の場合: 警告メッセージ表示
- 第1案の出勤日以外: グレーアウト（選択不可）
- 第1案の出勤日のみ: 赤色で選択可能

**コード位置:**

- カレンダー描画: `index.html` 行861-866
- 選択処理: `index.html` 行912-917

### データ保存

#### 更新DB

**休み希望保存:**

- テーブル: `ops.shift_preferences`
- フィールド: `ng_days` (カンマ区切りの日付リスト)
- 例: `"2025-12-05,2025-12-12,2025-12-19"`

**保存データ形式:**

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

**コード位置:** `index.html` 行1005-1073

---

## 共通機能

### LINE認証

**ライブラリ:** LIFF SDK v2

**認証フロー:**

1. `liff.init()` でLIFFアプリ初期化
2. `liff.isLoggedIn()` でログイン状態確認
3. 未ログインの場合 `liff.login()` でLINEログイン
4. `liff.getIDToken()` でID Tokenを取得
5. ID TokenをAuthorizationヘッダーに設定してAPI呼び出し

**コード位置:** `index.html` 行474-509

### スタッフ情報取得

**API:** `GET /api/liff/check-link`

**レスポンス:**

```json
{
  "success": true,
  "linked": true,
  "data": {
    "staff_id": 391,
    "name": "内山 優樹",
    "store_id": 1,
    "store_name": "COME 麻布台",
    "employment_type": "PART_TIME"
  }
}
```

**コード位置:** `index.html` 行450-519

### 雇用形態マスタキャッシュ

グローバル変数でキャッシュし、役割判定に使用

```javascript
// index.html 行181
let employmentTypesMap = new Map(); // employment_code -> {employment_name, payment_type}
```

**ロード処理:** `index.html` 行248-265

---

## エラーハンドリング

### 締切エラー

- 締切後の日付選択時: アラート表示
- 送信ボタン: 無効化

### 第1案未作成エラー

- 警告メッセージ表示
- カレンダーは表示するが選択不可

### LINE連携エラー

- 未連携の場合: ユーザー登録画面を表示
- 認証エラー: LINEログイン画面へリダイレクト

---

## 画面遷移

```
起動
  ↓
LINE認証
  ↓
  ├→ 連携済み → シフト入力画面
  │                ↓
  │              雇用形態判定
  │              ↓        ↓
  │         アルバイト    社員
  │              ↓        ↓
  │        出勤希望入力  休み希望入力
  │
  └→ 未連携 → ユーザー登録画面
                   ↓
              登録完了 → シフト入力画面へ
```

## 技術的な注意事項

### タイムゾーン

全ての日付処理はJST（日本標準時）で統一

```javascript
// index.html 行817-823
function ymd(d) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
```

**注意:** `toISOString()` は使用しない（UTCに変換されてしまうため）

### 時刻入力

時刻は「時」のみ入力可能（分は00固定）

```javascript
// index.html 行953-960
function forceHourOnly(input) {
  const value = input.value;
  if (value) {
    const [hours] = value.split(':');
    input.value = `${hours}:00`;
  }
}
```

### Map データ構造

選択された日付と時刻情報を管理

```javascript
// index.html 行178
let selected = new Map(); // key=YYYY-MM-DD, val={type:'part'|'emp', start,end,label}
```

**使用例:**

```javascript
selected.set('2025-12-01', {
  type: 'part',
  start: '09:00',
  end: '18:00',
  label: '早番',
});
```
