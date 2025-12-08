import dotenv from 'dotenv';
import {
  getGroupIdByTenant,
  sendGroupMessage,
  formatMessage,
  getLiffUrl,
  getNotificationConfig,
} from './lineService.js';
import {
  getPartTimeSubmissionStats,
  getUnsubmittedNamesString,
  getPartTimeDeadlineSettings,
} from './submissionService.js';

dotenv.config();

/**
 * 締切日までの残り日数を計算
 * @param {number} year - 対象年
 * @param {number} month - 対象月
 * @param {number} deadlineDay - 締切日（1-31）
 * @param {string} deadlineTime - 締切時刻（"HH:MM"形式）
 * @returns {number} 残り日数（負の値は締切超過）
 */
export function getDaysUntilDeadline(
  year,
  month,
  deadlineDay,
  deadlineTime = '23:59'
) {
  // N月のシフト締切はN-1月のdeadlineDay日
  let deadlineMonth = month - 1;
  let deadlineYear = year;

  if (deadlineMonth === 0) {
    deadlineMonth = 12;
    deadlineYear--;
  }

  // 締切時刻をパース
  const [hour, minute] = deadlineTime.split(':').map(Number);

  const deadline = new Date(
    deadlineYear,
    deadlineMonth - 1,
    deadlineDay,
    hour,
    minute,
    59
  );
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const diffTime = deadline.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  return diffDays;
}

/**
 * 締切日文字列を生成
 * @param {number} year - 対象年
 * @param {number} month - 対象月
 * @param {number} deadlineDay - 締切日
 * @returns {string} 締切日文字列（例: "12月10日"）
 */
export function getDeadlineString(year, month, deadlineDay) {
  // N月のシフト締切はN-1月のdeadlineDay日
  let deadlineMonth = month - 1;

  if (deadlineMonth === 0) {
    deadlineMonth = 12;
  }

  return `${deadlineMonth}月${deadlineDay}日`;
}

/**
 * 残り日数からフェーズを判定
 * @param {number} daysUntilDeadline - 締切までの残り日数
 * @returns {Object|null} 該当するフェーズ設定（該当なしはnull）
 */
export function determinePhase(daysUntilDeadline) {
  const config = getNotificationConfig();
  const reminders = config.reminders;

  // フェーズ4: 締切後（0日以下）
  if (daysUntilDeadline <= 0) {
    return reminders.find(r => r.phase === 4);
  }

  // フェーズ1〜3: 残り日数に応じて判定
  for (const reminder of reminders) {
    if (reminder.daysBefore === daysUntilDeadline) {
      return reminder;
    }
  }

  return null;
}

/**
 * リマインド通知を送信（cron から呼び出される）
 * @param {number} year - 対象年
 * @param {number} month - 対象月
 * @returns {Promise<Object>} 送信結果
 */
export async function sendReminderNotification(year, month) {
  const tenantId = parseInt(process.env.TENANT_ID, 10) || 3;

  console.log(`📅 Checking reminder for ${year}/${month}, tenant ${tenantId}`);

  // DBからアルバイトの締切設定を取得
  const deadlineSettings = await getPartTimeDeadlineSettings(tenantId);
  console.log('📋 Deadline settings from DB:', deadlineSettings);

  // 残り日数を計算（DBの締切日を使用）
  const daysUntilDeadline = getDaysUntilDeadline(
    year,
    month,
    deadlineSettings.deadline_day,
    deadlineSettings.deadline_time
  );
  console.log(`⏰ Days until deadline: ${daysUntilDeadline}`);

  // フェーズを判定
  const phase = determinePhase(daysUntilDeadline);

  if (!phase) {
    console.log('📭 No notification scheduled for today');
    return { success: true, notified: false, reason: 'No phase matched' };
  }

  console.log(`📢 Phase ${phase.phase} (${phase.type}) triggered`);

  // グループIDを取得
  const groupId = getGroupIdByTenant(tenantId);
  if (!groupId) {
    console.warn(`⚠️ No group configured for tenant ${tenantId}`);
    return { success: true, notified: false, reason: 'No group configured' };
  }

  // 統計情報を取得（フェーズ2, 3で使用）
  const stats = await getPartTimeSubmissionStats(tenantId, year, month);
  console.log('📊 Submission stats:', stats);

  // 未提出者名を取得（フェーズ3で使用）
  let unsubmittedNames = '';
  if (phase.type === 'named') {
    unsubmittedNames = await getUnsubmittedNamesString(tenantId, year, month);
  }

  // メッセージを作成（DBの締切日を使用）
  const message = formatMessage(phase.message, {
    targetMonth: month,
    deadline: getDeadlineString(year, month, deadlineSettings.deadline_day),
    liffUrl: getLiffUrl(),
    totalCount: stats.totalCount,
    submittedCount: stats.submittedCount,
    unsubmittedCount: stats.unsubmittedCount,
    unsubmittedNames: unsubmittedNames,
  });

  // グループに送信
  const sent = await sendGroupMessage(groupId, message);

  return {
    success: true,
    notified: sent,
    phase: phase.phase,
    type: phase.type,
    stats: stats,
    deadlineSettings: deadlineSettings,
  };
}

/**
 * 対象月を自動計算してリマインドを送信
 * cronジョブから呼び出される場合に使用
 */
export async function sendAutoReminder() {
  const now = new Date();

  // 現在の日付から対象月を判定（来月分のシフト）
  let targetYear = now.getFullYear();
  let targetMonth = now.getMonth() + 2; // 来月分

  if (targetMonth > 12) {
    targetMonth = 1;
    targetYear++;
  }

  console.log(`🤖 Auto reminder: targeting ${targetYear}/${targetMonth}`);

  return await sendReminderNotification(targetYear, targetMonth);
}

// 旧関数との互換性を維持（既存のcronジョブ用）
export async function sendShiftReminders(year, month) {
  return await sendReminderNotification(year, month);
}
