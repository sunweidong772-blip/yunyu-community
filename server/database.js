const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

let SQL;
let db;
let dbReady = false;

async function initDatabase() {
  const dbDir = path.join(__dirname, 'data');
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  const dbPath = process.env.DB_PATH || path.join(__dirname, 'data', 'yunyu.db');

  if (!SQL) {
    SQL = await initSqlJs();
  }

  if (fs.existsSync(dbPath)) {
    const fileBuffer = fs.readFileSync(dbPath);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  createTables();
  createInitialData();
  saveDatabase();

  dbReady = true;
  console.log('✅ 数据库初始化完成');
  return db;
}

function saveDatabase() {
  if (!db) return;
  try {
    const dbPath = process.env.DB_PATH || path.join(__dirname, 'data', 'yunyu.db');
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(dbPath, buffer);
  } catch (error) {
    console.error('保存数据库失败:', error.message);
  }
}

function exec(sql) {
  if (!db) throw new Error('数据库未初始化');
  const statements = sql.split(';').filter(s => s.trim());
  statements.forEach(stmt => {
    db.run(stmt.trim());
  });
  saveDatabase();
}

function prepare(sql) {
  if (!db) throw new Error('数据库未初始化');
  return {
    run(...params) {
      let finalSql = sql;
      let paramIndex = 0;
      finalSql = finalSql.replace(/\?/g, () => {
        const param = params[paramIndex++];
        if (param === null || param === undefined) return 'NULL';
        if (typeof param === 'number') return String(param);
        return `'${String(param).replace(/'/g, "''")}'`;
      });
      db.run(finalSql);
      const result = db.exec('SELECT last_insert_rowid() as id, changes() as changes');
      const lastInsertRowid = result[0]?.values[0]?.[0] || 0;
      const changes = result[0]?.values[0]?.[1] || 0;
      saveDatabase();
      return { lastInsertRowid, changes };
    },
    get(...params) {
      let finalSql = sql;
      let paramIndex = 0;
      finalSql = finalSql.replace(/\?/g, () => {
        const param = params[paramIndex++];
        if (param === null || param === undefined) return 'NULL';
        if (typeof param === 'number') return String(param);
        return `'${String(param).replace(/'/g, "''")}'`;
      });
      const results = db.exec(finalSql);
      if (results.length === 0 || results[0].values.length === 0) return undefined;
      const columns = results[0].columns;
      const values = results[0].values[0];
      const row = {};
      columns.forEach((col, i) => { row[col] = values[i]; });
      return row;
    },
    all(...params) {
      let finalSql = sql;
      let paramIndex = 0;
      finalSql = finalSql.replace(/\?/g, () => {
        const param = params[paramIndex++];
        if (param === null || param === undefined) return 'NULL';
        if (typeof param === 'number') return String(param);
        return `'${String(param).replace(/'/g, "''")}'`;
      });
      const results = db.exec(finalSql);
      if (results.length === 0) return [];
      const columns = results[0].columns;
      return results[0].values.map(values => {
        const row = {};
        columns.forEach((col, i) => { row[col] = values[i]; });
        return row;
      });
    },
  };
}

function createTables() {
  exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      uid TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      nickname TEXT UNIQUE NOT NULL,
      avatar TEXT DEFAULT '',
      signature TEXT DEFAULT '',
      level INTEGER DEFAULT 1,
      exp INTEGER DEFAULT 0,
      continuous_checkin INTEGER DEFAULT 0,
      total_checkin INTEGER DEFAULT 0,
      last_checkin_date TEXT DEFAULT '',
      likes_received INTEGER DEFAULT 0,
      posts_count INTEGER DEFAULT 0,
      comments_count INTEGER DEFAULT 0,
      favorites_count INTEGER DEFAULT 0,
      followers_count INTEGER DEFAULT 0,
      following_count INTEGER DEFAULT 0,
      status TEXT DEFAULT 'active',
      email_verified INTEGER DEFAULT 0,
      role TEXT DEFAULT 'user',
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS email_verification_codes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL,
      code TEXT NOT NULL,
      type TEXT DEFAULT 'register',
      expires_at TEXT NOT NULL,
      used INTEGER DEFAULT 0,
      attempts INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS login_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      token TEXT NOT NULL,
      device TEXT DEFAULT '',
      ip TEXT DEFAULT '',
      expires_at TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      images TEXT DEFAULT '[]',
      tags TEXT DEFAULT '[]',
      topic_id INTEGER,
      software_id INTEGER,
      category TEXT DEFAULT '推荐',
      views INTEGER DEFAULT 0,
      likes_count INTEGER DEFAULT 0,
      comments_count INTEGER DEFAULT 0,
      favorites_count INTEGER DEFAULT 0,
      is_top INTEGER DEFAULT 0,
      is_essence INTEGER DEFAULT 0,
      is_hidden INTEGER DEFAULT 0,
      status TEXT DEFAULT 'published',
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      parent_id INTEGER DEFAULT 0,
      reply_to_user_id INTEGER,
      content TEXT NOT NULL,
      likes_count INTEGER DEFAULT 0,
      is_hidden INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS likes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      target_type TEXT NOT NULL,
      target_id INTEGER NOT NULL,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      UNIQUE(user_id, target_type, target_id)
    );

    CREATE TABLE IF NOT EXISTS favorites (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      target_type TEXT NOT NULL,
      target_id INTEGER NOT NULL,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      UNIQUE(user_id, target_type, target_id)
    );

    CREATE TABLE IF NOT EXISTS follows (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      follower_id INTEGER NOT NULL,
      following_id INTEGER NOT NULL,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      UNIQUE(follower_id, following_id)
    );

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      from_user_id INTEGER,
      type TEXT NOT NULL,
      title TEXT DEFAULT '',
      content TEXT NOT NULL,
      target_type TEXT DEFAULT '',
      target_id INTEGER DEFAULT 0,
      is_read INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS private_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      from_user_id INTEGER NOT NULL,
      to_user_id INTEGER NOT NULL,
      content TEXT NOT NULL,
      is_read INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS softwares (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      icon TEXT DEFAULT '',
      description TEXT DEFAULT '',
      screenshots TEXT DEFAULT '[]',
      category TEXT NOT NULL,
      version TEXT DEFAULT '1.0.0',
      size TEXT DEFAULT '0MB',
      developer TEXT DEFAULT '',
      download_url TEXT DEFAULT '',
      download_count INTEGER DEFAULT 0,
      favorite_count INTEGER DEFAULT 0,
      rating REAL DEFAULT 5.0,
      rating_count INTEGER DEFAULT 0,
      tags TEXT DEFAULT '[]',
      update_log TEXT DEFAULT '',
      is_recommended INTEGER DEFAULT 0,
      is_hot INTEGER DEFAULT 0,
      is_essence INTEGER DEFAULT 0,
      is_hidden INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS software_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      icon TEXT DEFAULT '',
      sort_order INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS software_collections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      cover TEXT DEFAULT '',
      description TEXT DEFAULT '',
      software_ids TEXT DEFAULT '[]',
      sort_order INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS topics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      description TEXT DEFAULT '',
      icon TEXT DEFAULT '',
      posts_count INTEGER DEFAULT 0,
      is_hot INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS checkin_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      checkin_date TEXT NOT NULL,
      exp_reward INTEGER DEFAULT 10,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      UNIQUE(user_id, checkin_date)
    );

    CREATE TABLE IF NOT EXISTS exp_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      exp_change INTEGER NOT NULL,
      reason TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      type TEXT DEFAULT 'daily',
      target_count INTEGER DEFAULT 1,
      exp_reward INTEGER DEFAULT 10,
      icon TEXT DEFAULT '',
      sort_order INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS user_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      task_id INTEGER NOT NULL,
      progress INTEGER DEFAULT 0,
      completed INTEGER DEFAULT 0,
      completed_date TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      UNIQUE(user_id, task_id, completed_date)
    );

    CREATE TABLE IF NOT EXISTS reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reporter_id INTEGER NOT NULL,
      target_type TEXT NOT NULL,
      target_id INTEGER NOT NULL,
      reason TEXT NOT NULL,
      description TEXT DEFAULT '',
      status TEXT DEFAULT 'pending',
      handler_id INTEGER,
      handle_result TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      handled_at TEXT
    );

    CREATE TABLE IF NOT EXISTS announcements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      type TEXT DEFAULT 'system',
      is_top INTEGER DEFAULT 0,
      is_published INTEGER DEFAULT 1,
      publish_at TEXT DEFAULT (datetime('now', 'localtime')),
      created_by INTEGER,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS admins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER UNIQUE NOT NULL,
      role TEXT DEFAULT 'admin',
      permissions TEXT DEFAULT '[]',
      created_at TEXT DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS operation_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      admin_id INTEGER NOT NULL,
      action TEXT NOT NULL,
      target_type TEXT DEFAULT '',
      target_id INTEGER DEFAULT 0,
      detail TEXT DEFAULT '',
      ip TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      token TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      used INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now', 'localtime'))
    );
  `);
}

function createInitialData() {
  const adminEmail = process.env.SUPER_ADMIN_EMAIL || 'admin@yunyu.com';
  const adminPassword = process.env.SUPER_ADMIN_PASSWORD || 'admin123';
  const adminNickname = process.env.SUPER_ADMIN_NICKNAME || '云屿岛主';

  const existingAdmin = prepare('SELECT id FROM users WHERE email = ?').get(adminEmail);
  if (!existingAdmin) {
    const hashedPassword = bcrypt.hashSync(adminPassword, 10);
    const uid = 'YY' + String(100000 + Math.floor(Math.random() * 900000));

    const result = prepare(`
      INSERT INTO users (uid, email, password, nickname, level, exp, role, email_verified, status)
      VALUES (?, ?, ?, ?, ?, ?, 'super_admin', 1, 'active')
    `).run(uid, adminEmail, hashedPassword, adminNickname, 10, 99999);

    prepare('INSERT INTO admins (user_id, role, permissions) VALUES (?, ?, ?)')
      .run(result.lastInsertRowid, 'super_admin', '["all"]');

    console.log('👑 超级管理员创建成功:', adminEmail);
  }

  const categories = ['应用', '游戏', '工具', '社交', '娱乐', '学习', '效率', '系统', '摄影', '音乐', '视频', '其他'];
  categories.forEach((cat, index) => {
    prepare('INSERT OR IGNORE INTO software_categories (name, sort_order) VALUES (?, ?)').run(cat, index);
  });

  const tasks = [
    { name: '每日签到', description: '每天签到获得经验', type: 'daily', target_count: 1, exp_reward: 10, icon: '📅' },
    { name: '发布帖子', description: '发布一篇帖子', type: 'daily', target_count: 1, exp_reward: 20, icon: '📝' },
    { name: '评论互动', description: '评论3条帖子', type: 'daily', target_count: 3, exp_reward: 15, icon: '💬' },
    { name: '点赞支持', description: '点赞5个内容', type: 'daily', target_count: 5, exp_reward: 10, icon: '👍' },
    { name: '浏览软件', description: '浏览10个软件', type: 'daily', target_count: 10, exp_reward: 10, icon: '📱' },
    { name: '收藏内容', description: '收藏2个内容', type: 'daily', target_count: 2, exp_reward: 10, icon: '⭐' },
  ];
  tasks.forEach((task, index) => {
    prepare('INSERT OR IGNORE INTO tasks (name, description, type, target_count, exp_reward, icon, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(task.name, task.description, task.type, task.target_count, task.exp_reward, task.icon, index);
  });

  const topics = ['云屿闲聊', '软件推荐', '游戏讨论', '技术交流', '求助问答', '资源分享', '每日打卡', '吐槽专区'];
  topics.forEach((topic, index) => {
    prepare('INSERT OR IGNORE INTO topics (name, description, is_hot) VALUES (?, ?, ?)').run(topic, `关于${topic}的讨论`, index < 3 ? 1 : 0);
  });

  const existingAnnouncement = prepare('SELECT id FROM announcements LIMIT 1').get();
  if (!existingAnnouncement) {
    prepare(`
      INSERT INTO announcements (title, content, type, is_top, is_published)
      VALUES (?, ?, 'system', 1, 1)
    `).run('欢迎来到云屿', '云屿是一个年轻、温暖、有陪伴感的软件聚合社区。在这里你可以发现优质软件、交流使用心得、结识志同道合的朋友。');
  }
}

function getDb() {
  return { exec, prepare };
}

module.exports = { initDatabase, getDb, saveDatabase };
