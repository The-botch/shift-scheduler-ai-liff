import { messagingApi } from '@line/bot-sdk'
import dotenv from 'dotenv'
import pool from '../config/database.js'

dotenv.config()

const client = new messagingApi.MessagingApiClient({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN
})

/**
 * シフト未提出のアルバイトスタッフを取得
 * @param {number} year - 対象年
 * @param {number} month - 対象月
 * @returns {Promise<Array>} - 未提出スタッフのリスト
 */
export async function getUnsubmittedPartTimeStaff(year, month) {
  const tenantId = process.env.TENANT_ID || 3

  const query = `
    SELECT
      sla.line_user_id,
      s.staff_id,
      s.name,
      s.employment_type,
      st.store_name
    FROM hr.staff_line_accounts sla
    JOIN hr.staff s ON sla.staff_id = s.staff_id
    JOIN core.stores st ON s.store_id = st.store_id
    JOIN core.employment_types et ON s.employment_type = et.employment_code AND et.tenant_id = s.tenant_id
    WHERE sla.tenant_id = $1
      AND sla.is_active = true
      AND s.is_active = true
      AND et.payment_type = 'HOURLY'
      AND NOT EXISTS (
        SELECT 1 FROM ops.shift_preferences sp
        WHERE sp.staff_id = s.staff_id
          AND sp.year = $2
          AND sp.month = $3
      )
  `

  try {
    const result = await pool.query(query, [tenantId, year, month])
    return result.rows
  } catch (error) {
    console.error('❌ Error fetching unsubmitted staff:', error)
    throw error
  }
}

/**
 * LINEプッシュメッセージ送信
 * @param {string} userId - LINE User ID
 * @param {string} message - 送信メッセージ
 */
export async function sendLineMessage(userId, message) {
  try {
    await client.pushMessage({
      to: userId,
      messages: [
        {
          type: 'text',
          text: message
        }
      ]
    })
    console.log(`✅ Message sent to ${userId}`)
  } catch (error) {
    console.error(`❌ Error sending message to ${userId}:`, error)
    throw error
  }
}

/**
 * シフト提出リマインダーを送信
 * @param {number} year - 対象年
 * @param {number} month - 対象月
 */
export async function sendShiftReminders(year, month) {
  console.log(`📅 Sending shift reminders for ${year}/${month}`)

  try {
    const unsubmittedStaff = await getUnsubmittedPartTimeStaff(year, month)

    if (unsubmittedStaff.length === 0) {
      console.log('✅ All part-time staff have submitted their shift preferences')
      return { success: true, count: 0 }
    }

    console.log(`📝 Found ${unsubmittedStaff.length} staff who haven't submitted`)

    // 締切日を計算（N月の締切 = N-1月10日）
    let deadlineMonth = month - 1
    let deadlineYear = year
    if (deadlineMonth === 0) {
      deadlineMonth = 12
      deadlineYear--
    }

    const results = []
    for (const staff of unsubmittedStaff) {
      const message = `【シフト提出リマインド】

${staff.name} さん、こんにちは！

${year}年${month}月のシフト希望がまだ提出されていません。

📅 提出期限: ${deadlineYear}年${deadlineMonth}月10日 23:59

以下のリンクからシフト希望を入力してください：
https://liff.line.me/${process.env.LIFF_ID || '2008227932-Rq9rJrJn'}

ご協力をお願いいたします。`

      try {
        await sendLineMessage(staff.line_user_id, message)
        results.push({ staff_id: staff.staff_id, name: staff.name, success: true })
      } catch (error) {
        results.push({ staff_id: staff.staff_id, name: staff.name, success: false, error: error.message })
      }
    }

    const successCount = results.filter(r => r.success).length
    console.log(`✅ Sent ${successCount}/${results.length} reminders successfully`)

    return { success: true, count: results.length, results }
  } catch (error) {
    console.error('❌ Error in sendShiftReminders:', error)
    throw error
  }
}
