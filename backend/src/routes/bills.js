const express = require('express');
const router = express.Router();
const { getDb } = require('../db');
const { authMiddleware } = require('../middleware/auth');
const { classifyBill } = require('../services/ai');

// 所有账单路由都需要登录
router.use(authMiddleware);

// POST /api/bills — 创建账单（AI 分类）
router.post('/', async (req, res) => {
  try {
    const { raw_text, recorded_at } = req.body;

    if (!raw_text || !raw_text.trim()) {
      return res.status(400).json({ error: '请输入记账内容' });
    }

    // AI 分类
    const classified = await classifyBill(raw_text.trim());

    if (classified.amount <= 0) {
      return res.status(400).json({ error: '未能识别金额，请重新描述' });
    }

    const db = getDb();
    const user = db.prepare('SELECT id FROM users WHERE openid = ?').get(req.openid);

    // 金额存分为单位
    const amountInCents = Math.round(classified.amount * 100);

    const result = db.prepare(
      'INSERT INTO bills (user_id, type, amount, category, raw_text, recorded_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(user.id, classified.type, amountInCents, classified.category, raw_text.trim(), recorded_at || new Date().toISOString().slice(0, 10));

    const bill = db.prepare('SELECT * FROM bills WHERE id = ?').get(result.lastInsertRowid);

    res.json({
      id: bill.id,
      type: bill.type,
      amount: bill.amount / 100,
      category: bill.category,
      raw_text: bill.raw_text,
      recorded_at: bill.recorded_at,
      created_at: bill.created_at
    });
  } catch (err) {
    console.error('Create bill error:', err);
    res.status(500).json({ error: '记账失败，请重试' });
  }
});

// GET /api/bills — 获取账单列表
router.get('/', (req, res) => {
  try {
    const { date, limit = 50, offset = 0 } = req.query;
    const db = getDb();
    const user = db.prepare('SELECT id FROM users WHERE openid = ?').get(req.openid);

    let sql = 'SELECT * FROM bills WHERE user_id = ?';
    const params = [user.id];

    if (date) {
      sql += ' AND recorded_at = ?';
      params.push(date);
    }

    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(Number(limit), Number(offset));

    const bills = db.prepare(sql).all(...params);

    res.json(bills.map(b => ({
      id: b.id,
      type: b.type,
      amount: b.amount / 100,
      category: b.category,
      raw_text: b.raw_text,
      recorded_at: b.recorded_at,
      created_at: b.created_at
    })));
  } catch (err) {
    console.error('List bills error:', err);
    res.status(500).json({ error: '获取账单失败' });
  }
});

// DELETE /api/bills/:id — 删除账单
router.delete('/:id', (req, res) => {
  try {
    const db = getDb();
    const user = db.prepare('SELECT id FROM users WHERE openid = ?').get(req.openid);
    const bill = db.prepare('SELECT * FROM bills WHERE id = ? AND user_id = ?').get(req.params.id, user.id);

    if (!bill) {
      return res.status(404).json({ error: '账单不存在' });
    }

    db.prepare('DELETE FROM bills WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    console.error('Delete bill error:', err);
    res.status(500).json({ error: '删除失败' });
  }
});

module.exports = router;
