const express = require('express');
const { getDb } = require('../database');
const { authMiddleware, adminMiddleware, superAdminMiddleware } = require('../middleware/auth');
const bcrypt = require('bcryptjs');

const router = express.Router();

// 管理员Dashboard统计
router.get('/dashboard', adminMiddleware, (req, res) => {
  const db = getDb();

  const totalUsers = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
  const todayUsers = db.prepare("SELECT COUNT(*) as count FROM users WHERE date(created_at) = date('now', 'localtime')").get().count;
  const totalPosts = db.prepare('SELECT COUNT(*) as count FROM posts').get().count;
  const todayPosts = db.prepare("SELECT COUNT(*) as count FROM posts WHERE date(created_at) = date('now', 'localtime')").get().count;
  const totalSoftwares = db.prepare('SELECT COUNT(*) as count FROM softwares WHERE is_hidden = 0').get().count;
  const totalDownloads = db.prepare('SELECT SUM(download_count) as total FROM softwares').get().total || 0;
  const todayCheckins = db.prepare("SELECT COUNT(DISTINCT user_id) as count FROM checkin_records WHERE checkin_date = date('now', 'localtime')").get().count;
  const pendingReports = db.prepare("SELECT COUNT(*) as count FROM reports WHERE status = 'pending'").get().count;
  const pendingContent = db.prepare("SELECT COUNT(*) as count FROM posts WHERE status = 'pending'").get().count;
  const activeUsers = db.prepare("SELECT COUNT(DISTINCT user_id) as count FROM login_sessions WHERE date(created_at) = date('now', 'localtime')").get().count;

  // 最近7天用户增长
  const userGrowth = db.prepare(`
    SELECT date(created_at) as date, COUNT(*) as count
    FROM users
    WHERE created_at >= date('now', '-7 days', 'localtime')
    GROUP BY date(created_at)
    ORDER BY date
  `).all();

  // 最近7天帖子增长
  const postGrowth = db.prepare(`
    SELECT date(created_at) as date, COUNT(*) as count
    FROM posts
    WHERE created_at >= date('now', '-7 days', 'localtime')
    GROUP BY date(created_at)
    ORDER BY date
  `).all();

  // 最近活动
  const recentActivities = db.prepare(`
    SELECT o.*, u.nickname as admin_name
    FROM operation_logs o
    JOIN users u ON o.admin_id = u.id
    ORDER BY o.created_at DESC
    LIMIT 10
  `).all();

  res.json({
    code: 200,
    data: {
      total_users: totalUsers,
      today_users: todayUsers,
      total_posts,
      today_posts,
      total_softwares: totalSoftwares,
      total_downloads: totalDownloads,
      today_checkins: todayCheckins,
      pending_reports: pendingReports,
      pending_content: pendingContent,
      active_users: activeUsers,
      user_growth: userGrowth,
      post_growth: postGrowth,
      recent_activities: recentActivities,
    },
  });
});

