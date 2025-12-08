import { messagingApi } from '@line/bot-sdk';
import { createRequire } from 'module';
import dotenv from 'dotenv';

dotenv.config();

const require = createRequire(import.meta.url);
const notificationConfig = require('../config/line-notification.json');

// LINE Messaging API クライアント
const client = new messagingApi.MessagingApiClient({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
});

/**
 * テナントIDからグループIDを取得
 * @param {number} tenantId - テナントID
 * @returns {string|null} グループID
 */
export function getGroupIdByTenant(tenantId) {
  const tenantKey = `tenant_${tenantId}`;
  const group = notificationConfig.groups[tenantKey];

  if (!group || !group.groupId) {
    console.warn(`⚠️ Group ID not configured for tenant ${tenantId}`);
    return null;
  }

  return group.groupId;
}

/**
 * グループにメッセージを送信
 * @param {string} groupId - LINEグループID
 * @param {string} message - 送信メッセージ
 * @returns {Promise<boolean>} 送信成功したかどうか
 */
export async function sendGroupMessage(groupId, message) {
  // 通知が無効化されている場合はスキップ
  if (process.env.NOTIFICATION_ENABLED === 'false') {
    console.log('📵 Notification is disabled. Skipping group message.');
    console.log('Message would be:', message);
    return true;
  }

  if (!groupId) {
    console.error('❌ Group ID is not provided');
    return false;
  }

  try {
    await client.pushMessage({
      to: groupId,
      messages: [
        {
          type: 'text',
          text: message,
        },
      ],
    });
    console.log(`✅ Group message sent to ${groupId}`);
    return true;
  } catch (error) {
    console.error('❌ Error sending group message:', error.message);
    return false;
  }
}

/**
 * 個人にメッセージを送信
 * @param {string} userId - LINE User ID
 * @param {string} message - 送信メッセージ
 * @returns {Promise<boolean>} 送信成功したかどうか
 */
export async function sendIndividualMessage(userId, message) {
  // 通知が無効化されている場合はスキップ
  if (process.env.NOTIFICATION_ENABLED === 'false') {
    console.log('📵 Notification is disabled. Skipping individual message.');
    console.log('Message would be:', message);
    return true;
  }

  try {
    await client.pushMessage({
      to: userId,
      messages: [
        {
          type: 'text',
          text: message,
        },
      ],
    });
    console.log(`✅ Message sent to ${userId}`);
    return true;
  } catch (error) {
    console.error(`❌ Error sending message to ${userId}:`, error.message);
    return false;
  }
}

/**
 * メッセージテンプレートの変数を置換
 * @param {string} template - メッセージテンプレート
 * @param {Object} variables - 置換する変数
 * @returns {string} 置換後のメッセージ
 */
export function formatMessage(template, variables) {
  let message = template;

  for (const [key, value] of Object.entries(variables)) {
    const placeholder = `{${key}}`;
    message = message.replace(new RegExp(placeholder, 'g'), value);
  }

  return message;
}

/**
 * LIFF URLを生成
 * @returns {string} LIFF URL
 */
export function getLiffUrl() {
  const liffId = process.env.LIFF_ID || '2008227932-Rq9rJrJn';
  return `https://liff.line.me/${liffId}`;
}

/**
 * 設定ファイルを取得
 * @returns {Object} 通知設定
 */
export function getNotificationConfig() {
  return notificationConfig;
}
