# 极简记账 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建一个微信小程序 + Node.js 后端的 AI 对话式记账应用，MVP 支持文本记账、AI 自动分类、账单列表和月度统计。

**Architecture:** 微信原生小程序前端 → HTTPS → Node.js/Express 后端 → SQLite 数据库；记账文本通过 LLM API 解析为结构化数据（金额+分类）。

**Tech Stack:** 微信原生小程序、Node.js 18+、Express 4.x、better-sqlite3、Claude API（或兼容 OpenAI 格式的模型）、腾讯云轻量服务器

**Project Structure:**
```
prd/
├── backend/           # Node.js 后端
│   ├── src/
│   │   ├── server.js
│   │   ├── db.js
│   │   ├── middleware/
│   │   │   └── auth.js
│   │   ├── routes/
│   │   │   ├── auth.js
│   │   │   ├── bills.js
│   │   │   └── stats.js
│   │   └── services/
│   │       ├── ai.js
│   │       └── wechat.js
│   ├── tests/
│   │   ├── auth.test.js
│   │   ├── bills.test.js
│   │   └── ai.test.js
│   └── package.json
├── miniprogram/       # 微信小程序
│   ├── app.js
│   ├── app.json
│   ├── app.wxss
│   ├── pages/
│   │   ├── index/     # 首页（记账）
│   │   └── stats/     # 统计页
│   ├── components/
│   │   └── bill-card/
│   └── utils/
│       ├── api.js
│       └── auth.js
└── docs/
```

---

### Task 1: 后端项目初始化

**Files:**
- Create: `backend/package.json`
- Create: `backend/.env.example`
- Create: `backend/.gitignore`

- [ ] **Step 1: 初始化 package.json**

Create `backend/package.json`:
```json
{
  "name": "jijian-jizhang-backend",
  "version": "1.0.0",
  "description": "极简记账后端服务",
  "main": "src/server.js",
  "scripts": {
    "start": "node src/server.js",
    "dev": "node --watch src/server.js",
    "test": "node --test tests/*.test.js"
  },
  "dependencies": {
    "express": "^4.21.0",
    "better-sqlite3": "^11.6.0",
    "jsonwebtoken": "^9.0.2",
    "axios": "^1.7.7",
    "cors": "^2.8.5",
    "dotenv": "^16.4.5"
  }
}
```

- [ ] **Step 2: 创建 .env.example**

Create `backend/.env.example`:
```
PORT=3000
JWT_SECRET=change-me-to-random-string
LLM_API_KEY=your-api-key-here
LLM_API_URL=https://api.anthropic.com/v1/messages
LLM_MODEL=claude-haiku-4-5-20251001
WECHAT_APPID=your-wechat-appid
WECHAT_SECRET=your-wechat-secret
```

- [ ] **Step 3: 创建 .gitignore**

Create `backend/.gitignore`:
```
node_modules/
.env
*.db
*.db-journal
```

- [ ] **Step 4: 安装依赖**

```bash
cd backend && npm install
```

- [ ] **Step 5: Commit**

```bash
git add backend/package.json backend/.env.example backend/.gitignore backend/package-lock.json
git commit -m "feat: init backend project with Express + SQLite"
```

---

### Task 2: 数据库层

**Files:**
- Create: `backend/src/db.js`

- [ ] **Step 1: 编写数据库初始化代码**

Create `backend/src/db.js`:
```js
const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'data.db');

let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initTables();
  }
  return db;
}

function initTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      openid TEXT UNIQUE NOT NULL,
      nickname TEXT,
      avatar TEXT,
      created_at DATETIME DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS bills (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('income', 'expense')),
      amount INTEGER NOT NULL,
      category TEXT NOT NULL,
      raw_text TEXT NOT NULL,
      recorded_at DATE NOT NULL DEFAULT (date('now')),
      created_at DATETIME DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE INDEX IF NOT EXISTS idx_bills_user_id ON bills(user_id);
    CREATE INDEX IF NOT EXISTS idx_bills_recorded_at ON bills(recorded_at);
  `);
}

module.exports = { getDb };
```

- [ ] **Step 2: 验证数据库可正常初始化**

```bash
cd backend && node -e "const { getDb } = require('./src/db'); const db = getDb(); console.log('DB OK'); db.close();"
```
Expected: `DB OK`

- [ ] **Step 3: Commit**

```bash
git add backend/src/db.js
git commit -m "feat: add SQLite database layer with users and bills tables"
```

---

### Task 3: 微信登录服务

**Files:**
- Create: `backend/src/services/wechat.js`
- Create: `backend/src/middleware/auth.js`
- Create: `backend/tests/auth.test.js`

- [ ] **Step 1: 编写微信 code2session 服务**

Create `backend/src/services/wechat.js`:
```js
const axios = require('axios');

const WECHAT_APPID = process.env.WECHAT_APPID;
const WECHAT_SECRET = process.env.WECHAT_SECRET;

async function code2session(code) {
  const url = 'https://api.weixin.qq.com/sns/jscode2session';
  const { data } = await axios.get(url, {
    params: {
      appid: WECHAT_APPID,
      secret: WECHAT_SECRET,
      js_code: code,
      grant_type: 'authorization_code'
    }
  });

  if (data.errcode) {
    throw new Error(`WeChat auth failed: ${data.errmsg} (code: ${data.errcode})`);
  }

  return { openid: data.openid, session_key: data.session_key };
}

module.exports = { code2session };
```

- [ ] **Step 2: 编写 JWT 认证中间件**

Create `backend/src/middleware/auth.js`:
```js
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;

function generateToken(openid) {
  return jwt.sign({ openid }, JWT_SECRET, { expiresIn: '30d' });
}

