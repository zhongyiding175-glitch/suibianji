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
