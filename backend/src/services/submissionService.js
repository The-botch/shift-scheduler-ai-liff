import pool from '../config/database.js';
import dotenv from 'dotenv';

dotenv.config();

/**
 * アルバイトスタッフのシフト提出状況を取得
 * @param {number} tenantId - テナントID
 * @param {number} year - 対象年
 * @param {number} month - 対象月
 * @returns {Promise<Object>} 提出状況の統計情報
 */
export async function getPartTimeSubmissionStats(tenantId, year, month) {
  // アルバイト（HOURLY）の総数を取得
  const totalQuery = `
    SELECT COUNT(*) as total_count
    FROM hr.staff s
    JOIN hr.staff_line_accounts sla ON s.staff_id = sla.staff_id AND s.tenant_id = sla.tenant_id
    JOIN core.employment_types et ON s.employment_type = et.employment_code AND et.tenant_id = s.tenant_id
    WHERE s.tenant_id = $1
      AND s.is_active = true
      AND sla.is_active = true
      AND et.payment_type = 'HOURLY'
  `;

  // 提出済みアルバイトの数を取得（staff_monthly_submissionsテーブルを参照）
  const submittedQuery = `
    SELECT COUNT(DISTINCT s.staff_id) as submitted_count
    FROM hr.staff s
    JOIN hr.staff_line_accounts sla ON s.staff_id = sla.staff_id AND s.tenant_id = sla.tenant_id
    JOIN core.employment_types et ON s.employment_type = et.employment_code AND et.tenant_id = s.tenant_id
    JOIN ops.staff_monthly_submissions sms ON s.staff_id = sms.staff_id AND s.tenant_id = sms.tenant_id
    WHERE s.tenant_id = $1
      AND s.is_active = true
      AND sla.is_active = true
      AND et.payment_type = 'HOURLY'
      AND sms.year = $2
      AND sms.month = $3
  `;

  try {
    const [totalResult, submittedResult] = await Promise.all([
      pool.query(totalQuery, [tenantId]),
      pool.query(submittedQuery, [tenantId, year, month]),
    ]);

    const totalCount = parseInt(totalResult.rows[0].total_count, 10);
    const submittedCount = parseInt(
      submittedResult.rows[0].submitted_count,
      10
    );
    const unsubmittedCount = totalCount - submittedCount;

    return {
      totalCount,
      submittedCount,
      unsubmittedCount,
    };
  } catch (error) {
    console.error('❌ Error getting submission stats:', error);
    throw error;
  }
}

/**
 * 未提出のアルバイトスタッフ一覧を取得
 * @param {number} tenantId - テナントID
 * @param {number} year - 対象年
 * @param {number} month - 対象月
 * @returns {Promise<Array>} 未提出スタッフの配列
 */
export async function getUnsubmittedPartTimeStaff(tenantId, year, month) {
  // staff_monthly_submissionsテーブルを参照して未提出者を取得
  const query = `
    SELECT
      sla.line_user_id,
      s.staff_id,
      s.name,
      s.employment_type,
      st.store_name
    FROM hr.staff_line_accounts sla
    JOIN hr.staff s ON sla.staff_id = s.staff_id AND sla.tenant_id = s.tenant_id
    JOIN core.stores st ON s.store_id = st.store_id
    JOIN core.employment_types et ON s.employment_type = et.employment_code AND et.tenant_id = s.tenant_id
    WHERE sla.tenant_id = $1
      AND sla.is_active = true
      AND s.is_active = true
      AND et.payment_type = 'HOURLY'
      AND NOT EXISTS (
        SELECT 1 FROM ops.staff_monthly_submissions sms
        WHERE sms.staff_id = s.staff_id
          AND sms.tenant_id = s.tenant_id
          AND sms.year = $2
          AND sms.month = $3
      )
    ORDER BY s.name
  `;

  try {
    const result = await pool.query(query, [tenantId, year, month]);
    return result.rows;
  } catch (error) {
    console.error('❌ Error fetching unsubmitted staff:', error);
    throw error;
  }
}

/**
 * 未提出者の名前一覧を文字列で取得
 * @param {number} tenantId - テナントID
 * @param {number} year - 対象年
 * @param {number} month - 対象月
 * @returns {Promise<string>} 名前一覧（改行区切り）
 */
export async function getUnsubmittedNamesString(tenantId, year, month) {
  const staff = await getUnsubmittedPartTimeStaff(tenantId, year, month);

  if (staff.length === 0) {
    return '（なし）';
  }

  // 名前をリスト形式で返す
  return staff.map((s, index) => `${index + 1}. ${s.name}`).join('\n');
}

/**
 * アルバイト（PART_TIME）の締切設定をDBから取得
 * @param {number} tenantId - テナントID
 * @returns {Promise<Object>} 締切設定 { deadline_day, deadline_time, is_enabled }
 */
export async function getPartTimeDeadlineSettings(tenantId) {
  const query = `
    SELECT deadline_day, deadline_time, is_enabled
    FROM core.shift_deadline_settings
    WHERE tenant_id = $1 AND employment_type = 'PART_TIME'
  `;

  try {
    const result = await pool.query(query, [tenantId]);

    if (result.rows.length === 0) {
      // デフォルト値を返す
      console.warn(
        `⚠️ No deadline settings found for tenant ${tenantId}, using defaults`
      );
      return {
        deadline_day: 10,
        deadline_time: '23:59',
        is_enabled: true,
      };
    }

    return {
      deadline_day: result.rows[0].deadline_day,
      deadline_time: result.rows[0].deadline_time || '23:59',
      is_enabled: result.rows[0].is_enabled,
    };
  } catch (error) {
    console.error('❌ Error fetching deadline settings:', error);
    // エラー時はデフォルト値
    return {
      deadline_day: 10,
      deadline_time: '23:59',
      is_enabled: true,
    };
  }
}

/**
 * 全アルバイトスタッフを取得（LINE User ID付き）
 * @param {number} tenantId - テナントID
 * @returns {Promise<Array>} スタッフの配列
 */
export async function getAllPartTimeStaffWithLineId(tenantId) {
  const query = `
    SELECT
      sla.line_user_id,
      s.staff_id,
      s.name,
      s.employment_type,
      st.store_name
    FROM hr.staff_line_accounts sla
    JOIN hr.staff s ON sla.staff_id = s.staff_id AND sla.tenant_id = s.tenant_id
    JOIN core.stores st ON s.store_id = st.store_id
    JOIN core.employment_types et ON s.employment_type = et.employment_code AND et.tenant_id = s.tenant_id
    WHERE sla.tenant_id = $1
      AND sla.is_active = true
      AND s.is_active = true
      AND et.payment_type = 'HOURLY'
    ORDER BY s.name
  `;

  try {
    const result = await pool.query(query, [tenantId]);
    return result.rows;
  } catch (error) {
    console.error('❌ Error fetching all part-time staff:', error);
    throw error;
  }
}