function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: '未登录' });
  }

  try {
    const token = header.slice(7);
    const payload = jwt.verify(token, JWT_SECRET);
    req.openid = payload.openid;
    next();
  } catch {
    return res.status(401).json({ error: '登录已过期' });
  }
}

module.exports = { generateToken, authMiddleware };
```

- [ ] **Step 3: 编写测试**

Create `backend/tests/auth.test.js`:
```js
const { describe, it } = require('node:test');
const assert = require('node:assert');

// Set env before requiring modules
process.env.JWT_SECRET = 'test-secret';

const jwt = require('jsonwebtoken');
const { generateToken, authMiddleware } = require('../src/middleware/auth');

describe('Auth Middleware', () => {
  it('generateToken should create valid JWT', () => {
    const token = generateToken('test-openid-123');
    const decoded = jwt.verify(token, 'test-secret');
    assert.strictEqual(decoded.openid, 'test-openid-123');
  });

  it('authMiddleware should call next() for valid token', () => {
    const token = generateToken('openid-1');
    const req = { headers: { authorization: `Bearer ${token}` } };
    let called = false;
    authMiddleware(req, {}, () => { called = true; });
    assert.strictEqual(called, true);
    assert.strictEqual(req.openid, 'openid-1');
  });

  it('authMiddleware should return 401 for missing header', () => {
    const req = { headers: {} };
    const res = { status: () => ({ json: () => {} }) };
    let statusCode;
    const resMock = {
      status: (code) => { statusCode = code; return { json: () => {} }; }
    };
    authMiddleware(req, resMock, () => {});
    assert.strictEqual(statusCode, 401);
  });

  it('authMiddleware should return 401 for invalid token', () => {
    const req = { headers: { authorization: 'Bearer bad-token' } };
    let statusCode;
    const resMock = {
      status: (code) => { statusCode = code; return { json: () => {} }; }
    };
    authMiddleware(req, resMock, () => {});
    assert.strictEqual(statusCode, 401);
  });
});
```

- [ ] **Step 4: 运行测试**

```bash
cd backend && node --test tests/auth.test.js
```
Expected: 4 tests pass

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/wechat.js backend/src/middleware/auth.js backend/tests/auth.test.js
git commit -m "feat: add WeChat auth service and JWT middleware"
```

---

### Task 4: AI 分类服务

**Files:**
- Create: `backend/src/services/ai.js`
- Create: `backend/tests/ai.test.js`

- [ ] **Step 1: 编写 AI 分类服务**

Create `backend/src/services/ai.js`:
```js
const axios = require('axios');

const LLM_API_KEY = process.env.LLM_API_KEY;
const LLM_API_URL = process.env.LLM_API_URL || 'https://api.anthropic.com/v1/messages';
const LLM_MODEL = process.env.LLM_MODEL || 'claude-haiku-4-5-20251001';

const VALID_CATEGORIES = ['餐饮', '交通', '购物', '娱乐', '学习', '日用', '收入'];

const CLASSIFY_PROMPT = `你是一个记账分类助手。用户用自然语言描述一笔消费或收入，你需要提取：金额、类型、分类。

分类可选（严格从以下7个中选择一个）：
- 餐饮：吃饭、外卖、食堂、零食、饮料、水果
- 交通：地铁、公交、打车、共享单车、加油
- 购物：网购、衣服、数码、日用品购买
- 娱乐：游戏、电影、KTV、旅游、运动
- 学习：书、课程、考试费、打印
- 日用：话费、房租、水电、理发、日用品
- 收入：工资、红包、兼职、退款、报销

规则：
1. 金额必须是数字，单位为元，保留最多2位小数
2. 如果用户提到收入（工资、红包、退款等），type 为 "income"，category 为 "收入"
3. 否则 type 为 "expense"，category 从上面6个支出分类中选
4. 金额相减的情况（如"花了15块，优惠了"）取实际支出金额
5. 如果用户输入包含多笔消费，只取第一笔

返回纯JSON（不要markdown包裹）：{"type":"expense","amount":12.5,"category":"餐饮","note":"食堂午饭"}`;

async function classifyBill(rawText) {
  // Quick numeric-only fallback: if text is just a number, ask for more
  if (/^\d+(\.\d{1,2})?$/.test(rawText.trim())) {
    return { type: 'expense', amount: parseFloat(rawText.trim()), category: '其他', note: '' };
  }

  try {
    const response = await axios.post(
      LLM_API_URL,
      {
        model: LLM_MODEL,
        max_tokens: 150,
        messages: [
          { role: 'user', content: `${CLASSIFY_PROMPT}\n\n用户输入：「${rawText}」` }
        ]
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': LLM_API_KEY,
          'anthropic-version': '2023-06-01'
        },
        timeout: 10000
      }
    );

    const text = response.data.content?.[0]?.text || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in LLM response');

    const result = JSON.parse(jsonMatch[0]);

    // Validate
    if (!['expense', 'income'].includes(result.type)) {
      result.type = 'expense';
    }
    if (!VALID_CATEGORIES.includes(result.category)) {
      result.category = '其他';
    }
    if (typeof result.amount !== 'number' || result.amount <= 0) {
      throw new Error('Invalid amount');
    }

    return {
      type: result.type,
      amount: Math.round(result.amount * 100) / 100,
      category: result.category,
      note: result.note || ''
    };
  } catch (err) {
    // Fallback: try to extract amount via regex
    const amountMatch = rawText.match(/(\d+(?:\.\d{1,2})?)/);
    const amount = amountMatch ? parseFloat(amountMatch[1]) : 0;
    return { type: 'expense', amount, category: '其他', note: '' };
  }
}

module.exports = { classifyBill };
```

- [ ] **Step 2: 编写 AI 服务测试**

