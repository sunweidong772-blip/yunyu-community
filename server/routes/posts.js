const express = require('express');
const { getDb } = require('../database');
const { authMiddleware, optionalAuthMiddleware } = require('../middleware/auth');
const { addExp } = require('./users');

const router = express.Router();

// 获取帖子列表
router.get('/', optionalAuthMiddleware, (req, res) => {
  const { page = 1, limit = 20, category = '推荐', topic_id, sort = 'latest' } = req.query;
  const db = getDb();
  const offset = (page - 1) * limit;

  let whereClause = 'WHERE p.is_hidden = 0 AND p.status = "published"';
  const params = [];

  if (category && category !== '推荐') {
    whereClause += ' AND p.category = ?';
    params.push(category);
  }

  if (topic_id) {
    whereClause += ' AND p.topic_id = ?';
    params.push(topic_id);
  }

  let orderBy = 'p.created_at DESC';
  if (sort === 'hot') {
    orderBy = '(p.likes_count + p.comments_count * 2 + p.views * 0.1) DESC';
  }

  const posts = db.prepare(`
    SELECT p.*, u.nickname, u.avatar, u.level, u.role,
           t.name as topic_name
    FROM posts p
    JOIN users u ON p.user_id = u.id
    LEFT JOIN topics t ON p.topic_id = t.id
    ${whereClause}
    ORDER BY ${orderBy}
    LIMIT ? OFFSET ?
  `).all(...params, parseInt(limit), offset);

  // 检查当前用户是否点赞/收藏
  if (req.user) {
    posts.forEach(post => {
      const liked = db.prepare('SELECT id FROM likes WHERE user_id = ? AND target_type = "post" AND target_id = ?').get(req.user.id, post.id);
      const favorited = db.prepare('SELECT id FROM favorites WHERE user_id = ? AND target_type = "post" AND target_id = ?').get(req.user.id, post.id);
      post.is_liked = !!liked;
      post.is_favorited = !!favorited;
    });
  }

  const total = db.prepare(`SELECT COUNT(*) as count FROM posts p ${whereClause}`).get(...params).count;

  res.json({ code: 200, data: { list: posts, total, page: parseInt(page), limit: parseInt(limit) } });
});

// 获取帖子详情
router.get('/:id', optionalAuthMiddleware, (req, res) => {
  const { id } = req.params;
  const db = getDb();

  const post = db.prepare(`
    SELECT p.*, u.nickname, u.avatar, u.level, u.role, u.signature,
           u.followers_count, u.posts_count,
           t.name as topic_name
    FROM posts p
    JOIN users u ON p.user_id = u.id
    LEFT JOIN topics t ON p.topic_id = t.id
    WHERE p.id = ? AND p.is_hidden = 0
  `).get(id);

  if (!post) {
    return res.status(404).json({ code: 404, message: '帖子不存在或已被删除' });
  }

  // 增加浏览量
  db.prepare('UPDATE posts SET views = views + 1 WHERE id = ?').run(id);

  if (req.user) {
    const liked = db.prepare('SELECT id FROM likes WHERE user_id = ? AND target_type = "post" AND target_id = ?').get(req.user.id, post.id);
    const favorited = db.prepare('SELECT id FROM favorites WHERE user_id = ? AND target_type = "post" AND target_id = ?').get(req.user.id, post.id);
    const followed = db.prepare('SELECT id FROM follows WHERE follower_id = ? AND following_id = ?').get(req.user.id, post.user_id);
    post.is_liked = !!liked;
    post.is_favorited = !!favorited;
    post.is_followed = !!followed;
  }

  res.json({ code: 200, data: post });
});

