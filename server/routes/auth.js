const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getDb } = require('../database');
const { sendVerificationCode, sendPasswordResetEmail } = require('../emailService');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// 生成验证码
function generateCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

// 生成UID
function generateUid() {
  return 'YY' + String(Date.now()).slice(-6) + String(Math.floor(Math.random() * 100)).padStart(2, '0');
}

// 发送验证码
router.post('/send-code', async (req, res) => {
  const { email, type = 'register' } = req.body;

  if (!email) {
    return res.status(400).json({ code: 400, message: '请输入邮箱' });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ code: 400, message: '邮箱格式不正确' });
  }

  const db = getDb();
  const normalizedEmail = email.toLowerCase().trim();

  // 检查是否60秒内已发送
  const recentCode = db.prepare(`
    SELECT created_at FROM email_verification_codes 
    WHERE email = ? AND type = ? 
    ORDER BY created_at DESC LIMIT 1
  `).get(normalizedEmail, type);

  if (recentCode) {
    const timeDiff = Date.now() - new Date(recentCode.created_at).getTime();
    if (timeDiff < 60000) {
      const waitTime = Math.ceil((60000 - timeDiff) / 1000);
      return res.status(429).json({ code: 429, message: `发送太频繁，请${waitTime}秒后重试` });
    }
  }

  // 注册时检查邮箱是否已存在
  if (type === 'register') {
    const existingUser = db.prepare('SELECT id FROM users WHERE email = ?').get(normalizedEmail);
    if (existingUser) {
      return res.status(409).json({ code: 409, message: '该邮箱已经注册，请直接登录' });
    }
  }

  // 重置密码时检查邮箱是否存在
  if (type === 'reset') {
    const existingUser = db.prepare('SELECT id FROM users WHERE email = ?').get(normalizedEmail);
    if (!existingUser) {
      return res.status(404).json({ code: 404, message: '该邮箱未注册' });
    }
  }

  const code = generateCode();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

  db.prepare(`
    INSERT INTO email_verification_codes (email, code, type, expires_at)
    VALUES (?, ?, ?, ?)
  `).run(normalizedEmail, code, type, expiresAt);

  const sent = await sendVerificationCode(normalizedEmail, code, type);

  if (sent) {
    res.json({ code: 200, message: '验证码已发送，请查收邮箱', data: { expireSeconds: 300 } });
  } else {
    res.status(500).json({ code: 500, message: '验证码发送失败，请稍后重试' });
  }
});

// 验证验证码
router.post('/verify-code', (req, res) => {
  const { email, code, type = 'register' } = req.body;

  if (!email || !code) {
    return res.status(400).json({ code: 400, message: '请输入邮箱和验证码' });
  }

  const db = getDb();
  const normalizedEmail = email.toLowerCase().trim();

  const verification = db.prepare(`
    SELECT * FROM email_verification_codes 
    WHERE email = ? AND type = ? AND used = 0
    ORDER BY created_at DESC LIMIT 1
  `).get(normalizedEmail, type);

  if (!verification) {
    return res.status(400).json({ code: 400, message: '请先获取验证码' });
  }

  if (new Date(verification.expires_at) < new Date()) {
    return res.status(400).json({ code: 400, message: '验证码已过期，请重新获取' });
  }

  if (verification.attempts >= 5) {
    return res.status(400).json({ code: 400, message: '验证次数过多，请重新获取验证码' });
  }

  if (verification.code !== code) {
    db.prepare('UPDATE email_verification_codes SET attempts = attempts + 1 WHERE id = ?').run(verification.id);
    return res.status(400).json({ code: 400, message: '验证码错误' });
  }

  res.json({ code: 200, message: '验证成功' });
});