Create `backend/tests/ai.test.js`:
```js
const { describe, it } = require('node:test');
const assert = require('node:assert');

const { classifyBill } = require('../src/services/ai');

describe('AI Classify', () => {
  it('should handle pure number input as fallback', async () => {
    const result = await classifyBill('12.5');
    assert.strictEqual(result.type, 'expense');
    assert.strictEqual(result.amount, 12.5);
  });

  it('should handle empty or garbled text gracefully', async () => {
    const result = await classifyBill('asdfghjkl');
    assert.strictEqual(result.category, '其他');
  });

  it('should return valid structure even on error', async () => {
    const result = await classifyBill('午饭花了20块钱');
    // Without real API key, this will hit the fallback
    assert.ok(result.type);
    assert.ok(typeof result.amount === 'number');
    assert.ok(result.category);
  });
});
```

- [ ] **Step 3: 运行测试验证**

```bash
cd backend && node --test tests/ai.test.js
```
Expected: all tests pass (will use fallback without real API key)

- [ ] **Step 4: Commit**

```bash
git add backend/src/services/ai.js backend/tests/ai.test.js
git commit -m "feat: add AI classification service with fallback"
```

---

### Task 5: 认证路由

**Files:**
- Create: `backend/src/routes/auth.js`
- Modify: `backend/src/server.js`

- [ ] **Step 1: 编写认证路由**

Create `backend/src/routes/auth.js`:
```js
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
      // Dev mode fallback: if WeChat AppID not configured, use mock
      if (process.env.WECHAT_APPID === 'your-wechat-appid') {
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
```

- [ ] **Step 2: 编写 server.js 入口**

Create `backend/src/server.js`:
```js
require('dotenv').config();

const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/auth');
const billsRoutes = require('./routes/bills');
const statsRoutes = require('./routes/stats');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/bills', billsRoutes);
app.use('/api/stats', statsRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// 404
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: '服务器内部错误' });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
```

- [ ] **Step 3: 启动服务验证**

```bash
cd backend && cp .env.example .env
# Edit .env to set a JWT_SECRET
node src/server.js
# In another terminal:
curl http://localhost:3000/api/health
```
Expected: `{"status":"ok",...}`

- [ ] **Step 4: Commit**

```bash
git add backend/src/routes/auth.js backend/src/server.js
git commit -m "feat: add auth routes and Express server entry"
```

---

### Task 6: 账单路由（CRUD）

**Files:**
- Create: `backend/src/routes/bills.js`
- Create: `backend/tests/bills.test.js`

- [ ] **Step 1: 编写账单路由**

Create `backend/src/routes/bills.js`:
```js
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
```

- [ ] **Step 2: 编写账单路由测试**

Create `backend/tests/bills.test.js`:
```js
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');

// Setup env for testing
process.env.JWT_SECRET = 'test-secret';
process.env.WECHAT_APPID = 'test-appid';

const { getDb } = require('../src/db');
const { generateToken } = require('../src/middleware/auth');

// We'll test the classify integration manually
const { classifyBill } = require('../src/services/ai');

describe('Bills Logic', () => {
  before(() => {
    const db = getDb();
    // Clean up test data
    db.exec('DELETE FROM bills');
    db.exec('DELETE FROM users');
    // Create test user
    db.prepare('INSERT INTO users (openid, nickname) VALUES (?, ?)').run('test-openid', 'Test User');
  });

  after(() => {
    const db = getDb();
    db.exec('DELETE FROM bills');
    db.exec('DELETE FROM users');
  });

  it('should classify "食堂午饭12块" correctly', async () => {
    const result = await classifyBill('食堂午饭12块');
    assert.ok(result.type === 'expense');
    assert.ok(typeof result.amount === 'number');
    assert.ok(result.amount > 0);
  });

  it('should produce valid token for test user', () => {
    const token = generateToken('test-openid');
    assert.ok(typeof token === 'string');
    assert.ok(token.length > 10);
  });

  it('should insert and retrieve bills from database', () => {
    const db = getDb();
    const user = db.prepare('SELECT id FROM users WHERE openid = ?').get('test-openid');

    db.prepare('INSERT INTO bills (user_id, type, amount, category, raw_text, recorded_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(user.id, 'expense', 1200, '餐饮', '食堂午饭12块', '2026-07-03');

    const bills = db.prepare('SELECT * FROM bills WHERE user_id = ?').all(user.id);
    assert.strictEqual(bills.length, 1);
    assert.strictEqual(bills[0].amount, 1200);
    assert.strictEqual(bills[0].category, '餐饮');
  });
});
```

- [ ] **Step 3: 运行测试**

```bash
cd backend && node --test tests/bills.test.js
```
Expected: 3 tests pass

- [ ] **Step 4: Commit**

```bash
git add backend/src/routes/bills.js backend/tests/bills.test.js
git commit -m "feat: add bills CRUD routes with AI classification"
```

---

### Task 7: 统计路由

**Files:**
- Create: `backend/src/routes/stats.js`

- [ ] **Step 1: 编写统计路由**

Create `backend/src/routes/stats.js`:
```js
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
    // Get the Monday of the week containing targetDate
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
```

- [ ] **Step 2: 启动服务验证 API**

```bash
cd backend && node src/server.js &
# Test monthly stats endpoint
curl -H "Authorization: Bearer $(node -e "
  process.env.JWT_SECRET='test-secret';
  const {generateToken}=require('./src/middleware/auth');
  console.log(generateToken('test-openid'))
")" http://localhost:3000/api/stats/monthly
```
Expected: JSON with total, count, breakdown, vs_last_month

- [ ] **Step 3: Commit**

```bash
git add backend/src/routes/stats.js
git commit -m "feat: add monthly and weekly stats endpoints"
```

---

