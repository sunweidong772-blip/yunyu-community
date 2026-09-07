const express = require('express');
const { getDb } = require('../database');
const { authMiddleware, optionalAuthMiddleware } = require('../middleware/auth');

const router = express.Router();

// 等级配置
const LEVEL_CONFIG = [
  { level: 1, name: '新人', minExp: 0 },
  { level: 2, name: '初来乍到', minExp: 100 },
  { level: 3, name: '云屿居民', minExp: 300 },
  { level: 4, name: '活跃居民', minExp: 600 },
  { level: 5, name: '热心用户', minExp: 1000 },
  { level: 6, name: '云屿达人', minExp: 1600 },
  { level: 7, name: '资深居民', minExp: 2400 },
  { level: 8, name: '云屿精英', minExp: 3500 },
  { level: 9, name: '云屿核心', minExp: 5000 },
  { level: 10, name: '云屿元老', minExp: 8000 },
];

function calculateLevel(exp) {
  let level = 1;
  for (const config of LEVEL_CONFIG) {
    if (exp >= config.minExp) {
      level = config.level;
    }
  }
  return level;
}

function addExp(db, userId, exp, reason) {
  const user = db.prepare('SELECT exp, level FROM users WHERE id = ?').get(userId);
  const newExp = user.exp + exp;
  const newLevel = calculateLevel(newExp);

  db.prepare('UPDATE users SET exp = ?, level = ?, updated_at = datetime("now", "localtime") WHERE id = ?')
    .run(newExp, newLevel, userId);

  db.prepare('INSERT INTO exp_logs (user_id, exp_change, reason) VALUES (?, ?, ?)')
    .run(userId, exp, reason);

  return { newExp, newLevel, leveledUp: newLevel > user.level };
}

// 获取用户主页
router.get('/:id', optionalAuthMiddleware, (req, res) => {
  const { id } = req.params;
  const db = getDb();

  const user = db.prepare(`
    SELECT id, uid, nickname, avatar, signature, level, exp, 
           continuous_checkin, total_checkin, likes_received, posts_count, 
           comments_count, favorites_count, followers_count, following_count,
           role, created_at
    FROM users WHERE id = ? OR uid = ?
  `).get(id, id);

  if (!user) {
    return res.status(404).json({ code: 404, message: '用户不存在' });
  }

  // 计算等级信息
  const currentLevelConfig = LEVEL_CONFIG.find(l => l.level === user.level) || LEVEL_CONFIG[0];
  const nextLevelConfig = LEVEL_CONFIG.find(l => l.level === user.level + 1);

  let isFollowing = false;
  if (req.user) {
    const follow = db.prepare('SELECT id FROM follows WHERE follower_id = ? AND following_id = ?').get(req.user.id, user.id);
    isFollowing = !!follow;
  }

  res.json({
    code: 200,
    data: {
      ...user,
      level_name: currentLevelConfig.name,
      next_level_exp: nextLevelConfig ? nextLevelConfig.minExp : null,
      is_following: isFollowing,
    },
  });
});

// 更新用户资料
router.put('/profile', authMiddleware, (req, res) => {
  const { nickname, avatar, signature } = req.body;
  const db = getDb();

  if (nickname) {
    if (nickname.length < 2 || nickname.length > 20) {
      return res.status(400).json({ code: 400, message: '昵称长度2-20个字符' });
    }
    const existing = db.prepare('SELECT id FROM users WHERE nickname = ? AND id != ?').get(nickname, req.user.id);
    if (existing) {
      return res.status(409).json({ code: 409, message: '该昵称已被使用' });
    }
  }

  db.prepare(`
    UPDATE users SET 
      nickname = COALESCE(?, nickname),
      avatar = COALESCE(?, avatar),
      signature = COALESCE(?, signature),
      updated_at = datetime("now", "localtime")
    WHERE id = ?
  `).run(nickname || null, avatar || null, signature || null, req.user.id);

  const user = db.prepare('SELECT id, uid, nickname, avatar, signature, level, exp, role FROM users WHERE id = ?').get(req.user.id);
  res.json({ code: 200, message: '资料更新成功', data: user });
});

