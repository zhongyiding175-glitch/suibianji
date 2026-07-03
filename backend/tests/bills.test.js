const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');

// Setup env for testing
process.env.JWT_SECRET = 'test-secret';
process.env.WECHAT_APPID = 'test-appid';

const { getDb } = require('../src/db');
const { generateToken } = require('../src/middleware/auth');

const { classifyBill } = require('../src/services/ai');

describe('Bills Logic', () => {
  before(() => {
    const db = getDb();
    db.exec('DELETE FROM bills');
    db.exec('DELETE FROM users');
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