// 用户管理 - 列表
router.get('/users', adminMiddleware, (req, res) => {
  const { page = 1, limit = 20, keyword, status, role } = req.query;
  const db = getDb();
  const offset = (page - 1) * limit;

  let whereClause = 'WHERE 1=1';
  const params = [];

  if (keyword) {
    whereClause += ' AND (nickname LIKE ? OR email LIKE ? OR uid LIKE ?)';
    params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
  }

  if (status) {
    whereClause += ' AND status = ?';
    params.push(status);
  }

  if (role) {
    whereClause += ' AND role = ?';
    params.push(role);
  }

  const users = db.prepare(`
    SELECT id, uid, email, nickname, avatar, level, exp, role, status, 
           email_verified, posts_count, comments_count, likes_received,
           continuous_checkin, total_checkin, created_at
    FROM users
    ${whereClause}
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, parseInt(limit), offset);

  const total = db.prepare(`SELECT COUNT(*) as count FROM users ${whereClause}`).get(...params).count;

  res.json({ code: 200, data: { list: users, total, page: parseInt(page), limit: parseInt(limit) } });
});

// 用户管理 - 详情
router.get('/users/:id', adminMiddleware, (req, res) => {
  const { id } = req.params;
  const db = getDb();

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!user) {
    return res.status(404).json({ code: 404, message: '用户不存在' });
  }

  const posts = db.prepare('SELECT COUNT(*) as count FROM posts WHERE user_id = ?').get(id).count;
  const comments = db.prepare('SELECT COUNT(*) as count FROM comments WHERE user_id = ?').get(id).count;
  const expLogs = db.prepare('SELECT * FROM exp_logs WHERE user_id = ? ORDER BY created_at DESC LIMIT 20').all(id);

  res.json({ code: 200, data: { ...user, posts_count: posts, comments_count: comments, exp_logs: expLogs } });
});

// 用户管理 - 修改等级/经验
router.put('/users/:id/level', adminMiddleware, (req, res) => {
  const { id } = req.params;
  const { level, exp } = req.body;
  const db = getDb();

  db.prepare(`
    UPDATE users SET 
      level = COALESCE(?, level),
      exp = COALESCE(?, exp),
      updated_at = datetime("now", "localtime")
    WHERE id = ?
  `).run(level || null, exp || null, id);

  db.prepare('INSERT INTO operation_logs (admin_id, action, target_type, target_id, detail) VALUES (?, "update_user_level", "user", ?, ?)')
    .run(req.user.id, id, `修改用户等级: level=${level}, exp=${exp}`);

  res.json({ code: 200, message: '用户等级已更新' });
});

// 用户管理 - 禁言/解禁
router.put('/users/:id/mute', adminMiddleware, (req, res) => {
  const { id } = req.params;
  const { muted } = req.body;
  const db = getDb();

  db.prepare('UPDATE users SET status = ?, updated_at = datetime("now", "localtime") WHERE id = ?')
    .run(muted ? 'muted' : 'active', id);

  db.prepare('INSERT INTO operation_logs (admin_id, action, target_type, target_id, detail) VALUES (?, "mute_user", "user", ?, ?)')
    .run(req.user.id, id, muted ? '禁言用户' : '解禁用户');

  res.json({ code: 200, message: muted ? '已禁言' : '已解禁' });
});

// 用户管理 - 封禁/解封
router.put('/users/:id/ban', adminMiddleware, (req, res) => {
  const { id } = req.params;
  const { banned } = req.body;
  const db = getDb();

  db.prepare('UPDATE users SET status = ?, updated_at = datetime("now", "localtime") WHERE id = ?')
    .run(banned ? 'banned' : 'active', id);

  db.prepare('INSERT INTO operation_logs (admin_id, action, target_type, target_id, detail) VALUES (?, "ban_user", "user", ?, ?)')
    .run(req.user.id, id, banned ? '封禁用户' : '解封用户');

  res.json({ code: 200, message: banned ? '已封禁' : '已解封' });
});

// 用户管理 - 修改密码
router.put('/users/:id/password', adminMiddleware, (req, res) => {
  const { id } = req.params;
  const { new_password } = req.body;

  if (!new_password || new_password.length < 6) {
    return res.status(400).json({ code: 400, message: '新密码至少6位' });
  }

  const db = getDb();
  const hashedPassword = bcrypt.hashSync(new_password, 10);
  db.prepare('UPDATE users SET password = ?, updated_at = datetime("now", "localtime") WHERE id = ?')
    .run(hashedPassword, id);

  db.prepare('INSERT INTO operation_logs (admin_id, action, target_type, target_id, detail) VALUES (?, "reset_user_password", "user", ?, "重置用户密码")')
    .run(req.user.id, id);

  res.json({ code: 200, message: '密码已重置' });
});

// 帖子管理
router.get('/posts', adminMiddleware, (req, res) => {
  const { page = 1, limit = 20, keyword, status, is_hidden } = req.query;
  const db = getDb();
  const offset = (page - 1) * limit;

  let whereClause = 'WHERE 1=1';
  const params = [];

  if (keyword) {
    whereClause += ' AND (title LIKE ? OR content LIKE ?)';
    params.push(`%${keyword}%`, `%${keyword}%`);
  }

  if (is_hidden !== undefined) {
    whereClause += ' AND is_hidden = ?';
    params.push(is_hidden === 'true' ? 1 : 0);
  }

  const posts = db.prepare(`
    SELECT p.*, u.nickname, u.avatar
    FROM posts p
    JOIN users u ON p.user_id = u.id
    ${whereClause}
    ORDER BY p.created_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, parseInt(limit), offset);

  const total = db.prepare(`SELECT COUNT(*) as count FROM posts p ${whereClause}`).get(...params).count;

  res.json({ code: 200, data: { list: posts, total, page: parseInt(page), limit: parseInt(limit) } });
});

