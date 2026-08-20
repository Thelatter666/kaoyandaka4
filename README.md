# 砚台考研打卡

个人本地使用的考研学习管理网站，目标用户 1 人。考试日期：**2026 年 12 月 20 日**。

## 功能概览

| 页面 | 功能 |
|---|---|
| 🏠 首页 | 考试倒计时、今日专注摘要、任务概览、最近预设 |
| 📋 计划 | 每日任务管理（添加/完成/编辑/排序/删除） |
| ⚙️ 预设 | 学习预设 CRUD，按数学/英语/408 分组，锁定科目快速创建 |
| 🍅 番茄钟 | 预设选择 → 时长调整 → 专注计时 → 休息；第 4 轮自动长休 |
| 📺 网课 | 7 分区课程管理、文本粘贴导入集数、双进度条（集数+时长） |
| 🌳 统计 | 学习森林（日/周/月）、三科树木可视化、累计成果、时间线 |
| 📝 复盘 | 历史复盘浏览/编辑/补写（日历选日期、倒序列表） |
| 🔒 数据 | 全量备份导出（`yantai-backup-*.json`）、导入恢复（差异预览 + 覆盖/合并）、**本地模式**（浏览器 IndexedDB 离线使用，与服务器互通） |

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | React 18 + TypeScript + Vite |
| 后端 | Express 4 + TypeScript |
| 数据库 | MySQL 8 + mysql2/promise |
| 校验 | Zod（前后端共享） |
| 本地存储 | IndexedDB（本地模式，浏览器内，与 MySQL 并存互通） |
| 测试 | Vitest + Playwright + fake-indexeddb |
| Lint | ESLint |

## 快速开始

### 环境要求

- Node.js ≥ 20
- MySQL 8（本地运行）

### 1. 配置环境变量

```bash
cp .env.example .env
```

编辑 `.env`，填入你的 MySQL 密码：

```env
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=你的密码
DB_NAME=kaoyandaily
```

### 2. 初始化数据库

```bash
npm install
npm run db:init
```

### 3. 启动

```bash
npm run dev
```

- 前端：http://localhost:5173
- 后端 API：http://localhost:3001

或者直接双击桌面的 **砚台考研打卡.command** 一键启动。

## 项目结构

```
kaoyandaily/
├── client/src/           # React 前端
│   ├── api/              #   API 封装（9 个模块，服务器/本地双后端分支）
│   ├── local/            #   本地模式数据层（IndexedDB：数据/账户/模式开关）
│   ├── components/       #   UI / 布局 / 预设 / 计时器 / 任务
│   ├── pages/            #   11 个页面
│   ├── hooks/            #   自定义 Hooks
│   ├── styles/           #   CSS 主题 Token + 全局样式
│   └── utils/            #   日期 / 时长 / 无障碍 / 本地统计·导入
├── server/src/           # Express 后端
│   ├── routes/           #   10 个路由（完整 CRUD + 导出/导入）
│   ├── db/               #   连接池 + 事务包装 + 建表 SQL
│   └── middleware/        #   CORS / 校验 / 鉴权 / 错误处理
├── shared/src/           # 前后端共享
│   ├── schemas/          #   Zod 校验 Schema（含备份格式 v1）
│   └── types/            #   TypeScript 类型
├── e2e/                  # Playwright E2E 测试
└── 桌面快捷方式.command    # 一键启动脚本
```

## 命令

```bash
npm run dev          # 启动前后端开发服务器
npm run build        # 构建生产版本
npm test             # 运行单元/集成测试
npm run test:e2e     # 运行 E2E 测试
npm run lint         # 代码检查
npm run db:init      # 初始化数据库
```

## 数据库

9 张表（users + 8 张业务表）：

| 表 | 说明 |
|---|---|
| `study_presets` | 学习预设（科目、时长） |
| `daily_tasks` | 每日任务（内容、完成状态、排序） |
| `daily_reviews` | 每日复盘 |
| `online_courses` | 网课 |
| `course_episodes` | 网课集数 |
| `focus_sessions` | 专注会话（番茄钟记录） |
| `users` | 用户账号（邮箱、密码哈希） |
| `user_settings` | 用户偏好键值（如番茄钟提示音开关） |
| `study_records` | 学习记录（快照存储，删除课程不丢失） |

## 设计原则

- 账号系统：邮箱 + 密码注册/登录，会话存 MySQL（7 天有效）
- **双数据模式**：服务器（MySQL）与本地（IndexedDB）并存、互不干扰，通过备份文件互通
- **数据可迁移**：全量导出为单个 JSON，可导入恢复（未登录建号导入 / 已登录差异预览 + 覆盖或合并）
- 删除操作为永久删除，不设回收站
- 学习记录使用快照保存，原实体删除后记录仍保留
- 统计去重：同一学习行为仅计一次
- 每满 1 小时专注种一棵树（按科目独立计算）
- 所有删除操作二次确认，关键操作防重复提交
