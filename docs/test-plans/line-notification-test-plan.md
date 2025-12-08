# LINE通知機能 テスト計画

作成日: 2025-12-08
関連PR: shift-scheduler-ai-liff #26, shift-scheduler-ai #186

---

## フェーズ0: 事前準備

| #   | 項目                                                            | 担当       | 状態 |
| --- | --------------------------------------------------------------- | ---------- | ---- |
| 0-1 | shift-scheduler-ai-liff PR #26 をマージ                         | レビュアー | ⬜   |
| 0-2 | shift-scheduler-ai PR #186 をマージ                             | レビュアー | ⬜   |
| 0-3 | Railway環境変数設定（ai-liff STG）: `NOTIFICATION_ENABLED=true` | 管理者     | ⬜   |
| 0-4 | Railway環境変数設定（ai STG）: `LIFF_BACKEND_URL`               | 管理者     | ⬜   |
| 0-5 | デプロイ完了確認（両サービス）                                  | 管理者     | ⬜   |

### 環境変数設定値

**shift-scheduler-ai-liff（STG）**

```
NOTIFICATION_ENABLED=true
```

**shift-scheduler-ai（STG）**

```
LIFF_BACKEND_URL=https://shift-scheduler-ai-liff-backend-staging-staging.up.railway.app
```

---

## フェーズ1: 基本動作確認（STG）

| #   | テスト項目     | 手順                      | 期待結果                           | 状態 |
| --- | -------------- | ------------------------- | ---------------------------------- | ---- |
| 1-1 | テスト通知送信 | curlでテストAPI実行       | LINEグループに「STGテスト」が届く  | ⬜   |
| 1-2 | 第1案承認通知  | 管理画面で第1案を承認     | 「シフト希望入力開始」通知が届く   | ⬜   |
| 1-3 | 第2案承認通知  | 管理画面で第2案をAPPROVED | 「シフト確定のお知らせ」通知が届く | ⬜   |

### 1-1 テスト通知コマンド

```bash
curl -X POST https://shift-scheduler-ai-liff-backend-staging-staging.up.railway.app/api/notification/test \
  -H "Content-Type: application/json" \
  -d '{"tenant_id":3,"message":"STGテスト通知"}'
```

---

## フェーズ2: リマインド通知テスト（STG）

| #   | テスト項目          | 手順                                 | 期待結果                     | 状態 |
| --- | ------------------- | ------------------------------------ | ---------------------------- | ---- |
| 2-1 | フェーズ1（7日前）  | DBで締切日を今日+7日に設定 → API実行 | 匿名リマインド通知が届く     | ⬜   |
| 2-2 | フェーズ2（3日前）  | DBで締切日を今日+3日に設定 → API実行 | 統計付きリマインド通知が届く | ⬜   |
| 2-3 | フェーズ3（前日）   | DBで締切日を今日+1日に設定 → API実行 | 名前入りリマインド通知が届く | ⬜   |
| 2-4 | フェーズ4（締切後） | DBで締切日を過去に設定 → API実行     | 締切後通知が届く             | ⬜   |

### テスト用DB更新SQL

```sql
-- 締切日を変更（例: 今日から7日後 = 15日に設定）
UPDATE core.shift_deadline_settings
SET deadline_day = 15
WHERE tenant_id = 3 AND employment_type = 'PART_TIME';
```

### リマインド実行コマンド

```bash
# 自動計算（来月分）
curl -X POST https://shift-scheduler-ai-liff-backend-staging-staging.up.railway.app/api/send-auto-reminder

# 指定月
curl -X POST https://shift-scheduler-ai-liff-backend-staging-staging.up.railway.app/api/send-reminder \
  -H "Content-Type: application/json" \
  -d '{"year":2026,"month":1}'
```

---

## フェーズ3: 異常系テスト（STG）

| #   | テスト項目             | 手順                                                 | 期待結果                       | 状態 |
| --- | ---------------------- | ---------------------------------------------------- | ------------------------------ | ---- |
| 3-1 | 通知OFF                | `NOTIFICATION_ENABLED=false` に変更 → テスト通知送信 | 通知は送信されない（ログのみ） | ⬜   |
| 3-2 | LIFF_BACKEND_URL未設定 | 環境変数を削除 → 第1案承認                           | 承認は成功、通知はスキップ     | ⬜   |
| 3-3 | グループID未設定       | tenant_id=999 で通知送信                             | エラーなし、通知スキップ       | ⬜   |
| 3-4 | DB接続エラー           | DB停止状態でリマインド送信                           | デフォルト値でフォールバック   | ⬜   |

---

## フェーズ4: 本番デプロイ前確認

| #   | 項目             | 確認内容                                                    | 状態 |
| --- | ---------------- | ----------------------------------------------------------- | ---- |
| 4-1 | 本番グループID   | `line-notification.json` に本番グループIDが設定されているか | ⬜   |
| 4-2 | 環境変数         | PRD環境のLIFF_BACKEND_URL, NOTIFICATION_ENABLED             | ⬜   |
| 4-3 | cronスケジュール | 毎日9:00実行の設定確認                                      | ⬜   |
| 4-4 | LINE Channel     | 本番用アクセストークンが設定されているか                    | ⬜   |

### 本番環境変数

**shift-scheduler-ai-liff（PRD）**

```
NOTIFICATION_ENABLED=true
```

**shift-scheduler-ai（PRD）**

```
LIFF_BACKEND_URL=https://shift-scheduler-ai-liff-production.up.railway.app
```

---

## フェーズ5: 本番テスト（PRD）

| #   | テスト項目 | 手順                                            | 期待結果                   | 状態 |
| --- | ---------- | ----------------------------------------------- | -------------------------- | ---- |
| 5-1 | テスト通知 | `/api/notification/test` でテストメッセージ送信 | 本番グループに届く         | ⬜   |
| 5-2 | 第1案承認  | 実際の月次運用で第1案承認                       | 通知が届く                 | ⬜   |
| 5-3 | cronジョブ | 翌日9:00に自動実行を確認（ログ確認）            | リマインド判定が実行される | ⬜   |

### 本番テストコマンド

```bash
curl -X POST https://shift-scheduler-ai-liff-production.up.railway.app/api/notification/test \
  -H "Content-Type: application/json" \
  -d '{"tenant_id":3,"message":"本番テスト通知"}'
```

---

## 通知メッセージ確認

### 第1案承認通知

```
【{月}月シフト希望入力開始】

第1案が承認されました。
シフト希望の入力が可能になりました。

締切: {前月}月{日}日
入力はこちら: https://liff.line.me/xxxxx
```

### 第2案承認通知（フェーズ5）

```
【シフト確定のお知らせ】

{月}月のシフトが確定しました。
```

### リマインド（フェーズ1〜4）

設計書 `docs/design-docs/line-notification-design-v2.html` のセクション12参照

---

## トラブルシューティング

### 通知が届かない場合

1. `NOTIFICATION_ENABLED` が `true` か確認
2. グループIDが正しく設定されているか確認
3. LINE_CHANNEL_ACCESS_TOKEN が有効か確認
4. Railwayログでエラーを確認

### 承認は成功するが通知が届かない場合

1. `LIFF_BACKEND_URL` が設定されているか確認
2. LIFF Backendが起動しているか確認
3. ネットワーク接続を確認