// 注册
router.post('/register', (req, res) => {
  const { email, code, nickname, password, confirmPassword } = req.body;

  if (!email || !code || !nickname || !password || !confirmPassword) {
    return res.status(400).json({ code: 400, message: '请填写完整信息' });
  }

  if (password !== confirmPassword) {
    return res.status(400).json({ code: 400, message: '两次密码不一致' });
  }

  if (password.length < 6) {
    return res.status(400).json({ code: 400, message: '密码至少6位' });
  }

  if (nickname.length < 2 || nickname.length > 20) {
    return res.status(400).json({ code: 400, message: '昵称长度2-20个字符' });
  }

  const db = getDb();
  const normalizedEmail = email.toLowerCase().trim();

  // 验证邮箱唯一性
  const existingEmail = db.prepare('SELECT id FROM users WHERE email = ?').get(normalizedEmail);
  if (existingEmail) {
    return res.status(409).json({ code: 409, message: '该邮箱已经注册，请直接登录' });
  }

  // 验证昵称唯一性
  const existingNickname = db.prepare('SELECT id FROM users WHERE nickname = ?').get(nickname);
  if (existingNickname) {
    return res.status(409).json({ code: 409, message: '该昵称已被使用，请换一个昵称' });
  }

  // 验证验证码
  const verification = db.prepare(`
    SELECT * FROM email_verification_codes 
    WHERE email = ? AND type = 'register' AND used = 0
    ORDER BY created_at DESC LIMIT 1
  `).get(normalizedEmail);

  if (!verification || verification.code !== code) {
    return res.status(400).json({ code: 400, message: '验证码错误或已过期' });
  }

  if (new Date(verification.expires_at) < new Date()) {
    return res.status(400).json({ code: 400, message: '验证码已过期，请重新获取' });
  }

  // 创建用户
  const hashedPassword = bcrypt.hashSync(password, 10);
  const uid = generateUid();

  const result = db.prepare(`
    INSERT INTO users (uid, email, password, nickname, level, exp, role, email_verified, status)
    VALUES (?, ?, ?, ?, 1, 0, 'user', 1, 'active')
  `).run(uid, normalizedEmail, hashedPassword, nickname);

  // 标记验证码已使用
  db.prepare('UPDATE email_verification_codes SET used = 1 WHERE id = ?').run(verification.id);

  // 发送欢迎消息
  db.prepare(`
    INSERT INTO messages (user_id, type, title, content)
    VALUES (?, 'system', '欢迎加入云屿', ?)
  `).run(result.lastInsertRowid, `欢迎来到云屿！你是第${result.lastInsertRowid}位云屿居民。在这里发现优质软件、交流使用心得、结识志同道合的朋友。`);

  // 生成token
  const token = jwt.sign({ userId: result.lastInsertRowid }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });

  const user = db.prepare('SELECT id, uid, email, nickname, avatar, level, exp, role FROM users WHERE id = ?').get(result.lastInsertRowid);

  res.json({
    code: 200,
    message: '注册成功',
    data: {
      token,
      user,
    },
  });
});

