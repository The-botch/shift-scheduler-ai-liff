import dotenv from 'dotenv';
import { sendShiftReminders } from '../services/reminderService.js';

dotenv.config();

// コマンドライン引数から年月を取得
const args = process.argv.slice(2);
const year = args[0] ? parseInt(args[0]) : new Date().getFullYear();
const month = args[1] ? parseInt(args[1]) : new Date().getMonth() + 2; // 来月

console.log(`📅 Sending shift reminders for ${year}/${month}`);

sendShiftReminders(year, month)
  .then(result => {
    console.log('✅ Reminder job completed:', result);
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ Reminder job failed:', error);
    process.exit(1);
  });