// 发布帖子
router.post('/', authMiddleware, (req, res) => {
  if (req.userMuted) {
    return res.status(403).json({ code: 403, message: '您已被禁言，无法发布内容' });
  }

  const { title, content, images = [], tags = [], topic_id, category = '推荐', software_id } = req.body;

  if (!title || !content) {
    return res.status(400).json({ code: 400, message: '标题和内容不能为空' });
  }

  if (title.length > 100) {
    return res.status(400).json({ code: 400, message: '标题不能超过100个字符' });
  }

  const db = getDb();

  const result = db.prepare(`
    INSERT INTO posts (user_id, title, content, images, tags, topic_id, category, software_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    req.user.id,
    title,
    content,
    JSON.stringify(images),
    JSON.stringify(tags),
    topic_id || null,
    category,
    software_id || null
  );

  db.prepare('UPDATE users SET posts_count = posts_count + 1 WHERE id = ?').run(req.user.id);

  addExp(db, req.user.id, 20, '发布帖子');

  // 更新话题帖子数
  if (topic_id) {
    db.prepare('UPDATE topics SET posts_count = posts_count + 1 WHERE id = ?').run(topic_id);
  }

  // 更新任务进度
  const postTask = db.prepare("SELECT id FROM tasks WHERE name = '发布帖子'").get();
  if (postTask) {
    const today = new Date().toISOString().split('T')[0];
    const userTask = db.prepare('SELECT id, progress FROM user_tasks WHERE user_id = ? AND task_id = ? AND completed_date = ?').get(req.user.id, postTask.id, today);
    if (userTask) {
      const newProgress = Math.min(userTask.progress + 1, postTask.target_count);
      db.prepare('UPDATE user_tasks SET progress = ?, completed = ? WHERE id = ?')
        .run(newProgress, newProgress >= postTask.target_count ? 1 : 0, userTask.id);
    } else {
      db.prepare('INSERT INTO user_tasks (user_id, task_id, progress, completed, completed_date) VALUES (?, ?, 1, 1, ?)')
        .run(req.user.id, postTask.id, today);
    }
  }

  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(result.lastInsertRowid);
  res.json({ code: 200, message: '发布成功', data: post });
});

// 编辑帖子
router.put('/:id', authMiddleware, (req, res) => {
  const { id } = req.params;
  const { title, content, images, tags, category } = req.body;
  const db = getDb();

  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(id);
  if (!post) {
    return res.status(404).json({ code: 404, message: '帖子不存在' });
  }

  if (post.user_id !== req.user.id && req.user.role !== 'super_admin' && !['admin', 'senior_admin', 'content_admin'].includes(req.user.role)) {
    return res.status(403).json({ code: 403, message: '无权编辑此帖子' });
  }

  db.prepare(`
    UPDATE posts SET 
      title = COALESCE(?, title),
      content = COALESCE(?, content),
      images = COALESCE(?, images),
      tags = COALESCE(?, tags),
      category = COALESCE(?, category),
      updated_at = datetime("now", "localtime")
    WHERE id = ?
  `).run(
    title || null,
    content || null,
    images ? JSON.stringify(images) : null,
    tags ? JSON.stringify(tags) : null,
    category || null,
    id
  );

  res.json({ code: 200, message: '编辑成功' });
});

// 删除帖子
router.delete('/:id', authMiddleware, (req, res) => {
  const { id } = req.params;
  const db = getDb();

  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(id);
  if (!post) {
    return res.status(404).json({ code: 404, message: '帖子不存在' });
  }

  if (post.user_id !== req.user.id && req.user.role !== 'super_admin' && !['admin', 'senior_admin', 'content_admin'].includes(req.user.role)) {
    return res.status(403).json({ code: 403, message: '无权删除此帖子' });
  }

  db.prepare('DELETE FROM posts WHERE id = ?').run(id);
  db.prepare('UPDATE users SET posts_count = MAX(posts_count - 1, 0) WHERE id = ?').run(post.user_id);

  res.json({ code: 200, message: '删除成功' });
});

// 点赞/取消点赞
router.post('/:id/like', authMiddleware, (req, res) => {
  const { id } = req.params;
  const db = getDb();

  const post = db.prepare('SELECT id, user_id, likes_count FROM posts WHERE id = ?').get(id);
  if (!post) {
    return res.status(404).json({ code: 404, message: '帖子不存在' });
  }

  const existingLike = db.prepare('SELECT id FROM likes WHERE user_id = ? AND target_type = "post" AND target_id = ?').get(req.user.id, id);

  if (existingLike) {
    db.prepare('DELETE FROM likes WHERE id = ?').run(existingLike.id);
    db.prepare('UPDATE posts SET likes_count = MAX(likes_count - 1, 0) WHERE id = ?').run(id);
    res.json({ code: 200, message: '已取消点赞', data: { is_liked: false, likes_count: post.likes_count - 1 } });
  } else {
    db.prepare('INSERT INTO likes (user_id, target_type, target_id) VALUES (?, "post", ?)').run(req.user.id, id);
    db.prepare('UPDATE posts SET likes_count = likes_count + 1 WHERE id = ?').run(id);

    // 通知作者
    if (post.user_id !== req.user.id) {
      db.prepare(`
        INSERT INTO messages (user_id, from_user_id, type, title, content, target_type, target_id)
        VALUES (?, ?, 'like', '收到点赞', ?, 'post', ?)
      `).run(post.user_id, req.user.id, `${req.user.nickname} 赞了你的帖子`, id);
      db.prepare('UPDATE users SET likes_received = likes_received + 1 WHERE id = ?').run(post.user_id);
    }

    addExp(db, req.user.id, 2, '点赞内容');

    res.json({ code: 200, message: '点赞成功', data: { is_liked: true, likes_count: post.likes_count + 1 } });
  }
});

// 收藏/取消收藏
router.post('/:id/favorite', authMiddleware, (req, res) => {
  const { id } = req.params;
  const db = getDb();

  const post = db.prepare('SELECT id, favorites_count FROM posts WHERE id = ?').get(id);
  if (!post) {
    return res.status(404).json({ code: 404, message: '帖子不存在' });
  }

  const existingFavorite = db.prepare('SELECT id FROM favorites WHERE user_id = ? AND target_type = "post" AND target_id = ?').get(req.user.id, id);

  if (existingFavorite) {
    db.prepare('DELETE FROM favorites WHERE id = ?').run(existingFavorite.id);
    db.prepare('UPDATE posts SET favorites_count = MAX(favorites_count - 1, 0) WHERE id = ?').run(id);
    db.prepare('UPDATE users SET favorites_count = MAX(favorites_count - 1, 0) WHERE id = ?').run(req.user.id);
    res.json({ code: 200, message: '已取消收藏', data: { is_favorited: false } });
  } else {
    db.prepare('INSERT INTO favorites (user_id, target_type, target_id) VALUES (?, "post", ?)').run(req.user.id, id);
    db.prepare('UPDATE posts SET favorites_count = favorites_count + 1 WHERE id = ?').run(id);
    db.prepare('UPDATE users SET favorites_count = favorites_count + 1 WHERE id = ?').run(req.user.id);
    addExp(db, req.user.id, 5, '收藏内容');
    res.json({ code: 200, message: '收藏成功', data: { is_favorited: true } });
  }
});

// 获取评论列表
router.get('/:id/comments', (req, res) => {
  const { id } = req.params;
  const { page = 1, limit = 20, sort = 'latest' } = req.query;
  const db = getDb();
  const offset = (page - 1) * limit;

  let orderBy = 'c.created_at DESC';
  if (sort === 'hot') {
    orderBy = 'c.likes_count DESC';
  }

  const comments = db.prepare(`
    SELECT c.*, u.nickname, u.avatar, u.level, u.role,
           ru.nickname as reply_to_nickname
    FROM comments c
    JOIN users u ON c.user_id = u.id
    LEFT JOIN users ru ON c.reply_to_user_id = ru.id
    WHERE c.post_id = ? AND c.is_hidden = 0 AND c.parent_id = 0
    ORDER BY ${orderBy}
    LIMIT ? OFFSET ?
  `).all(id, parseInt(limit), offset);

  // 获取子评论
  comments.forEach(comment => {
    const replies = db.prepare(`
      SELECT c.*, u.nickname, u.avatar, u.level,
             ru.nickname as reply_to_nickname
      FROM comments c
      JOIN users u ON c.user_id = u.id
      LEFT JOIN users ru ON c.reply_to_user_id = ru.id
      WHERE c.parent_id = ? AND c.is_hidden = 0
      ORDER BY c.created_at ASC
      LIMIT 5
    `).all(comment.id);
    comment.replies = replies;
  });

  const total = db.prepare('SELECT COUNT(*) as count FROM comments WHERE post_id = ? AND is_hidden = 0 AND parent_id = 0').get(id).count;

  res.json({ code: 200, data: { list: comments, total, page: parseInt(page), limit: parseInt(limit) } });
});

// 发表评论
router.post('/:id/comments', authMiddleware, (req, res) => {
  if (req.userMuted) {
    return res.status(403).json({ code: 403, message: '您已被禁言，无法评论' });
  }

  const { id } = req.params;
  const { content, parent_id = 0, reply_to_user_id } = req.body;

  if (!content || content.trim().length === 0) {
    return res.status(400).json({ code: 400, message: '评论内容不能为空' });
  }

  const db = getDb();

  const post = db.prepare('SELECT id, user_id FROM posts WHERE id = ?').get(id);
  if (!post) {
    return res.status(404).json({ code: 404, message: '帖子不存在' });
  }

  const result = db.prepare(`
    INSERT INTO comments (post_id, user_id, parent_id, reply_to_user_id, content)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, req.user.id, parent_id, reply_to_user_id || null, content);

  db.prepare('UPDATE posts SET comments_count = comments_count + 1 WHERE id = ?').run(id);
  db.prepare('UPDATE users SET comments_count = comments_count + 1 WHERE id = ?').run(req.user.id);

  addExp(db, req.user.id, 5, '发表评论');

  // 通知帖子作者
  if (post.user_id !== req.user.id && parent_id === 0) {
    db.prepare(`
      INSERT INTO messages (user_id, from_user_id, type, title, content, target_type, target_id)
      VALUES (?, ?, 'comment', '收到评论', ?, 'post', ?)
    `).run(post.user_id, req.user.id, `${req.user.nickname} 评论了你的帖子`, id);
  }

  // 通知被回复的用户
  if (reply_to_user_id && reply_to_user_id !== req.user.id) {
    db.prepare(`
      INSERT INTO messages (user_id, from_user_id, type, title, content, target_type, target_id)
      VALUES (?, ?, 'reply', '收到回复', ?, 'post', ?)
    `).run(reply_to_user_id, req.user.id, `${req.user.nickname} 回复了你`, id);
  }

  const comment = db.prepare(`
    SELECT c.*, u.nickname, u.avatar, u.level
    FROM comments c
    JOIN users u ON c.user_id = u.id
    WHERE c.id = ?
  `).get(result.lastInsertRowid);

  res.json({ code: 200, message: '评论成功', data: comment });
});