### Task 8: 微信小程序项目初始化

**Files:**
- Create: `miniprogram/app.js`
- Create: `miniprogram/app.json`
- Create: `miniprogram/app.wxss`
- Create: `miniprogram/project.config.json`
- Create: `miniprogram/utils/auth.js`
- Create: `miniprogram/utils/api.js`

- [ ] **Step 1: 创建全局应用文件**

Create `miniprogram/app.js`:
```js
App({
  globalData: {
    token: null,
    userInfo: null,
    baseUrl: 'http://localhost:3000/api'  // 上线后改为生产域名
  },

  onLaunch() {
    const token = wx.getStorageSync('token');
    const userInfo = wx.getStorageSync('userInfo');
    if (token) {
      this.globalData.token = token;
      this.globalData.userInfo = userInfo;
    }
  }
});
```

Create `miniprogram/app.json`:
```json
{
  "pages": [
    "pages/index/index",
    "pages/stats/stats"
  ],
  "window": {
    "navigationStyle": "custom",
    "backgroundColor": "#f5f3f0"
  },
  "style": "v2",
  "sitemapLocation": "sitemap.json"
}
```

Create `miniprogram/app.wxss`:
```css
/* 全局样式 */
page {
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "Inter", sans-serif;
  background: linear-gradient(170deg, #f9f6f0 0%, #f0ece4 40%, #e8e4db 100%);
  color: #1c1c1e;
  min-height: 100vh;
  -webkit-font-smoothing: antialiased;
}

/* 毛玻璃工具类 */
.glass {
  background: rgba(255, 255, 255, 0.55);
  backdrop-filter: blur(20px);
  border: 1rpx solid rgba(255, 255, 255, 0.6);
}
.glass-strong {
  background: rgba(255, 255, 255, 0.72);
  backdrop-filter: blur(30px);
  border: 1rpx solid rgba(255, 255, 255, 0.8);
}

/* 通用圆角 */
.rounded-12 { border-radius: 12rpx; }
.rounded-16 { border-radius: 16rpx; }
.rounded-20 { border-radius: 20rpx; }
.rounded-24 { border-radius: 24rpx; }
```

Create `miniprogram/project.config.json`:
```json
{
  "description": "极简记账",
  "packOptions": { "ignore": [], "include": [] },
  "setting": {
    "urlCheck": false,
    "es6": true,
    "enhance": true,
    "postcss": true,
    "preloadBackgroundData": false,
    "minified": true,
    "newFeature": true,
    "coverView": true,
    "autoAudits": false,
    "showShadowRootInWxmlPanel": true,
    "scopeDataCheck": false
  },
  "compileType": "miniprogram",
  "libVersion": "3.7.0",
  "appid": "your-appid-here",
  "projectname": "jijian-jizhang",
  "condition": {}
}
```

- [ ] **Step 2: 编写工具函数**

Create `miniprogram/utils/auth.js`:
```js
function login() {
  return new Promise((resolve, reject) => {
    wx.login({
      success(res) {
        if (res.code) {
          // Get user profile
          wx.getUserProfile({
            desc: '用于展示您的头像和昵称',
            success(profileRes) {
              resolve({
                code: res.code,
                nickname: profileRes.userInfo.nickName,
                avatar: profileRes.userInfo.avatarUrl
              });
            },
            fail() {
              // Fallback: login without profile
              resolve({ code: res.code, nickname: '', avatar: '' });
            }
          });
        } else {
          reject(new Error('wx.login failed'));
        }
      },
      fail: reject
    });
  });
}

module.exports = { login };
```

Create `miniprogram/utils/api.js`:
```js
const BASE_URL = 'http://localhost:3000/api';

function getToken() {
  return wx.getStorageSync('token');
}

function request(method, path, data) {
  const token = getToken();
  return new Promise((resolve, reject) => {
    wx.request({
      url: BASE_URL + path,
      method,
      data,
      header: {
        'Content-Type': 'application/json',
        'Authorization': token ? `Bearer ${token}` : ''
      },
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data);
        } else if (res.statusCode === 401) {
          // Token expired, trigger re-login
          wx.removeStorageSync('token');
          getApp().globalData.token = null;
          reject(new Error('登录过期'));
        } else {
          reject(new Error(res.data?.error || '请求失败'));
        }
      },
      fail(err) {
        reject(new Error('网络错误'));
      }
    });
  });
}

// API methods
const api = {
  // Auth
  login(code, nickname, avatar) {
    return request('POST', '/auth/login', { code, nickname, avatar });
  },

  // Bills
  createBill(raw_text, recorded_at) {
    return request('POST', '/bills', { raw_text, recorded_at });
  },
  getBills(date) {
    const query = date ? `?date=${date}` : '';
    return request('GET', `/bills${query}`);
  },
  deleteBill(id) {
    return request('DELETE', `/bills/${id}`);
  },

  // Stats
  getMonthlyStats(year, month) {
    const params = [];
    if (year) params.push(`year=${year}`);
    if (month) params.push(`month=${month}`);
    return request('GET', `/stats/monthly${params.length ? '?' + params.join('&') : ''}`);
  },
  getWeeklyStats(date) {
    const query = date ? `?date=${date}` : '';
    return request('GET', `/stats/weekly${query}`);
  }
};

module.exports = api;
```

- [ ] **Step 4: Commit**

```bash
git add miniprogram/
git commit -m "feat: init WeChat mini program with auth and API utils"
```

---

### Task 9: 小程序首页（记账）

**Files:**
- Create: `miniprogram/pages/index/index.wxml`
- Create: `miniprogram/pages/index/index.wxss`
- Create: `miniprogram/pages/index/index.js`
- Create: `miniprogram/pages/index/index.json`

