# 云屿社区

年轻、温暖、有陪伴感的软件聚合社区App。

## 项目介绍

云屿是一个软件聚合 + 软件资源库 + 兴趣社区 + 用户成长体系 + 社交互动 + 邮箱账号体系 + 内容管理 + 管理后台的完整社区应用。

## 技术栈

- **前端**: Flutter 3.16+
- **后端**: Node.js + Express + sql.js
- **状态管理**: Provider
- **网络请求**: http
- **本地存储**: shared_preferences

## 功能特性

### 用户端
- 邮箱注册/登录（邮箱验证码）
- 首页（Banner、快捷入口、推荐软件、社区热门）
- 社区（帖子列表、发帖、评论、点赞、收藏）
- 软件库（软件分类、软件详情、下载、收藏）
- 消息（点赞、评论、关注、系统通知、私信）
- 个人中心（等级、经验、签到、任务、收藏）

### 管理端
- Dashboard数据统计
- 用户管理（等级、经验、禁言、封禁）
- 内容管理（帖子、评论）
- 软件管理（添加、编辑、删除）
- 举报处理
- 公告管理
- 话题管理

## 后端部署

```bash
cd server
npm install
node index.js
```

后端默认运行在3001端口。

## 前端打包

```bash
cd app
flutter pub get
flutter build apk --release
```

## API地址

后端API地址: `http://8.160.178.28:3001/api`

## 管理员账号

- 邮箱: 3750481994@qq.com
- 密码: yunyu2024admin

## 项目结构

```
yunyu_community/
├── app/                    # Flutter前端
│   ├── lib/
│   │   ├── main.dart       # 入口文件
│   │   ├── main_screen.dart # 主页面（底部导航）
│   │   ├── models/         # 数据模型
│   │   ├── services/       # API服务
│   │   ├── providers/      # 状态管理
│   │   ├── screens/        # 页面
│   │   ├── widgets/        # 通用组件
│   │   └── utils/          # 工具类
│   └── android/            # Android配置
├── server/                 # Node.js后端
│   ├── index.js            # 入口文件
│   ├── database.js         # 数据库
│   ├── emailService.js     # 邮箱服务
│   ├── middleware/         # 中间件
│   └── routes/             # 路由
└── .github/workflows/      # GitHub Actions
```

## 版本

v1.0.0