// 评论点赞
router.post('/comments/:commentId/like', authMiddleware, (req, res) => {
  const { commentId } = req.params;
  const db = getDb();

  const comment = db.prepare('SELECT id, likes_count FROM comments WHERE id = ?').get(commentId);
  if (!comment) {
    return res.status(404).json({ code: 404, message: '评论不存在' });
  }

  const existingLike = db.prepare('SELECT id FROM likes WHERE user_id = ? AND target_type = "comment" AND target_id = ?').get(req.user.id, commentId);

  if (existingLike) {
    db.prepare('DELETE FROM likes WHERE id = ?').run(existingLike.id);
    db.prepare('UPDATE comments SET likes_count = MAX(likes_count - 1, 0) WHERE id = ?').run(commentId);
    res.json({ code: 200, data: { is_liked: false } });
  } else {
    db.prepare('INSERT INTO likes (user_id, target_type, target_id) VALUES (?, "comment", ?)').run(req.user.id, commentId);
    db.prepare('UPDATE comments SET likes_count = likes_count + 1 WHERE id = ?').run(commentId);
    res.json({ code: 200, data: { is_liked: true } });
  }
});

// 搜索帖子
router.get('/search/all', optionalAuthMiddleware, (req, res) => {
  const { keyword, page = 1, limit = 20 } = req.query;
  if (!keyword) {
    return res.status(400).json({ code: 400, message: '请输入搜索关键词' });
  }

  const db = getDb();
  const offset = (page - 1) * limit;

  const posts = db.prepare(`
    SELECT p.*, u.nickname, u.avatar, u.level
    FROM posts p
    JOIN users u ON p.user_id = u.id
    WHERE p.is_hidden = 0 AND p.status = 'published'
    AND (p.title LIKE ? OR p.content LIKE ? OR p.tags LIKE ?)
    ORDER BY p.created_at DESC
    LIMIT ? OFFSET ?
  `).all(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`, parseInt(limit), offset);

  const softwares = db.prepare(`
    SELECT * FROM softwares
    WHERE is_hidden = 0 AND (name LIKE ? OR description LIKE ? OR tags LIKE ?)
    ORDER BY download_count DESC
    LIMIT 10
  `).all(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);

  const users = db.prepare(`
    SELECT id, uid, nickname, avatar, level, signature
    FROM users
    WHERE nickname LIKE ?
    LIMIT 10
  `).all(`%${keyword}%`);

  res.json({
    code: 200,
    data: {
      posts: { list: posts, page: parseInt(page), limit: parseInt(limit) },
      softwares,
      users,
    },
  });
});

// 获取话题列表
router.get('/topics/list', (req, res) => {
  const db = getDb();
  const topics = db.prepare('SELECT * FROM topics ORDER BY is_hot DESC, posts_count DESC').all();
  res.json({ code: 200, data: topics });
});

module.exports = router;