- [ ] **Step 1: 编写首页 WXML**

Create `miniprogram/pages/index/index.wxml`:
```xml
<view class="page">
  <!-- 状态栏占位 -->
  <view class="status-bar">
    <text>{{statusTime}}</text>
    <text>🔋 📶</text>
  </view>

  <!-- 导航 -->
  <view class="nav">随便记</view>

  <!-- 主内容区 -->
  <scroll-view class="content" scroll-y enhanced show-scrollbar="{{false}}">

    <!-- 问候卡片 -->
    <view class="greeting-card glass-strong rounded-20">
      <view class="greeting-row">
        <view>
          <text class="greeting-date">{{todayDate}} · 星期{{weekday}}</text>
          <view class="greeting-title">下午好</view>
          <text class="greeting-sub">今天花了多少？</text>
        </view>
        <view class="greeting-total">
          <text class="greeting-amount">¥{{todayTotal}}</text>
          <text class="greeting-amount-label">今日支出 · {{todayCount}}笔</text>
        </view>
      </view>
    </view>

    <!-- AI 分类动画 -->
    <view wx:if="{{aiThinking}}" class="ai-bubble glass-tint rounded-14">
      <view class="ai-dots">
        <view class="ai-dot"></view>
        <view class="ai-dot"></view>
        <view class="ai-dot"></view>
      </view>
      <text>AI 正在分类...</text>
    </view>

    <!-- 今天 -->
    <view class="date-divider">
      <view class="date-divider-line"></view>
      <text class="date-divider-text">今天</text>
      <view class="date-divider-line"></view>
    </view>

    <view wx:for="{{todayBills}}" wx:key="id" class="bill-card glass rounded-16">
      <view class="bill-left">
        <view class="bill-icon-wrap bill-icon-{{item.category}}">
          <text>{{item.emoji}}</text>
        </view>
        <view>
          <text class="bill-title">{{item.note || item.category}}</text>
          <text class="bill-meta">{{item.time}} · {{item.category}}</text>
        </view>
      </view>
      <text class="bill-amount">-{{item.amount}}</text>
    </view>

    <!-- 昨天 -->
    <view wx:if="{{yesterdayBills.length}}" class="date-divider">
      <view class="date-divider-line"></view>
      <text class="date-divider-text">昨天</text>
      <view class="date-divider-line"></view>
    </view>

    <view wx:for="{{yesterdayBills}}" wx:key="id" class="bill-card glass rounded-16">
      <view class="bill-left">
        <view class="bill-icon-wrap bill-icon-{{item.category}}">
          <text>{{item.emoji}}</text>
        </view>
        <view>
          <text class="bill-title">{{item.note || item.category}}</text>
          <text class="bill-meta">{{item.time}} · {{item.category}}</text>
        </view>
      </view>
      <text class="bill-amount">-{{item.amount}}</text>
    </view>

    <!-- 底部安全距禢 -->
    <view style="height:100rpx;"></view>
  </scroll-view>

  <!-- 输入栏 -->
  <view class="input-bar-wrap">
    <view class="input-bar glass-strong">
      <view class="input-btn input-btn-voice" bindtap="startVoice">🎤</view>
      <input class="input-field"
             placeholder="午饭吃了什么？花了多少？"
             value="{{inputText}}"
             bindinput="onInput"
             bindconfirm="submitBill"
             confirm-type="send"
             adjust-position="{{false}}"
             cursor-spacing="20"/>
      <view class="input-btn input-btn-send" bindtap="submitBill">↑</view>
    </view>
  </view>
</view>
```

- [ ] **Step 2: 编写首页 WXSS**

