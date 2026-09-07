const express = require('express');
const { getDb } = require('../database');
const { authMiddleware, optionalAuthMiddleware, adminMiddleware } = require('../middleware/auth');

const router = express.Router();

// 获取软件列表
router.get('/', optionalAuthMiddleware, (req, res) => {
  const { page = 1, limit = 20, category, sort = 'latest', keyword } = req.query;
  const db = getDb();
  const offset = (page - 1) * limit;

  let whereClause = 'WHERE is_hidden = 0';
  const params = [];

  if (category && category !== '全部') {
    whereClause += ' AND category = ?';
    params.push(category);
  }

  if (keyword) {
    whereClause += ' AND (name LIKE ? OR description LIKE ? OR tags LIKE ?)';
    params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
  }

  let orderBy = 'created_at DESC';
  if (sort === 'hot') orderBy = 'download_count DESC';
  if (sort === 'recommended') orderBy = 'is_recommended DESC, download_count DESC';
  if (sort === 'favorite') orderBy = 'favorite_count DESC';

  const softwares = db.prepare(`
    SELECT * FROM softwares
    ${whereClause}
    ORDER BY ${orderBy}
    LIMIT ? OFFSET ?
  `).all(...params, parseInt(limit), offset);

  if (req.user) {
    softwares.forEach(software => {
      const favorited = db.prepare('SELECT id FROM favorites WHERE user_id = ? AND target_type = "software" AND target_id = ?').get(req.user.id, software.id);
      software.is_favorited = !!favorited;
    });
  }

  const total = db.prepare(`SELECT COUNT(*) as count FROM softwares ${whereClause}`).get(...params).count;

  res.json({ code: 200, data: { list: softwares, total, page: parseInt(page), limit: parseInt(limit) } });
});

// 获取软件详情
router.get('/:id', optionalAuthMiddleware, (req, res) => {
  const { id } = req.params;
  const db = getDb();

  const software = db.prepare('SELECT * FROM softwares WHERE id = ? AND is_hidden = 0').get(id);
  if (!software) {
    return res.status(404).json({ code: 404, message: '软件不存在' });
  }

  if (req.user) {
    const favorited = db.prepare('SELECT id FROM favorites WHERE user_id = ? AND target_type = "software" AND target_id = ?').get(req.user.id, software.id);
    software.is_favorited = !!favorited;
  }

  res.json({ code: 200, data: software });
});

// 下载软件（增加下载量）
router.post('/:id/download', (req, res) => {
  const { id } = req.params;
  const db = getDb();

  const software = db.prepare('SELECT id, download_url, download_count FROM softwares WHERE id = ?').get(id);
  if (!software) {
    return res.status(404).json({ code: 404, message: '软件不存在' });
  }

  db.prepare('UPDATE softwares SET download_count = download_count + 1 WHERE id = ?').run(id);

  res.json({ code: 200, message: '开始下载', data: { download_url: software.download_url } });
});

// 收藏/取消收藏软件
router.post('/:id/favorite', authMiddleware, (req, res) => {
  const { id } = req.params;
  const db = getDb();

  const software = db.prepare('SELECT id, favorite_count FROM softwares WHERE id = ?').get(id);
  if (!software) {
    return res.status(404).json({ code: 404, message: '软件不存在' });
  }

  const existingFavorite = db.prepare('SELECT id FROM favorites WHERE user_id = ? AND target_type = "software" AND target_id = ?').get(req.user.id, id);

  if (existingFavorite) {
    db.prepare('DELETE FROM favorites WHERE id = ?').run(existingFavorite.id);
    db.prepare('UPDATE softwares SET favorite_count = MAX(favorite_count - 1, 0) WHERE id = ?').run(id);
    db.prepare('UPDATE users SET favorites_count = MAX(favorites_count - 1, 0) WHERE id = ?').run(req.user.id);
    res.json({ code: 200, message: '已取消收藏', data: { is_favorited: false } });
  } else {
    db.prepare('INSERT INTO favorites (user_id, target_type, target_id) VALUES (?, "software", ?)').run(req.user.id, id);
    db.prepare('UPDATE softwares SET favorite_count = favorite_count + 1 WHERE id = ?').run(id);
    db.prepare('UPDATE users SET favorites_count = favorites_count + 1 WHERE id = ?').run(req.user.id);
    res.json({ code: 200, message: '收藏成功', data: { is_favorited: true } });
  }
});

// 获取软件分类
router.get('/categories/list', (req, res) => {
  const db = getDb();
  const categories = db.prepare('SELECT * FROM software_categories ORDER BY sort_order').all();
  res.json({ code: 200, data: categories });
});

