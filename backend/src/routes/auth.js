const express = require('express');
const router = express.Router();
const { getDb } = require('../db');
const { code2session } = require('../services/wechat');
const { generateToken } = require('../middleware/auth');

// POST /api/auth/login
// 微信小程序登录：用 code 换 openid，创建或返回用户 + token
router.post('/login', async (req, res) => {
  try {
    const { code, nickname, avatar } = req.body;

    if (!code) {
      return res.status(400).json({ error: '缺少登录凭证 code' });
    }

    let openid;
    try {
      const session = await code2session(code);
      openid = session.openid;
    } catch (err) {
      // Dev mode fallback: allow mock login when MOCK_AUTH=true
      if (process.env.MOCK_AUTH === 'true') {
        openid = `dev_${code}`;
      } else {
        throw err;
      }
    }

    const db = getDb();

    // Upsert user
    const existing = db.prepare('SELECT id, nickname, avatar FROM users WHERE openid = ?').get(openid);
    let user;
    if (existing) {
      // Update profile if provided
      if (nickname || avatar) {
        db.prepare('UPDATE users SET nickname = COALESCE(?, nickname), avatar = COALESCE(?, avatar) WHERE openid = ?')
          .run(nickname || null, avatar || null, openid);
      }
      user = existing;
    } else {
      const result = db.prepare('INSERT INTO users (openid, nickname, avatar) VALUES (?, ?, ?)')
        .run(openid, nickname || '微信用户', avatar || '');
      user = { id: result.lastInsertRowid, nickname: nickname || '微信用户', avatar: avatar || '' };
    }

    const token = generateToken(openid);

    res.json({
      token,
      user: { id: user.id, nickname: user.nickname, avatar: user.avatar }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: '登录失败，请重试' });
  }
});

module.exports = router;