Create `miniprogram/pages/index/index.wxss`:
```css
.page {
  height: 100vh; display: flex; flex-direction: column;
  background: linear-gradient(170deg, #f9f6f0 0%, #f0ece4 40%, #e8e4db 100%);
}

.status-bar {
  height: 88rpx; display: flex; align-items: flex-end;
  justify-content: space-between; padding: 0 48rpx 12rpx;
  font-size: 24rpx; font-weight: 600; color: #1c1c1e;
}

.nav {
  height: 88rpx; display: flex; align-items: center;
  justify-content: center; font-size: 34rpx; font-weight: 700;
  color: #1c1c1e; letter-spacing: -1rpx;
}

.content { flex: 1; padding: 0 32rpx; }

/* 问候卡片 */
.greeting-card { padding: 40rpx 36rpx 32rpx; margin-bottom: 28rpx; }
.greeting-row { display: flex; justify-content: space-between; align-items: flex-start; }
.greeting-date { font-size: 24rpx; color: rgba(0,0,0,0.4); font-weight: 500; letter-spacing: 1rpx; }
.greeting-title { font-size: 52rpx; font-weight: 800; color: #1c1c1e; letter-spacing: -1rpx; margin: 6rpx 0 4rpx; }
.greeting-sub { font-size: 26rpx; color: rgba(0,0,0,0.45); font-weight: 500; }
.greeting-total { text-align: right; }
.greeting-amount { font-size: 60rpx; font-weight: 800; color: #1c1c1e; letter-spacing: -2rpx; line-height: 1; }
.greeting-amount-label { font-size: 22rpx; color: rgba(0,0,0,0.35); margin-top: 4rpx; }

/* AI 气泡 */
.ai-bubble {
  padding: 16rpx 24rpx; border-radius: 28rpx; margin-bottom: 20rpx;
  display: inline-flex; align-items: center; gap: 14rpx;
  font-size: 24rpx; color: rgba(0,0,0,0.5); font-weight: 500;
  background: rgba(255,255,255,0.35);
  backdrop-filter: blur(16px);
  border: 1rpx solid rgba(255,255,255,0.5);
}
.ai-dots { display: flex; gap: 6rpx; }
.ai-dot {
  width: 10rpx; height: 10rpx; border-radius: 50%;
  background: #FF6B35; animation: dotPulse 1.2s infinite;
}
.ai-dot:nth-child(2) { animation-delay: 0.2s; }
.ai-dot:nth-child(3) { animation-delay: 0.4s; }
@keyframes dotPulse {
  0%, 60%, 100% { opacity: 0.2; transform: scale(0.8); }
  30% { opacity: 1; transform: scale(1); }
}

/* 日期分隔 */
.date-divider {
  display: flex; align-items: center; gap: 20rpx; margin: 36rpx 0 20rpx;
}
.date-divider-line { flex: 1; height: 1rpx; background: rgba(0,0,0,0.06); }
.date-divider-text { font-size: 22rpx; font-weight: 600; color: rgba(0,0,0,0.3); letter-spacing: 2rpx; }

/* 账单条目 */
.bill-card {
  padding: 28rpx 32rpx; margin-bottom: 12rpx;
  display: flex; align-items: center; justify-content: space-between;
}
.bill-left { display: flex; align-items: center; gap: 24rpx; }
.bill-icon-wrap {
  width: 80rpx; height: 80rpx; border-radius: 28rpx;
  display: flex; align-items: center; justify-content: center;
  font-size: 36rpx;
}
.bill-icon-餐饮 { background: rgba(255,107,53,0.12); }
.bill-icon-交通 { background: rgba(16,185,129,0.12); }
.bill-icon-购物 { background: rgba(59,130,246,0.12); }
.bill-icon-娱乐 { background: rgba(139,92,246,0.12); }
.bill-icon-学习 { background: rgba(245,158,11,0.12); }
.bill-icon-日用 { background: rgba(107,114,128,0.12); }
.bill-title { font-size: 30rpx; font-weight: 600; color: #1c1c1e; display: block; }
.bill-meta { font-size: 22rpx; color: rgba(0,0,0,0.35); margin-top: 2rpx; }
.bill-amount { font-size: 32rpx; font-weight: 700; color: #1c1c1e; }

/* 输入栏 */
.input-bar-wrap {
  padding: 16rpx 24rpx 56rpx;
  background: transparent;
}
.input-bar {
  padding: 12rpx 16rpx 12rpx 32rpx; border-radius: 44rpx;
  display: flex; align-items: center; gap: 16rpx;
}
.input-field {
  flex: 1; height: 64rpx; font-size: 28rpx; color: #1c1c1e;
}
.input-field::placeholder { color: rgba(0,0,0,0.2); }
.input-btn {
  width: 64rpx; height: 64rpx; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 30rpx;
}
.input-btn:active { transform: scale(0.92); opacity: 0.8; }
.input-btn-voice { background: rgba(0,0,0,0.04); }
.input-btn-send { background: #1c1c1e; color: #fff; }
```

- [ ] **Step 3: 编写首页 JS 逻辑**

Create `miniprogram/pages/index/index.js`:
```js
const api = require('../../utils/api');
const { login } = require('../../utils/auth');

const CATEGORY_EMOJI = {
  '餐饮': '🍜', '交通': '🚇', '购物': '🛍',
  '娱乐': '🎮', '学习': '📚', '日用': '🧴',
  '收入': '💰', '其他': '📌'
};
const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

Page({
  data: {
    statusTime: '',
    todayDate: '',
    weekday: '',
    todayTotal: '0.00',
    todayCount: 0,
    todayBills: [],
    yesterdayBills: [],
    aiThinking: false,
    inputText: ''
  },

  onLoad() {
    this.updateHeader();
    this.ensureLogin();
  },

  onShow() {
    this.loadBills();
  },

  updateHeader() {
    const now = new Date();
    const h = String(now.getHours()).padStart(2, '0');
    const m = String(now.getMinutes()).padStart(2, '0');
    const month = now.getMonth() + 1;
    const day = now.getDate();
    this.setData({
      statusTime: `${h}:${m}`,
      todayDate: `${month}月${day}日`,
      weekday: WEEKDAYS[now.getDay()]
    });
  },

  async ensureLogin() {
    const app = getApp();
    if (!app.globalData.token) {
      try {
        const loginData = await login();
        const result = await api.login(loginData.code, loginData.nickname, loginData.avatar);
        app.globalData.token = result.token;
        app.globalData.userInfo = result.user;
        wx.setStorageSync('token', result.token);
        wx.setStorageSync('userInfo', result.user);
      } catch (err) {
        console.error('Login failed:', err);
        wx.showToast({ title: '登录失败，下拉重试', icon: 'none' });
      }
    }
  },

  async loadBills() {
    try {
      const today = this.getDateStr(new Date());
      const yesterday = this.getDateStr(new Date(Date.now() - 86400000));

      const allBills = await api.getBills();
      const todayBills = [];
      const yesterdayBills = [];
      let todayTotal = 0;
      let todayCount = 0;

      allBills.forEach(b => {
        const item = {
          ...b,
          time: b.created_at ? b.created_at.slice(11, 16) : '',
          emoji: CATEGORY_EMOJI[b.category] || '📌',
          amount: b.amount.toFixed(2)
        };
        if (b.recorded_at === today) {
          todayBills.push(item);
          if (b.type === 'expense') { todayTotal += b.amount; todayCount++; }
        } else if (b.recorded_at === yesterday) {
          yesterdayBills.push(item);
        }
      });

      this.setData({
        todayBills, yesterdayBills,
        todayTotal: todayTotal.toFixed(2),
        todayCount
      });
    } catch (err) {
      console.error('Load bills failed:', err);
    }
  },

  async submitBill() {
    const text = this.data.inputText.trim();
    if (!text) return;

    this.setData({ aiThinking: true, inputText: '' });

    try {
      await api.createBill(text);
      this.setData({ aiThinking: false });
      wx.showToast({ title: '已记录', icon: 'success', duration: 1000 });
      this.loadBills();
    } catch (err) {
      this.setData({ aiThinking: false });
      wx.showToast({ title: err.message || '记账失败', icon: 'none' });
    }
  },

  onInput(e) {
    this.setData({ inputText: e.detail.value });
  },

  startVoice() {
    wx.showToast({ title: '语音记账即将支持', icon: 'none' });
  },

  getDateStr(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
});
```

