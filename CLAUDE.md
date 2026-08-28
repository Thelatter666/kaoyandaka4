# 精简入口

> 本文件仅为入口指引，**权威文档是根目录 `AGENT.md`**（技术栈、架构、决策、工作流全量覆盖）。两处如有冲突，以 AGENT.md 为准。

## 一键速查

- 领域术语：`CONTEXT.md`
- 架构/目录/组件/端点/部署枚举：`ARCHITECTURE.md`
- 动效计划总账：`plans/README.md`
- 事故教训与操作红线：`memory.md` + `AGENT.md`「项目级 AI 工具与约定」
- 项目一句话：个人考研学习管理网站（React SPA + Express API + MySQL），考试日期 2026-12-20

## 关键命令（根目录执行）

```bash
npm run dev          # 前后端同启（client 5173 / server 3001，vite proxy /api）
npm run test         # Vitest 单元/集成（环境为 node，非 jsdom）
npm run test:e2e     # Playwright 冒烟（需 dev server，真实会话认证）
npm run lint         # ESLint 9 flat config
npm run build        # client: vite build + server: tsc
npm run db:init      # 初始化/重置数据库（会自动跑 migrate）
```

## 红线（完整版见 AGENT.md）

- 修改已有文件前**先 Read**；密钥/配置文件先 `cp file file.bak`
- 用户说「写到/放入/添加」= 追加，除非明确说「覆盖/替换」
- 组件 CSS 必须用 `var(--color-xxx)` token（`client/src/styles/tokens.css`），禁硬编码颜色
- 新接口必须走 `validate()` Zod 中间件；`user_id` 永不接受客户端传入
- 勿破坏 `client/vite.config.ts` 的 manualChunks vendor 分包
- 任何代码修改须走 AGENT.md 的 10 步工作流，**用户明确下令前绝不 commit/merge/push**
