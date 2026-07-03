const express = require('express');
const router = express.Router();
const { getDb } = require('../db');
const { authMiddleware } = require('../middleware/auth');

router.use(authMiddleware);

// GET /api/stats/monthly?year=2026&month=7
router.get('/monthly', (req, res) => {
  try {
    const now = new Date();
    const year = req.query.year || now.getFullYear();
    const month = String(req.query.month || (now.getMonth() + 1)).padStart(2, '0');
    const prefix = `${year}-${month}`;

    const db = getDb();
    const user = db.prepare('SELECT id FROM users WHERE openid = ?').get(req.openid);

    // 本月总支出（分）
    const totalRow = db.prepare(
      `SELECT COALESCE(SUM(amount), 0) as total, COUNT(*) as count
       FROM bills WHERE user_id = ? AND type = 'expense' AND recorded_at LIKE ?`
    ).get(user.id, `${prefix}%`);

    // 按类目汇总
    const categories = db.prepare(
      `SELECT category, SUM(amount) as total, COUNT(*) as count
       FROM bills WHERE user_id = ? AND type = 'expense' AND recorded_at LIKE ?
       GROUP BY category ORDER BY total DESC`
    ).all(user.id, `${prefix}%`);

    const grandTotal = totalRow.total;
    const breakdown = categories.map(c => ({
      category: c.category,
      amount: c.total / 100,
      count: c.count,
      percentage: grandTotal > 0 ? Math.round(c.total / grandTotal * 100) : 0
    }));

    // 上月对比
    const lastMonth = month === '01'
      ? `${year - 1}-12`
      : `${year}-${String(Number(month) - 1).padStart(2, '0')}`;
    const lastTotal = db.prepare(
      `SELECT COALESCE(SUM(amount), 0) as total
       FROM bills WHERE user_id = ? AND type = 'expense' AND recorded_at LIKE ?`
    ).get(user.id, `${lastMonth}%`);

    res.json({
      year: Number(year),
      month: Number(month),
      total: grandTotal / 100,
      count: totalRow.count,
      breakdown,
      vs_last_month: lastTotal.total > 0
        ? { amount: (grandTotal - lastTotal.total) / 100, percentage: Math.round((grandTotal - lastTotal.total) / lastTotal.total * 100) }
        : null
    });
  } catch (err) {
    console.error('Stats error:', err);
    res.status(500).json({ error: '获取统计数据失败' });
  }
});

// GET /api/stats/weekly?date=2026-07-03
router.get('/weekly', (req, res) => {
  try {
    const db = getDb();
    const user = db.prepare('SELECT id FROM users WHERE openid = ?').get(req.openid);

    const targetDate = req.query.date || new Date().toISOString().slice(0, 10);
    const d = new Date(targetDate);
    const dayOfWeek = d.getDay();
    const monday = new Date(d);
    monday.setDate(d.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);

    const startDate = monday.toISOString().slice(0, 10);
    const endDate = sunday.toISOString().slice(0, 10);

    const row = db.prepare(
      `SELECT COALESCE(SUM(amount), 0) as total, COUNT(*) as count
       FROM bills WHERE user_id = ? AND type = 'expense' AND recorded_at BETWEEN ? AND ?`
    ).get(user.id, startDate, endDate);

    const topCategory = db.prepare(
      `SELECT category, SUM(amount) as total
       FROM bills WHERE user_id = ? AND type = 'expense' AND recorded_at BETWEEN ? AND ?
       GROUP BY category ORDER BY total DESC LIMIT 1`
    ).get(user.id, startDate, endDate);

    // Daily breakdown
    const dailyBreakdown = db.prepare(
      `SELECT recorded_at, SUM(amount) as total, COUNT(*) as count
       FROM bills WHERE user_id = ? AND type = 'expense' AND recorded_at BETWEEN ? AND ?
       GROUP BY recorded_at ORDER BY recorded_at`
    ).all(user.id, startDate, endDate);

    res.json({
      start_date: startDate,
      end_date: endDate,
      total: row.total / 100,
      count: row.count,
      top_category: topCategory ? { category: topCategory.category, amount: topCategory.total / 100 } : null,
      daily: dailyBreakdown.map(d => ({ date: d.recorded_at, amount: d.total / 100, count: d.count }))
    });
  } catch (err) {
    console.error('Weekly stats error:', err);
    res.status(500).json({ error: '获取周报数据失败' });
  }
});

module.exports = router;
