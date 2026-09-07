const express = require('express');
const { getDb } = require('../database');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// 获取消息列表
router.get('/', authMiddleware, (req, res) => {
  const { page = 1, limit = 20, type } = req.query;
  const db = getDb();
  const offset = (page - 1) * limit;

  let whereClause = 'WHERE m.user_id = ?';
  const params = [req.user.id];

  if (type && type !== 'all') {
    whereClause += ' AND m.type = ?';
    params.push(type);
  }

  const messages = db.prepare(`
    SELECT m.*, u.nickname as from_nickname, u.avatar as from_avatar
    FROM messages m
    LEFT JOIN users u ON m.from_user_id = u.id
    ${whereClause}
    ORDER BY m.created_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, parseInt(limit), offset);

  const total = db.prepare(`SELECT COUNT(*) as count FROM messages m ${whereClause}`).get(...params).count;
  const unread = db.prepare('SELECT COUNT(*) as count FROM messages WHERE user_id = ? AND is_read = 0').get(req.user.id).count;

  res.json({ code: 200, data: { list: messages, total, unread, page: parseInt(page), limit: parseInt(limit) } });
});

// 标记消息已读
router.post('/:id/read', authMiddleware, (req, res) => {
  const { id } = req.params;
  const db = getDb();

  db.prepare('UPDATE messages SET is_read = 1 WHERE id = ? AND user_id = ?').run(id, req.user.id);
  res.json({ code: 200, message: '已标记为已读' });
});

// 全部标记已读
router.post('/read-all', authMiddleware, (req, res) => {
  const db = getDb();
  db.prepare('UPDATE messages SET is_read = 1 WHERE user_id = ?').run(req.user.id);
  res.json({ code: 200, message: '全部标记为已读' });
});

// 删除消息
router.delete('/:id', authMiddleware, (req, res) => {
  const { id } = req.params;
  const db = getDb();
  db.prepare('DELETE FROM messages WHERE id = ? AND user_id = ?').run(id, req.user.id);
  res.json({ code: 200, message: '删除成功' });
});

// 获取未读消息数
router.get('/unread/count', authMiddleware, (req, res) => {
  const db = getDb();
  const count = db.prepare('SELECT COUNT(*) as count FROM messages WHERE user_id = ? AND is_read = 0').get(req.user.id).count;
  const pmUnread = db.prepare('SELECT COUNT(*) as count FROM private_messages WHERE to_user_id = ? AND is_read = 0').get(req.user.id).count;
  res.json({ code: 200, data: { messages: count, private_messages: pmUnread, total: count + pmUnread } });
});

// 获取私信会话列表
router.get('/private/conversations', authMiddleware, (req, res) => {
  const db = getDb();

  const conversations = db.prepare(`
    SELECT 
      CASE WHEN from_user_id = ? THEN to_user_id ELSE from_user_id END as other_user_id,
      MAX(created_at) as last_message_time,
      COUNT(*) as message_count
    FROM private_messages
    WHERE from_user_id = ? OR to_user_id = ?
    GROUP BY other_user_id
    ORDER BY last_message_time DESC
  `).all(req.user.id, req.user.id, req.user.id);

  const result = conversations.map(conv => {
    const user = db.prepare('SELECT id, uid, nickname, avatar, level, signature FROM users WHERE id = ?').get(conv.other_user_id);
    const lastMessage = db.prepare(`
      SELECT * FROM private_messages
      WHERE (from_user_id = ? AND to_user_id = ?) OR (from_user_id = ? AND to_user_id = ?)
      ORDER BY created_at DESC LIMIT 1
    `).get(req.user.id, conv.other_user_id, conv.other_user_id, req.user.id);

    const unread = db.prepare('SELECT COUNT(*) as count FROM private_messages WHERE from_user_id = ? AND to_user_id = ? AND is_read = 0').get(conv.other_user_id, req.user.id).count;

    return {
      user,
      last_message: lastMessage,
      unread_count: unread,
      message_count: conv.message_count,
    };
  });

  res.json({ code: 200, data: result });
});

// 获取与某个用户的私信记录
router.get('/private/:userId', authMiddleware, (req, res) => {
  const { userId } = req.params;
  const { page = 1, limit = 50 } = req.query;
  const db = getDb();
  const offset = (page - 1) * limit;

  const messages = db.prepare(`
    SELECT * FROM private_messages
    WHERE (from_user_id = ? AND to_user_id = ?) OR (from_user_id = ? AND to_user_id = ?)
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `).all(req.user.id, userId, userId, req.user.id, parseInt(limit), offset).reverse();

  // 标记为已读
  db.prepare('UPDATE private_messages SET is_read = 1 WHERE from_user_id = ? AND to_user_id = ? AND is_read = 0').run(userId, req.user.id);

  const otherUser = db.prepare('SELECT id, uid, nickname, avatar, level, signature FROM users WHERE id = ?').get(userId);

  res.json({ code: 200, data: { messages, other_user: otherUser, page: parseInt(page), limit: parseInt(limit) } });
});

// 发送私信
router.post('/private/:userId', authMiddleware, (req, res) => {
  const { userId } = req.params;
  const { content } = req.body;

  if (!content || content.trim().length === 0) {
    return res.status(400).json({ code: 400, message: '消息内容不能为空' });
  }

  const db = getDb();

  const targetUser = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
  if (!targetUser) {
    return res.status(404).json({ code: 404, message: '用户不存在' });
  }

  const result = db.prepare(`
    INSERT INTO private_messages (from_user_id, to_user_id, content)
    VALUES (?, ?, ?)
  `).run(req.user.id, userId, content);

  const message = db.prepare('SELECT * FROM private_messages WHERE id = ?').get(result.lastInsertRowid);

  res.json({ code: 200, message: '发送成功', data: message });
});

// 举报
router.post('/report', authMiddleware, (req, res) => {
  const { target_type, target_id, reason, description } = req.body;

  if (!target_type || !target_id || !reason) {
    return res.status(400).json({ code: 400, message: '请填写举报类型、对象和原因' });
  }

  const db = getDb();

  db.prepare(`
    INSERT INTO reports (reporter_id, target_type, target_id, reason, description)
    VALUES (?, ?, ?, ?, ?)
  `).run(req.user.id, target_type, target_id, reason, description || '');

  res.json({ code: 200, message: '举报已提交，我们会尽快处理' });
});

// 公告列表
router.get('/announcements/list', (req, res) => {
  const db = getDb();
  const announcements = db.prepare(`
    SELECT a.*, u.nickname as author_name
    FROM announcements a
    LEFT JOIN users u ON a.created_by = u.id
    WHERE a.is_published = 1
    ORDER BY a.is_top DESC, a.publish_at DESC
    LIMIT 20
  `).all();
  res.json({ code: 200, data: announcements });
});

module.exports = router;
