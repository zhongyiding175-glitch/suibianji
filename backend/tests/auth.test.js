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
