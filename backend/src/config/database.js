import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

// shift-scheduler-ai の PostgreSQL に接続
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: ['production', 'staging'].includes(process.env.NODE_ENV)
    ? { rejectUnauthorized: false }
    : false,
});

// 接続テスト
pool.on('connect', () => {
  console.log('✅ Database connected successfully');
});

pool.on('error', err => {
  console.error('❌ Unexpected database error:', err);
  process.exit(-1);
});

export default pool;
