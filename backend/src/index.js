import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import cron from 'node-cron'
import { sendShiftReminders } from './services/reminderService.js'

dotenv.config()

const app = express()
const PORT = process.env.PORT || 3001

// CORS設定: Vercelからのリクエストを許可
app.use(cors({
  origin: function (origin, callback) {
    // リクエストにoriginがない場合（同一オリジンなど）は許可
    if (!origin) return callback(null, true)

    // 許可するオリジン
    const allowedOrigins = [
      'https://shift-scheduler-ai-liff.vercel.app',  // 本番環境
      /https:\/\/.*\.vercel\.app$/,                   // Vercelの全プレビュー環境
      'http://localhost:5173',                        // ローカル開発
      'http://127.0.0.1:5173'                         // ローカル開発
    ]

    // オリジンが許可リストに含まれているかチェック
    const isAllowed = allowedOrigins.some(allowed => {
      if (typeof allowed === 'string') {
        return origin === allowed
      } else if (allowed instanceof RegExp) {
        return allowed.test(origin)
      }
      return false
    })

    if (isAllowed) {
      callback(null, true)
    } else {
      console.warn(`⚠️ CORS: Blocked request from origin: ${origin}`)
      callback(new Error('Not allowed by CORS'))
    }
  },
  credentials: true
}))

app.use(express.json())

// ヘルスチェック
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Shift Reminder Service',
    timestamp: new Date().toISOString()
  })
})

// 手動でリマインダーを送信するエンドポイント（テスト用）
app.post('/api/send-reminder', async (req, res) => {
  try {
    const { year, month } = req.body

    if (!year || !month) {
      return res.status(400).json({
        success: false,
        error: 'year and month are required'
      })
    }

    const result = await sendShiftReminders(year, month)

    res.json({
      success: true,
      message: `Reminders sent for ${year}/${month}`,
      ...result
    })
  } catch (error) {
    console.error('Error sending reminders:', error)
    res.status(500).json({
      success: false,
      error: error.message
    })
  }
})

// Cronジョブ: 毎月5日と8日の10:00に翌月分のリマインドを送信
// '0 10 5,8 * *' = 毎月5日と8日の10:00
cron.schedule('0 10 5,8 * *', () => {
  const now = new Date()
  const targetYear = now.getMonth() === 11 ? now.getFullYear() + 1 : now.getFullYear()
  const targetMonth = now.getMonth() === 11 ? 1 : now.getMonth() + 2

  console.log(`⏰ Cron job triggered: Sending reminders for ${targetYear}/${targetMonth}`)
  sendShiftReminders(targetYear, targetMonth)
    .then(result => {
      console.log('✅ Cron job completed:', result)
    })
    .catch(error => {
      console.error('❌ Cron job failed:', error)
    })
})

app.listen(PORT, () => {
  console.log(`🚀 Shift Reminder Service running on port ${PORT}`)
  console.log(`📅 Cron job scheduled: Reminders will be sent on 5th and 8th of each month at 10:00`)
})
