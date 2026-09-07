const jwt = require('jsonwebtoken');
const { getDb } = require('../database');

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ code: 401, message: '未登录，请先登录' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const db = getDb();
    const user = db.prepare('SELECT id, uid, email, nickname, avatar, level, exp, role, status, email_verified FROM users WHERE id = ?').get(decoded.userId);

    if (!user) {
      return res.status(401).json({ code: 401, message: '用户不存在' });
    }

    if (user.status === 'banned') {
      return res.status(403).json({ code: 403, message: '账号已被封禁' });
    }

    if (user.status === 'muted') {
      req.userMuted = true;
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ code: 401, message: '登录已过期，请重新登录' });
  }
}

function adminMiddleware(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ code: 401, message: '未登录' });
  }

  const adminRoles = ['super_admin', 'admin', 'senior_admin', 'content_admin', 'software_admin'];
  if (!adminRoles.includes(req.user.role)) {
    return res.status(403).json({ code: 403, message: '权限不足，需要管理员身份' });
  }

  next();
}

function superAdminMiddleware(req, res, next) {
  if (!req.user || req.user.role !== 'super_admin') {
    return res.status(403).json({ code: 403, message: '权限不足，需要超级管理员身份' });
  }
  next();
}

function optionalAuthMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const db = getDb();
      const user = db.prepare('SELECT id, uid, email, nickname, avatar, level, exp, role, status FROM users WHERE id = ?').get(decoded.userId);
      if (user && user.status === 'active') {
        req.user = user;
      }
    } catch (error) {
      // 忽略错误，继续作为未登录用户
    }
  }
  next();
}

module.exports = {
  authMiddleware,
  adminMiddleware,
  superAdminMiddleware,
  optionalAuthMiddleware,
};