// 关注/取消关注
router.post('/:id/follow', authMiddleware, (req, res) => {
  const { id } = req.params;
  const db = getDb();

  if (parseInt(id) === req.user.id) {
    return res.status(400).json({ code: 400, message: '不能关注自己' });
  }

  const targetUser = db.prepare('SELECT id FROM users WHERE id = ?').get(id);
  if (!targetUser) {
    return res.status(404).json({ code: 404, message: '用户不存在' });
  }

  const existingFollow = db.prepare('SELECT id FROM follows WHERE follower_id = ? AND following_id = ?').get(req.user.id, id);

  if (existingFollow) {
    // 取消关注
    db.prepare('DELETE FROM follows WHERE id = ?').run(existingFollow.id);
    db.prepare('UPDATE users SET following_count = following_count - 1 WHERE id = ?').run(req.user.id);
    db.prepare('UPDATE users SET followers_count = followers_count - 1 WHERE id = ?').run(id);
    res.json({ code: 200, message: '已取消关注', data: { is_following: false } });
  } else {
    // 关注
    db.prepare('INSERT INTO follows (follower_id, following_id) VALUES (?, ?)').run(req.user.id, id);
    db.prepare('UPDATE users SET following_count = following_count + 1 WHERE id = ?').run(req.user.id);
    db.prepare('UPDATE users SET followers_count = followers_count + 1 WHERE id = ?').run(id);

    // 发送消息
    db.prepare(`
      INSERT INTO messages (user_id, from_user_id, type, title, content, target_type, target_id)
      VALUES (?, ?, 'follow', '新的关注', ?, 'user', ?)
    `).run(id, req.user.id, `${req.user.nickname} 关注了你`, req.user.id);

    addExp(db, req.user.id, 5, '关注用户');

    res.json({ code: 200, message: '关注成功', data: { is_following: true } });
  }
});

// 获取粉丝列表
router.get('/:id/followers', (req, res) => {
  const { id } = req.params;
  const { page = 1, limit = 20 } = req.query;
  const db = getDb();

  const offset = (page - 1) * limit;
  const followers = db.prepare(`
    SELECT u.id, u.uid, u.nickname, u.avatar, u.level, u.signature
    FROM follows f
    JOIN users u ON f.follower_id = u.id
    WHERE f.following_id = ?
    ORDER BY f.created_at DESC
    LIMIT ? OFFSET ?
  `).all(id, parseInt(limit), offset);

  const total = db.prepare('SELECT COUNT(*) as count FROM follows WHERE following_id = ?').get(id).count;

  res.json({ code: 200, data: { list: followers, total, page: parseInt(page), limit: parseInt(limit) } });
});

// 获取关注列表
router.get('/:id/following', (req, res) => {
  const { id } = req.params;
  const { page = 1, limit = 20 } = req.query;
  const db = getDb();

  const offset = (page - 1) * limit;
  const following = db.prepare(`
    SELECT u.id, u.uid, u.nickname, u.avatar, u.level, u.signature
    FROM follows f
    JOIN users u ON f.following_id = u.id
    WHERE f.follower_id = ?
    ORDER BY f.created_at DESC
    LIMIT ? OFFSET ?
  `).all(id, parseInt(limit), offset);

  const total = db.prepare('SELECT COUNT(*) as count FROM follows WHERE follower_id = ?').get(id).count;

  res.json({ code: 200, data: { list: following, total, page: parseInt(page), limit: parseInt(limit) } });
});

// 获取用户帖子
router.get('/:id/posts', (req, res) => {
  const { id } = req.params;
  const { page = 1, limit = 20 } = req.query;
  const db = getDb();

  const offset = (page - 1) * limit;
  const posts = db.prepare(`
    SELECT p.*, u.nickname, u.avatar, u.level
    FROM posts p
    JOIN users u ON p.user_id = u.id
    WHERE p.user_id = ? AND p.is_hidden = 0 AND p.status = 'published'
    ORDER BY p.created_at DESC
    LIMIT ? OFFSET ?
  `).all(id, parseInt(limit), offset);

  const total = db.prepare('SELECT COUNT(*) as count FROM posts WHERE user_id = ? AND is_hidden = 0 AND status = "published"').get(id).count;

  res.json({ code: 200, data: { list: posts, total, page: parseInt(page), limit: parseInt(limit) } });
});

