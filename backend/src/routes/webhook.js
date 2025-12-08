import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const router = express.Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * LINE Webhook エンドポイント
 * POST /api/webhook/line
 *
 * LINE Platform からの Webhook イベントを受信
 * 主にグループ参加時のグループID取得に使用
 */
router.post('/line', async (req, res) => {
  try {
    const events = req.body.events || [];

    console.log('📨 Webhook received:', events.length, 'events');

    for (const event of events) {
      // グループ参加イベント
      if (event.type === 'join' && event.source.type === 'group') {
        const groupId = event.source.groupId;
        const timestamp = new Date(event.timestamp).toISOString();

        console.log('===========================================');
        console.log('🎉 Bot joined a new group!');
        console.log('Group ID:', groupId);
        console.log('Timestamp:', timestamp);
        console.log('===========================================');

        // ファイルにも記録（ローカル開発用）
        try {
          const dataDir = path.join(__dirname, '..', 'data');
          const logPath = path.join(dataDir, 'group-ids.log');

          // dataディレクトリが存在しない場合は作成
          if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
          }

          const logLine = `${timestamp} | Group ID: ${groupId}\n`;
          fs.appendFileSync(logPath, logLine);
          console.log('📝 Group ID saved to:', logPath);
        } catch (fileError) {
          // ファイル書き込みエラーは警告のみ（本番環境では失敗する可能性あり）
          console.warn('⚠️ Could not save to file:', fileError.message);
        }
      }

      // グループ退出イベント
      if (event.type === 'leave' && event.source.type === 'group') {
        console.log('👋 Bot left group:', event.source.groupId);
      }

      // メッセージイベント（将来の拡張用）
      if (event.type === 'message') {
        console.log('💬 Message received from:', event.source.type);
        // 現時点ではメッセージには応答しない
      }
    }

    // LINE Platform には常に 200 OK を返す
    res.status(200).send('OK');
  } catch (error) {
    console.error('❌ Webhook error:', error);
    // エラーでも 200 を返す（LINE が再送を繰り返さないように）
    res.status(200).send('OK');
  }
});

/**
 * Webhook 検証用エンドポイント
 * GET /api/webhook/line
 *
 * LINE Developers Console での Webhook URL 検証に使用
 */
router.get('/line', (req, res) => {
  res.status(200).send('Webhook endpoint is active');
});

export default router;
