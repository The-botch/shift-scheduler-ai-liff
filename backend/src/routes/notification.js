import express from 'express';
import {
  getGroupIdByTenant,
  sendGroupMessage,
  formatMessage,
  getLiffUrl,
  getNotificationConfig,
} from '../services/lineService.js';
import { getDeadlineString } from '../services/reminderService.js';
import { getPartTimeDeadlineSettings } from '../services/submissionService.js';

const router = express.Router();

/**
 * 重複通知排除用キャッシュ
 * 同一 tenant_id + year + month + type の通知を一定時間内は1回のみ送信
 */
const recentNotifications = new Map();
const DUPLICATE_WINDOW_MS = 60 * 1000; // 1分間

/**
 * 重複チェック（重複の場合true）
 * @param {string} key - 重複チェック用キー
 * @returns {boolean} 重複している場合true
 */
function isDuplicateNotification(key) {
  const lastSent = recentNotifications.get(key);
  const now = Date.now();

  if (lastSent && now - lastSent < DUPLICATE_WINDOW_MS) {
    console.log(`🔄 Duplicate notification skipped: ${key}`);
    return true;
  }

  recentNotifications.set(key, now);
  return false;
}

/**
 * 古いキャッシュエントリを定期的にクリーンアップ
 */
setInterval(() => {
  const now = Date.now();
  for (const [key, timestamp] of recentNotifications.entries()) {
    if (now - timestamp > DUPLICATE_WINDOW_MS * 2) {
      recentNotifications.delete(key);
    }
  }
}, DUPLICATE_WINDOW_MS * 2);

/**
 * 第1案承認通知
 * POST /api/notification/first-plan-approved
 *
 * shift-scheduler-ai から呼び出される
 * グループに「シフト希望入力開始」を通知
 */
router.post('/first-plan-approved', async (req, res) => {
  try {
    const { tenant_id, store_id, plan_id, year, month } = req.body;

    console.log('📢 First plan approved notification request:', {
      tenant_id,
      store_id,
      plan_id,
      year,
      month,
    });

    // バリデーション
    if (!tenant_id || !year || !month) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: tenant_id, year, month',
      });
    }

    // 重複チェック
    const dedupeKey = `first_${tenant_id}_${year}_${month}`;
    if (isDuplicateNotification(dedupeKey)) {
      return res.json({
        success: true,
        message: 'Duplicate notification skipped',
        notified: false,
        skipped: true,
      });
    }

    // グループID取得
    const groupId = getGroupIdByTenant(tenant_id);
    if (!groupId) {
      console.warn(`⚠️ No group configured for tenant ${tenant_id}`);
      return res.json({
        success: true,
        message: 'No group configured for this tenant. Notification skipped.',
        notified: false,
      });
    }

    // DBからアルバイトの締切設定を取得
    const deadlineSettings = await getPartTimeDeadlineSettings(tenant_id);
    console.log('📋 Deadline settings from DB:', deadlineSettings);

    // メッセージ作成（DBの締切日を使用）
    const config = getNotificationConfig();
    const template = config.approvalMessages.firstPlanApproved;
    const message = formatMessage(template, {
      targetMonth: month,
      deadline: getDeadlineString(year, month, deadlineSettings.deadline_day),
      liffUrl: getLiffUrl(),
    });

    // グループに送信
    const sent = await sendGroupMessage(groupId, message);

    res.json({
      success: true,
      message: sent
        ? 'Notification sent to group'
        : 'Notification skipped (disabled)',
      notified: sent,
    });
  } catch (error) {
    console.error('❌ Error in first-plan-approved:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * 第2案承認通知（フェーズ5）
 * POST /api/notification/second-plan-approved
 *
 * shift-scheduler-ai から呼び出される
 * グループに「シフト確定」を通知
 */
router.post('/second-plan-approved', async (req, res) => {
  try {
    const { tenant_id, store_id, plan_id, year, month } = req.body;

    console.log('📢 Second plan approved notification request:', {
      tenant_id,
      store_id,
      plan_id,
      year,
      month,
    });

    // バリデーション
    if (!tenant_id || !year || !month) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: tenant_id, year, month',
      });
    }

    // 重複チェック
    const dedupeKey = `second_${tenant_id}_${year}_${month}`;
    if (isDuplicateNotification(dedupeKey)) {
      return res.json({
        success: true,
        message: 'Duplicate notification skipped',
        notified: false,
        skipped: true,
      });
    }

    // グループID取得
    const groupId = getGroupIdByTenant(tenant_id);
    if (!groupId) {
      console.warn(`⚠️ No group configured for tenant ${tenant_id}`);
      return res.json({
        success: true,
        message: 'No group configured for this tenant. Notification skipped.',
        notified: false,
      });
    }

    // メッセージ作成
    const config = getNotificationConfig();
    const template = config.approvalMessages.secondPlanApproved;
    const message = formatMessage(template, {
      targetMonth: month,
      liffUrl: getLiffUrl(),
    });

    // グループに送信
    const sent = await sendGroupMessage(groupId, message);

    res.json({
      success: true,
      message: sent
        ? 'Notification sent to group'
        : 'Notification skipped (disabled)',
      notified: sent,
    });
  } catch (error) {
    console.error('❌ Error in second-plan-approved:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * テスト用：手動で通知を送信
 * POST /api/notification/test
 *
 * ローカル開発・テスト用エンドポイント
 */
router.post('/test', async (req, res) => {
  try {
    const { tenant_id, message } = req.body;

    if (!tenant_id || !message) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: tenant_id, message',
      });
    }

    const groupId = getGroupIdByTenant(tenant_id);
    if (!groupId) {
      return res.status(400).json({
        success: false,
        error: `No group configured for tenant ${tenant_id}`,
      });
    }

    const sent = await sendGroupMessage(groupId, message);

    res.json({
      success: true,
      message: sent ? 'Test message sent' : 'Test message skipped (disabled)',
      groupId: groupId,
    });
  } catch (error) {
    console.error('❌ Error in test notification:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

export default router;