// 登录
router.post('/login', (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ code: 400, message: '请输入邮箱和密码' });
  }

  const db = getDb();
  const normalizedEmail = email.toLowerCase().trim();

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(normalizedEmail);

  if (!user) {
    return res.status(404).json({ code: 404, message: '该邮箱未注册' });
  }

  const isPasswordValid = bcrypt.compareSync(password, user.password);
  if (!isPasswordValid) {
    return res.status(401).json({ code: 401, message: '密码错误' });
  }

  if (user.status === 'banned') {
    return res.status(403).json({ code: 403, message: '账号已被封禁，请联系管理员' });
  }

  // 生成token
  const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });

  // 记录登录会话
  db.prepare(`
    INSERT INTO login_sessions (user_id, token, device, ip, expires_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(user.id, token, req.headers['user-agent'] || '', req.ip || '', new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString());

  const { password: _, ...userWithoutPassword } = user;

  res.json({
    code: 200,
    message: '登录成功',
    data: {
      token,
      user: userWithoutPassword,
    },
  });
});

// 重置密码 - 发送验证码
router.post('/reset-password/send-code', async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ code: 400, message: '请输入邮箱' });
  }

  const db = getDb();
  const normalizedEmail = email.toLowerCase().trim();
  const user = db.prepare('SELECT id FROM users WHERE email = ?').get(normalizedEmail);
  if (!user) {
    return res.status(404).json({ code: 404, message: '该邮箱未注册' });
  }

  const code = generateCode();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

  db.prepare(`
    INSERT INTO email_verification_codes (email, code, type, expires_at)
    VALUES (?, ?, 'reset', ?)
  `).run(normalizedEmail, code, expiresAt);

  const sent = await sendVerificationCode(normalizedEmail, code, 'reset');

  if (sent) {
    res.json({ code: 200, message: '验证码已发送，请查收邮箱' });
  } else {
    res.status(500).json({ code: 500, message: '验证码发送失败，请稍后重试' });
  }
});

// 重置密码
router.post('/reset-password', (req, res) => {
  const { email, code, newPassword, confirmPassword } = req.body;

  if (!email || !code || !newPassword || !confirmPassword) {
    return res.status(400).json({ code: 400, message: '请填写完整信息' });
  }

  if (newPassword !== confirmPassword) {
    return res.status(400).json({ code: 400, message: '两次密码不一致' });
  }

  if (newPassword.length < 6) {
    return res.status(400).json({ code: 400, message: '密码至少6位' });
  }

  const db = getDb();
  const normalizedEmail = email.toLowerCase().trim();

  // 验证验证码
  const verification = db.prepare(`
    SELECT * FROM email_verification_codes 
    WHERE email = ? AND type = 'reset' AND used = 0
    ORDER BY created_at DESC LIMIT 1
  `).get(normalizedEmail);

  if (!verification || verification.code !== code) {
    return res.status(400).json({ code: 400, message: '验证码错误或已过期' });
  }

  if (new Date(verification.expires_at) < new Date()) {
    return res.status(400).json({ code: 400, message: '验证码已过期，请重新获取' });
  }

  const user = db.prepare('SELECT id FROM users WHERE email = ?').get(normalizedEmail);
  if (!user) {
    return res.status(404).json({ code: 404, message: '用户不存在' });
  }

  const hashedPassword = bcrypt.hashSync(newPassword, 10);
  db.prepare('UPDATE users SET password = ?, updated_at = datetime("now", "localtime") WHERE id = ?')
    .run(hashedPassword, user.id);

  db.prepare('UPDATE email_verification_codes SET used = 1 WHERE id = ?').run(verification.id);

  // 发送消息通知
  db.prepare(`
    INSERT INTO messages (user_id, type, title, content)
    VALUES (?, 'system', '密码已重置', '您的云屿账号密码已成功重置。如果不是您本人操作，请立即联系管理员。')
  `).run(user.id);

  res.json({ code: 200, message: '密码重置成功，请使用新密码登录' });
});

// 修改密码
router.post('/change-password', authMiddleware, (req, res) => {
  const { oldPassword, newPassword, confirmPassword } = req.body;

  if (!oldPassword || !newPassword || !confirmPassword) {
    return res.status(400).json({ code: 400, message: '请填写完整信息' });
  }

  if (newPassword !== confirmPassword) {
    return res.status(400).json({ code: 400, message: '两次新密码不一致' });
  }

  if (newPassword.length < 6) {
    return res.status(400).json({ code: 400, message: '新密码至少6位' });
  }

  const db = getDb();
  const user = db.prepare('SELECT password FROM users WHERE id = ?').get(req.user.id);

  const isOldPasswordValid = bcrypt.compareSync(oldPassword, user.password);
  if (!isOldPasswordValid) {
    return res.status(400).json({ code: 400, message: '原密码错误' });
  }

  const hashedPassword = bcrypt.hashSync(newPassword, 10);
  db.prepare('UPDATE users SET password = ?, updated_at = datetime("now", "localtime") WHERE id = ?')
    .run(hashedPassword, req.user.id);

  res.json({ code: 200, message: '密码修改成功' });
});

// 登出
router.post('/logout', authMiddleware, (req, res) => {
  const token = req.headers.authorization.split(' ')[1];
  const db = getDb();
  db.prepare('DELETE FROM login_sessions WHERE token = ?').run(token);
  res.json({ code: 200, message: '已退出登录' });
});

// 获取当前用户信息
router.get('/me', authMiddleware, (req, res) => {
  const db = getDb();
  const user = db.prepare(`
    SELECT id, uid, email, nickname, avatar, signature, level, exp, 
           continuous_checkin, total_checkin, likes_received, posts_count, 
           comments_count, favorites_count, followers_count, following_count,
           role, status, email_verified, created_at
    FROM users WHERE id = ?
  `).get(req.user.id);

  // 计算今日是否已签到
  const today = new Date().toISOString().split('T')[0];
  const todayCheckin = db.prepare('SELECT id FROM checkin_records WHERE user_id = ? AND checkin_date = ?').get(req.user.id, today);

  res.json({
    code: 200,
    data: {
      ...user,
      today_checked_in: !!todayCheckin,
    },
  });
});

module.exports = router;
