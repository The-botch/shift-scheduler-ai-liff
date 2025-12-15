import express from 'express';
import dotenv from 'dotenv';
import cron from 'node-cron';
import {
  sendAutoReminder,
  sendShiftReminders,
  sendReminderByPhase,
} from './services/reminderService.js';
import webhookRouter from './routes/webhook.js';
import notificationRouter from './routes/notification.js';
import { getNotificationConfig } from './services/lineService.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json());

// ===== ルート設定 =====

// ヘルスチェック
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Shift Reminder Service',
    timestamp: new Date().toISOString(),
    endpoints: {
      webhook: '/api/webhook/line',
      notification: '/api/notification/*',
      sendReminder: '/api/send-reminder',
      sendReminderPhase: '/api/send-reminder-phase',
    },
  });
});

// LINE Webhook
app.use('/api/webhook', webhookRouter);

// 通知API（第1案・第2案承認通知）
app.use('/api/notification', notificationRouter);

// 手動でリマインダーを送信するエンドポイント（テスト用）
app.post('/api/send-reminder', async (req, res) => {
  try {
    const { year, month } = req.body;

    if (!year || !month) {
      return res.status(400).json({
        success: false,
        error: 'year and month are required',
      });
    }

    const result = await sendShiftReminders(year, month);

    res.json({
      success: true,
      message: `Reminder check completed for ${year}/${month}`,
      ...result,
    });
  } catch (error) {
    console.error('Error sending reminders:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// 自動リマインド実行（テスト用）
app.post('/api/send-auto-reminder', async (req, res) => {
  try {
    const result = await sendAutoReminder();

    res.json({
      success: true,
      message: 'Auto reminder executed',
      ...result,
    });
  } catch (error) {
    console.error('Error in auto reminder:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// フェーズを指定してリマインダーを送信（手動送信用）
app.post('/api/send-reminder-phase', async (req, res) => {
  try {
    const { year, month, phase } = req.body;

    if (!year || !month || !phase) {
      return res.status(400).json({
        success: false,
        error: 'year, month, and phase are required',
        usage: {
          year: 'number (e.g., 2026)',
          month: 'number (1-12)',
          phase: 'number (1=7日前, 2=3日前, 3=1日前, 4=締切後)',
        },
      });
    }

    const phaseNumber = parseInt(phase, 10);
    if (phaseNumber < 1 || phaseNumber > 4) {
      return res.status(400).json({
        success: false,
        error: 'phase must be 1, 2, 3, or 4',
        phases: {
          1: '7日前リマインド（匿名）',
          2: '3日前リマインド（統計付き）',
          3: '1日前リマインド（名前入り）',
          4: '締切後通知',
        },
      });
    }

    const result = await sendReminderByPhase(year, month, phaseNumber);

    res.json({
      success: true,
      message: `Phase ${phaseNumber} reminder sent for ${year}/${month}`,
      ...result,
    });
  } catch (error) {
    console.error('Error sending phase reminder:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// ===== Cronジョブ設定 =====

const config = getNotificationConfig();
const cronSchedule = config.cronSchedule || '0 9 * * *';

// 毎日定時にリマインド通知をチェック（フェーズ4のみ自動送信、フェーズ1~3は手動）
cron.schedule(cronSchedule, async () => {
  console.log('⏰ Cron job triggered at', new Date().toISOString());

  try {
    const result = await sendAutoReminder();
    console.log('✅ Cron job completed:', result);
  } catch (error) {
    console.error('❌ Cron job failed:', error);
  }
});

// ===== サーバー起動 =====

app.listen(PORT, () => {
  console.log('===========================================');
  console.log(`🚀 Shift Reminder Service running on port ${PORT}`);
  console.log(
    `📅 Cron schedule: ${cronSchedule} (${config.settings.timezone})`
  );
  console.log('📋 Cron behavior: Phase 4 only (Phase 1-3 is manual)');
  console.log(
    `📵 Notification enabled: ${process.env.NOTIFICATION_ENABLED !== 'false'}`
  );
  console.log('===========================================');
  console.log('Available endpoints:');
  console.log('  GET  /                           - Health check');
  console.log('  POST /api/webhook/line           - LINE Webhook');
  console.log('  POST /api/notification/first-plan-approved');
  console.log('  POST /api/notification/second-plan-approved');
  console.log('  POST /api/notification/test      - Test notification');
  console.log(
    '  POST /api/send-reminder          - Manual reminder (day-based)'
  );
  console.log('  POST /api/send-auto-reminder     - Auto reminder');
  console.log(
    '  POST /api/send-reminder-phase    - Manual reminder (phase 1-4)'
  );
  console.log('===========================================');
});