// 帖子管理 - 置顶/加精/隐藏
router.put('/posts/:id', adminMiddleware, (req, res) => {
  const { id } = req.params;
  const { is_top, is_essence, is_hidden } = req.body;
  const db = getDb();

  const updates = [];
  const values = [];

  if (is_top !== undefined) { updates.push('is_top = ?'); values.push(is_top ? 1 : 0); }
  if (is_essence !== undefined) { updates.push('is_essence = ?'); values.push(is_essence ? 1 : 0); }
  if (is_hidden !== undefined) { updates.push('is_hidden = ?'); values.push(is_hidden ? 1 : 0); }

  if (updates.length > 0) {
    values.push(id);
    db.prepare(`UPDATE posts SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  }

  res.json({ code: 200, message: '帖子已更新' });
});

// 帖子管理 - 删除
router.delete('/posts/:id', adminMiddleware, (req, res) => {
  const { id } = req.params;
  const db = getDb();
  db.prepare('DELETE FROM posts WHERE id = ?').run(id);
  db.prepare('INSERT INTO operation_logs (admin_id, action, target_type, target_id, detail) VALUES (?, "delete_post", "post", ?, "删除帖子")')
    .run(req.user.id, id);
  res.json({ code: 200, message: '帖子已删除' });
});

// 评论管理
router.get('/comments', adminMiddleware, (req, res) => {
  const { page = 1, limit = 20, keyword } = req.query;
  const db = getDb();
  const offset = (page - 1) * limit;

  const comments = db.prepare(`
    SELECT c.*, u.nickname, u.avatar, p.title as post_title
    FROM comments c
    JOIN users u ON c.user_id = u.id
    JOIN posts p ON c.post_id = p.id
    ORDER BY c.created_at DESC
    LIMIT ? OFFSET ?
  `).all(parseInt(limit), offset);

  const total = db.prepare('SELECT COUNT(*) as count FROM comments').get().count;

  res.json({ code: 200, data: { list: comments, total, page: parseInt(page), limit: parseInt(limit) } });
});

// 评论管理 - 删除/隐藏
router.delete('/comments/:id', adminMiddleware, (req, res) => {
  const { id } = req.params;
  const db = getDb();
  db.prepare('DELETE FROM comments WHERE id = ?').run(id);
  res.json({ code: 200, message: '评论已删除' });
});

// 举报管理
router.get('/reports', adminMiddleware, (req, res) => {
  const { page = 1, limit = 20, status } = req.query;
  const db = getDb();
  const offset = (page - 1) * limit;

  let whereClause = 'WHERE 1=1';
  const params = [];

  if (status) {
    whereClause += ' AND r.status = ?';
    params.push(status);
  }

  const reports = db.prepare(`
    SELECT r.*, u.nickname as reporter_name, u.avatar as reporter_avatar
    FROM reports r
    JOIN users u ON r.reporter_id = u.id
    ${whereClause}
    ORDER BY r.created_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, parseInt(limit), offset);

  const total = db.prepare(`SELECT COUNT(*) as count FROM reports r ${whereClause}`).get(...params).count;

  res.json({ code: 200, data: { list: reports, total, page: parseInt(page), limit: parseInt(limit) } });
});

// 举报管理 - 处理
router.put('/reports/:id', adminMiddleware, (req, res) => {
  const { id } = req.params;
  const { status, handle_result } = req.body;
  const db = getDb();

  db.prepare(`
    UPDATE reports SET 
      status = ?, 
      handler_id = ?, 
      handle_result = ?,
      handled_at = datetime("now", "localtime")
    WHERE id = ?
  `).run(status || 'processed', req.user.id, handle_result || '', id);

  const report = db.prepare('SELECT * FROM reports WHERE id = ?').get(id);

  // 发送消息给举报人
  db.prepare(`
    INSERT INTO messages (user_id, type, title, content)
    VALUES (?, 'system', '举报处理结果', ?)
  `).run(report.reporter_id, `您的举报已处理，处理结果：${handle_result || status}`);

  res.json({ code: 200, message: '举报已处理' });
});

// 公告管理
router.get('/announcements', adminMiddleware, (req, res) => {
  const db = getDb();
  const announcements = db.prepare('SELECT * FROM announcements ORDER BY created_at DESC').all();
  res.json({ code: 200, data: announcements });
});

router.post('/announcements', adminMiddleware, (req, res) => {
  const { title, content, type = 'system', is_top = 0, is_published = 1 } = req.body;
  const db = getDb();

  if (!title || !content) {
    return res.status(400).json({ code: 400, message: '标题和内容不能为空' });
  }

  const result = db.prepare(`
    INSERT INTO announcements (title, content, type, is_top, is_published, created_by)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(title, content, type, is_top ? 1 : 0, is_published ? 1 : 0, req.user.id);

  res.json({ code: 200, message: '公告已发布', data: { id: result.lastInsertRowid } });
});

router.put('/announcements/:id', adminMiddleware, (req, res) => {
  const { id } = req.params;
  const { title, content, type, is_top, is_published } = req.body;
  const db = getDb();

  db.prepare(`
    UPDATE announcements SET 
      title = COALESCE(?, title),
      content = COALESCE(?, content),
      type = COALESCE(?, type),
      is_top = COALESCE(?, is_top),
      is_published = COALESCE(?, is_published),
      updated_at = datetime("now", "localtime")
    WHERE id = ?
  `).run(title || null, content || null, type || null, is_top !== undefined ? (is_top ? 1 : 0) : null, is_published !== undefined ? (is_published ? 1 : 0) : null, id);

  res.json({ code: 200, message: '公告已更新' });
});

router.delete('/announcements/:id', adminMiddleware, (req, res) => {
  const { id } = req.params;
  const db = getDb();
  db.prepare('DELETE FROM announcements WHERE id = ?').run(id);
  res.json({ code: 200, message: '公告已删除' });
});

// 话题管理
router.get('/topics', adminMiddleware, (req, res) => {
  const db = getDb();
  const topics = db.prepare('SELECT * FROM topics ORDER BY created_at DESC').all();
  res.json({ code: 200, data: topics });
});

router.post('/topics', adminMiddleware, (req, res) => {
  const { name, description, is_hot = 0 } = req.body;
  const db = getDb();

  if (!name) {
    return res.status(400).json({ code: 400, message: '话题名称不能为空' });
  }

  try {
    const result = db.prepare('INSERT INTO topics (name, description, is_hot) VALUES (?, ?, ?)').run(name, description || '', is_hot ? 1 : 0);
    res.json({ code: 200, message: '话题已创建', data: { id: result.lastInsertRowid } });
  } catch (error) {
    res.status(409).json({ code: 409, message: '话题已存在' });
  }
});

router.delete('/topics/:id', adminMiddleware, (req, res) => {
  const { id } = req.params;
  const db = getDb();
  db.prepare('DELETE FROM topics WHERE id = ?').run(id);
  res.json({ code: 200, message: '话题已删除' });
});

// 管理员管理（超级管理员）
router.get('/admins', superAdminMiddleware, (req, res) => {
  const db = getDb();
  const admins = db.prepare(`
    SELECT a.*, u.nickname, u.email, u.avatar
    FROM admins a
    JOIN users u ON a.user_id = u.id
    ORDER BY a.created_at DESC
  `).all();
  res.json({ code: 200, data: admins });
});

router.post('/admins', superAdminMiddleware, (req, res) => {
  const { user_id, role = 'admin', permissions = [] } = req.body;
  const db = getDb();

  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(user_id);
  if (!user) {
    return res.status(404).json({ code: 404, message: '用户不存在' });
  }

  db.prepare('INSERT OR REPLACE INTO admins (user_id, role, permissions) VALUES (?, ?, ?)')
    .run(user_id, role, JSON.stringify(permissions));
  db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, user_id);

  res.json({ code: 200, message: '管理员已添加' });
});

router.delete('/admins/:userId', superAdminMiddleware, (req, res) => {
  const { userId } = req.params;
  const db = getDb();
  db.prepare('DELETE FROM admins WHERE user_id = ?').run(userId);
  db.prepare('UPDATE users SET role = "user" WHERE id = ?').run(userId);
  res.json({ code: 200, message: '管理员已移除' });
});

// 操作日志
router.get('/logs', adminMiddleware, (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const db = getDb();
  const offset = (page - 1) * limit;

  const logs = db.prepare(`
    SELECT o.*, u.nickname as admin_name
    FROM operation_logs o
    JOIN users u ON o.admin_id = u.id
    ORDER BY o.created_at DESC
    LIMIT ? OFFSET ?
  `).all(parseInt(limit), offset);

  const total = db.prepare('SELECT COUNT(*) as count FROM operation_logs').get().count;

  res.json({ code: 200, data: { list: logs, total, page: parseInt(page), limit: parseInt(limit) } });
});

module.exports = router;