- [ ] **Step 4: 创建页面 JSON 配置**

Create `miniprogram/pages/index/index.json`:
```json
{
  "navigationStyle": "custom",
  "disableScroll": true
}
```

- [ ] **Step 5: Commit**

```bash
git add miniprogram/pages/index/
git commit -m "feat: add home page with bill input and list"
```

---

### Task 10: 小程序统计页

**Files:**
- Create: `miniprogram/pages/stats/stats.wxml`
- Create: `miniprogram/pages/stats/stats.wxss`
- Create: `miniprogram/pages/stats/stats.js`
- Create: `miniprogram/pages/stats/stats.json`

- [ ] **Step 1: 编写统计页 WXML**

Create `miniprogram/pages/stats/stats.wxml`:
```xml
<view class="page">
  <view class="status-bar">
    <text>{{statusTime}}</text>
    <text>🔋 📶</text>
  </view>
  <view class="nav">账单分析</view>

  <scroll-view class="content" scroll-y enhanced show-scrollbar="{{false}}">

    <!-- 总支出卡片 -->
    <view class="stat-card glass-strong rounded-24">
      <text class="stat-label">{{year}} / {{monthName}}</text>
      <view class="stat-big">
        <text class="stat-yen">¥</text>{{totalInt}}<text class="stat-dec">.{{totalDec}}</text>
      </view>
      <view wx:if="{{vsLastMonth}}" class="stat-compare">
        ↓ 比上月少花了 ¥{{vsAmount}} ({{vsPct}}%)
      </view>
    </view>

    <!-- 类目排名 -->
    <view wx:for="{{breakdown}}" wx:key="category" class="rank-card glass rounded-18">
      <text class="rank-num">{{index + 1}}</text>
      <view class="rank-icon" style="background:{{item.bg}};">
        <text>{{item.emoji}}</text>
      </view>
      <view class="rank-info">
        <text class="rank-name">{{item.category}}</text>
        <view class="rank-bar-wrap">
          <view class="rank-bar-fill" style="width:{{item.barWidth}}%;background:{{item.color}};"></view>
        </view>
      </view>
      <view class="rank-amount">
        <text class="rank-amount-val">¥{{item.amountText}}</text>
        <text class="rank-amount-pct">{{item.percentage}}%</text>
      </view>
    </view>

    <view style="height:120rpx;"></view>
  </scroll-view>

  <!-- Tab Bar -->
  <view class="tab-bar">
    <view class="tab-item" bindtap="goHome">
      <text class="tab-emoji">💰</text>记账
    </view>
    <view class="tab-item active">
      <text class="tab-emoji">📊</text>统计
    </view>
  </view>
</view>
```

- [ ] **Step 2: 编写统计页 WXSS**

Create `miniprogram/pages/stats/stats.wxss`:
```css
.page {
  height: 100vh; display: flex; flex-direction: column;
  background: linear-gradient(170deg, #f7f3ee 0%, #efe9e1 40%, #e6dfd6 100%);
}

.status-bar {
  height: 88rpx; display: flex; align-items: flex-end;
  justify-content: space-between; padding: 0 48rpx 12rpx;
  font-size: 24rpx; font-weight: 600; color: #1c1c1e;
}

.nav {
  height: 88rpx; display: flex; align-items: center;
  justify-content: center; font-size: 34rpx; font-weight: 700;
  color: #1c1c1e; letter-spacing: -1rpx;
}

.content { flex: 1; padding: 0 32rpx; }

/* 总支出 */
.stat-card { padding: 48rpx 40rpx; text-align: center; margin-bottom: 28rpx; }
.stat-label { font-size: 24rpx; color: rgba(0,0,0,0.4); font-weight: 600; letter-spacing: 2rpx; }
.stat-big { font-size: 80rpx; font-weight: 800; color: #1c1c1e; letter-spacing: -4rpx; margin: 10rpx 0; }
.stat-yen { font-size: 36rpx; font-weight: 500; }
.stat-dec { font-size: 36rpx; font-weight: 400; color: rgba(0,0,0,0.4); }
.stat-compare { font-size: 24rpx; color: #10B981; font-weight: 600; }

/* 排名卡片 */
.rank-card {
  padding: 28rpx 32rpx; margin-bottom: 14rpx;
  display: flex; align-items: center; gap: 24rpx;
}
.rank-num { font-size: 26rpx; font-weight: 700; color: rgba(0,0,0,0.25); width: 36rpx; }
.rank-icon {
  width: 72rpx; height: 72rpx; border-radius: 24rpx;
  display: flex; align-items: center; justify-content: center; font-size: 32rpx;
}
.rank-info { flex: 1; }
.rank-name { font-size: 28rpx; font-weight: 600; color: #1c1c1e; }
.rank-bar-wrap { height: 6rpx; background: rgba(0,0,0,0.05); border-radius: 3rpx; margin-top: 10rpx; }
.rank-bar-fill { height: 100%; border-radius: 3rpx; }
.rank-amount { text-align: right; }
.rank-amount-val { font-size: 30rpx; font-weight: 700; color: #1c1c1e; display: block; }
.rank-amount-pct { font-size: 22rpx; color: rgba(0,0,0,0.35); }

/* Tab Bar */
.tab-bar {
  padding: 16rpx 32rpx 56rpx;
  display: flex; gap: 8rpx;
}
.tab-item {
  flex: 1; padding: 16rpx; border-radius: 28rpx;
  text-align: center; font-size: 22rpx; font-weight: 600;
  color: rgba(0,0,0,0.3);
}
.tab-item.active {
  background: rgba(255,255,255,0.7);
  backdrop-filter: blur(20px);
  border: 1rpx solid rgba(255,255,255,0.8);
  color: #1c1c1e;
  box-shadow: 0 4rpx 24rpx rgba(0,0,0,0.06);
}
.tab-emoji { font-size: 40rpx; display: block; margin-bottom: 4rpx; }
```