// 获取软件合集
router.get('/collections/list', (req, res) => {
  const db = getDb();
  const collections = db.prepare('SELECT * FROM software_collections ORDER BY sort_order').all();
  res.json({ code: 200, data: collections });
});

// 获取合集详情
router.get('/collections/:id', (req, res) => {
  const { id } = req.params;
  const db = getDb();

  const collection = db.prepare('SELECT * FROM software_collections WHERE id = ?').get(id);
  if (!collection) {
    return res.status(404).json({ code: 404, message: '合集不存在' });
  }

  const softwareIds = JSON.parse(collection.software_ids || '[]');
  let softwares = [];
  if (softwareIds.length > 0) {
    const placeholders = softwareIds.map(() => '?').join(',');
    softwares = db.prepare(`SELECT * FROM softwares WHERE id IN (${placeholders}) AND is_hidden = 0`).all(...softwareIds);
  }

  res.json({ code: 200, data: { ...collection, softwares } });
});

// 推荐软件
router.get('/home/recommended', (req, res) => {
  const db = getDb();
  const recommended = db.prepare('SELECT * FROM softwares WHERE is_recommended = 1 AND is_hidden = 0 ORDER BY download_count DESC LIMIT 10').all();
  const hot = db.prepare('SELECT * FROM softwares WHERE is_hot = 1 AND is_hidden = 0 ORDER BY download_count DESC LIMIT 10').all();
  const latest = db.prepare('SELECT * FROM softwares WHERE is_hidden = 0 ORDER BY created_at DESC LIMIT 10').all();

  res.json({ code: 200, data: { recommended, hot, latest } });
});

// 管理员添加软件
router.post('/', adminMiddleware, (req, res) => {
  const { name, icon, description, screenshots, category, version, size, developer, download_url, tags, update_log, is_recommended, is_hot, is_essence } = req.body;

  if (!name || !category || !download_url) {
    return res.status(400).json({ code: 400, message: '软件名称、分类和下载地址不能为空' });
  }

  const db = getDb();

  const result = db.prepare(`
    INSERT INTO softwares (name, icon, description, screenshots, category, version, size, developer, download_url, tags, update_log, is_recommended, is_hot, is_essence)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    name, icon || '', description || '',
    JSON.stringify(screenshots || []),
    category, version || '1.0.0', size || '0MB',
    developer || '', download_url,
    JSON.stringify(tags || []),
    update_log || '',
    is_recommended ? 1 : 0,
    is_hot ? 1 : 0,
    is_essence ? 1 : 0
  );

  // 记录操作日志
  db.prepare('INSERT INTO operation_logs (admin_id, action, target_type, target_id, detail) VALUES (?, "add_software", "software", ?, ?)')
    .run(req.user.id, result.lastInsertRowid, `添加软件: ${name}`);

  res.json({ code: 200, message: '软件添加成功', data: { id: result.lastInsertRowid } });
});

// 管理员编辑软件
router.put('/:id', adminMiddleware, (req, res) => {
  const { id } = req.params;
  const db = getDb();

  const software = db.prepare('SELECT id FROM softwares WHERE id = ?').get(id);
  if (!software) {
    return res.status(404).json({ code: 404, message: '软件不存在' });
  }

  const fields = ['name', 'icon', 'description', 'category', 'version', 'size', 'developer', 'download_url', 'update_log', 'is_recommended', 'is_hot', 'is_essence'];
  const updates = [];
  const values = [];

  fields.forEach(field => {
    if (req.body[field] !== undefined) {
      updates.push(`${field} = ?`);
      values.push(typeof req.body[field] === 'boolean' ? (req.body[field] ? 1 : 0) : req.body[field]);
    }
  });

  if (req.body.screenshots !== undefined) {
    updates.push('screenshots = ?');
    values.push(JSON.stringify(req.body.screenshots));
  }

  if (req.body.tags !== undefined) {
    updates.push('tags = ?');
    values.push(JSON.stringify(req.body.tags));
  }

  if (updates.length > 0) {
    updates.push('updated_at = datetime("now", "localtime")');
    values.push(id);
    db.prepare(`UPDATE softwares SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  }

  res.json({ code: 200, message: '软件更新成功' });
});

// 管理员删除软件
router.delete('/:id', adminMiddleware, (req, res) => {
  const { id } = req.params;
  const db = getDb();

  db.prepare('UPDATE softwares SET is_hidden = 1 WHERE id = ?').run(id);

  db.prepare('INSERT INTO operation_logs (admin_id, action, target_type, target_id, detail) VALUES (?, "delete_software", "software", ?, ?)')
    .run(req.user.id, id, `删除软件ID: ${id}`);

  res.json({ code: 200, message: '软件已删除' });
});

module.exports = router;