// 获取用户收藏
router.get('/:id/favorites', authMiddleware, (req, res) => {
  const { id } = req.params;
  if (parseInt(id) !== req.user.id) {
    return res.status(403).json({ code: 403, message: '只能查看自己的收藏' });
  }

  const { page = 1, limit = 20, type = 'post' } = req.query;
  const db = getDb();
  const offset = (page - 1) * limit;

  let favorites;
  if (type === 'post') {
    favorites = db.prepare(`
      SELECT p.*, u.nickname, u.avatar, u.level
      FROM favorites f
      JOIN posts p ON f.target_id = p.id
      JOIN users u ON p.user_id = u.id
      WHERE f.user_id = ? AND f.target_type = 'post' AND p.is_hidden = 0
      ORDER BY f.created_at DESC
      LIMIT ? OFFSET ?
    `).all(req.user.id, parseInt(limit), offset);
  } else {
    favorites = db.prepare(`
      SELECT s.*
      FROM favorites f
      JOIN softwares s ON f.target_id = s.id
      WHERE f.user_id = ? AND f.target_type = 'software' AND s.is_hidden = 0
      ORDER BY f.created_at DESC
      LIMIT ? OFFSET ?
    `).all(req.user.id, parseInt(limit), offset);
  }

  res.json({ code: 200, data: { list: favorites, page: parseInt(page), limit: parseInt(limit) } });
});

// 签到
router.post('/checkin', authMiddleware, (req, res) => {
  const db = getDb();
  const today = new Date().toISOString().split('T')[0];

  const existingCheckin = db.prepare('SELECT id FROM checkin_records WHERE user_id = ? AND checkin_date = ?').get(req.user.id, today);
  if (existingCheckin) {
    return res.status(400).json({ code: 400, message: '今日已签到' });
  }

  const user = db.prepare('SELECT continuous_checkin FROM users WHERE id = ?').get(req.user.id);
  const newContinuous = user.continuous_checkin + 1;
  const expReward = Math.min(10 + (newContinuous - 1) * 2, 30);

  db.prepare('INSERT INTO checkin_records (user_id, checkin_date, exp_reward) VALUES (?, ?, ?)')
    .run(req.user.id, today, expReward);

  db.prepare(`
    UPDATE users SET 
      continuous_checkin = ?, 
      total_checkin = total_checkin + 1,
      last_checkin_date = ?,
      updated_at = datetime("now", "localtime")
    WHERE id = ?
  `).run(newContinuous, today, req.user.id);

  const result = addExp(db, req.user.id, expReward, '每日签到');

  // 更新任务进度
  const checkinTask = db.prepare("SELECT id FROM tasks WHERE name = '每日签到'").get();
  if (checkinTask) {
    db.prepare(`
      INSERT OR IGNORE INTO user_tasks (user_id, task_id, progress, completed, completed_date)
      VALUES (?, ?, 1, 1, ?)
    `).run(req.user.id, checkinTask.id, today);
  }

  res.json({
    code: 200,
    message: `签到成功，获得${expReward}经验`,
    data: {
      exp_reward: expReward,
      continuous_checkin: newContinuous,
      new_exp: result.newExp,
      new_level: result.newLevel,
      leveled_up: result.leveledUp,
    },
  });
});

// 获取签到记录
router.get('/checkin/records', authMiddleware, (req, res) => {
  const db = getDb();
  const { month } = req.query;

  const records = db.prepare(`
    SELECT checkin_date, exp_reward
    FROM checkin_records
    WHERE user_id = ? AND checkin_date LIKE ?
    ORDER BY checkin_date
  `).all(req.user.id, `${month || new Date().toISOString().slice(0, 7)}%`);

  res.json({ code: 200, data: records });
});

// 获取每日任务
router.get('/tasks/daily', authMiddleware, (req, res) => {
  const db = getDb();
  const today = new Date().toISOString().split('T')[0];

  const tasks = db.prepare('SELECT * FROM tasks WHERE type = "daily" ORDER BY sort_order').all();

  const taskList = tasks.map(task => {
    const userTask = db.prepare(`
      SELECT progress, completed FROM user_tasks 
      WHERE user_id = ? AND task_id = ? AND completed_date = ?
    `).get(req.user.id, task.id, today);

    return {
      ...task,
      progress: userTask ? userTask.progress : 0,
      completed: userTask ? userTask.completed : 0,
    };
  });

  res.json({ code: 200, data: taskList });
});

// 等级列表
router.get('/levels/list', (req, res) => {
  res.json({ code: 200, data: LEVEL_CONFIG });
});

module.exports = router;
module.exports.addExp = addExp;
module.exports.calculateLevel = calculateLevel;