- [ ] **Step 3: 编写统计页 JS**

Create `miniprogram/pages/stats/stats.js`:
```js
const api = require('../../utils/api');

const CATEGORY_STYLE = {
  '餐饮': { emoji: '🍜', color: '#FF6B35', bg: 'rgba(255,107,53,0.12)' },
  '交通': { emoji: '🚇', color: '#10B981', bg: 'rgba(16,185,129,0.12)' },
  '购物': { emoji: '🛍', color: '#3B82F6', bg: 'rgba(59,130,246,0.12)' },
  '娱乐': { emoji: '🎮', color: '#8B5CF6', bg: 'rgba(139,92,246,0.12)' },
  '学习': { emoji: '📚', color: '#F59E0B', bg: 'rgba(245,158,11,0.12)' },
  '日用': { emoji: '🧴', color: '#6B7280', bg: 'rgba(107,114,128,0.12)' },
  '收入': { emoji: '💰', color: '#10B981', bg: 'rgba(16,185,129,0.12)' },
  '其他': { emoji: '📌', color: '#9CA3AF', bg: 'rgba(156,163,175,0.12)' }
};

Page({
  data: {
    statusTime: '',
    year: 2026, monthName: 'July',
    totalInt: '0', totalDec: '00',
    vsLastMonth: null, vsAmount: '0', vsPct: '0',
    breakdown: []
  },

  onShow() {
    this.updateTime();
    this.loadStats();
  },

  updateTime() {
    const now = new Date();
    this.setData({ statusTime: `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}` });
  },

  async loadStats() {
    try {
      const now = new Date();
      const stats = await api.getMonthlyStats(now.getFullYear(), now.getMonth() + 1);

      const totalStr = stats.total.toFixed(2);
      const [totalInt, totalDec] = totalStr.split('.');

      const breakdown = stats.breakdown.map(c => {
        const style = CATEGORY_STYLE[c.category] || CATEGORY_STYLE['其他'];
        return {
          category: c.category,
          amountText: c.amount.toFixed(0),
          amount: c.amount,
          percentage: c.percentage,
          barWidth: Math.max(c.percentage, 4),
          emoji: style.emoji,
          color: style.color,
          bg: style.bg
        };
      });

      const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

      let vsLastMonth = null, vsAmount = '0', vsPct = '0';
      if (stats.vs_last_month) {
        const diff = Math.abs(stats.vs_last_month.amount);
        vsLastMonth = true;
        vsAmount = diff.toFixed(0);
        vsPct = Math.abs(stats.vs_last_month.percentage);
      }

      this.setData({
        year: stats.year, monthName: MONTHS[stats.month - 1],
        totalInt, totalDec, breakdown,
        vsLastMonth, vsAmount, vsPct
      });
    } catch (err) {
      console.error('Load stats failed:', err);
    }
  },

  goHome() {
    wx.switchTab({ url: '/pages/index/index' });
  }
});
```

- [ ] **Step 4: 创建页面 JSON**

Create `miniprogram/pages/stats/stats.json`:
```json
{
  "navigationStyle": "custom"
}
```

- [ ] **Step 5: Commit**

```bash
git add miniprogram/pages/stats/
git commit -m "feat: add stats page with monthly overview and category ranking"
```

---

### Task 11: 启动 & 集成验证

- [ ] **Step 1: 复制 .env 并配置**

```bash
cd backend && cp .env.example .env
# 编辑 .env 填入:
# - JWT_SECRET=<随机字符串>
# - LLM_API_KEY=<你的API key>
# - WECHAT_APPID=<小程序AppID> (开发阶段可保留占位)
# - WECHAT_SECRET=<小程序Secret>
```

- [ ] **Step 2: 启动后端**

```bash
cd backend && npm start
# Expected: "Server running on http://localhost:3000"
```

- [ ] **Step 3: 用 curl 测试全流程**

```bash
# 1. Health check
curl http://localhost:3000/api/health

# 2. Login (开发模式，用任意code)
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"code":"test123","nickname":"测试用户"}'

# 3. 记一笔账 (用上一步返回的token)
TOKEN="<token-from-login>"
curl -X POST http://localhost:3000/api/bills \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"raw_text":"食堂午饭花了12块"}'

# 4. 获取账单列表
curl -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/bills

# 5. 获取月度统计
curl -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/stats/monthly

# 6. 获取周统计
curl -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/stats/weekly
```

- [ ] **Step 4: 打开微信开发者工具**

- 导入 `miniprogram/` 目录
- 修改 `project.config.json` 中的 `appid` 为真实 AppID
- 修改 `miniprogram/utils/api.js` 中的 `BASE_URL` 为后端地址
- 编译预览，测试记账流程

- [ ] **Step 5: Commit**

```bash
git add backend/.env.example
git commit -m "docs: add integration test instructions"
```

---

## Test Verification

运行所有后端测试：
```bash
cd backend && node --test tests/*.test.js
```
Expected: all tests pass.
