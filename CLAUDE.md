# Project Instructions

> 完整权威文档见 **`AGENT.md`**（技术栈、架构、约定、部署、工作流全量覆盖）。本文件为精简入口 + 增量修正，两处如有冲突以 AGENT.md 为准。

## 项目一句话

砚台考研打卡 —— 个人本地使用的考研学习管理网站（React SPA + Express API + MySQL），目标用户 1 人，考试日期 2026-12-20。

## 关键命令（根目录执行）

```bash
npm run dev            # 前后端同启（client 5173 / server 3001，vite proxy /api）
npm run test           # Vitest 单元/集成（passWithNoTests）
npm run test:e2e       # Playwright 冒烟（需 dev server，真实会话认证）
npm run lint           # ESLint 9 flat config
npm run build          # client: vite build + server: tsc
npm run db:init        # 初始化/重置数据库（会自动跑 migrate）
```

## 结构速览

```
client/src/   React SPA（hash 路由，无 React Router；React.lazy 代码分割 + hover 预取）
  pages/     页面组件 + 同名 co-located CSS；components/ui/ 通用组件
server/src/  Express 路由（8 个 route 文件）；middleware/auth.js = requireAuth 会话鉴权
shared/src/  Zod schema + 推断类型（@shared alias 前端引用；服务端相对路径导入）
plans/       编号实现计划 md（先写计划再实现）；docs/ 交接文档/ = 设计文档
deploy/      nginx.conf + deploy.sh（生产：nginx 反代 → 3001）
```

## 增量修正（AGENT.md 已过时处）

- **单元测试已存在**：`client/src/utils/sound.test.ts`（番茄钟提示音引擎），并非"尚无单元测试文件"。新增逻辑请按 `**/*.test.ts(x)` 惯例补测，Vitest 配置在根目录 `vitest.config.ts`（排除 e2e/）。

## 开发工作流（AGENT.md 2026-08-12 修订，硬性约束）

任何代码修改必须走 10 步流程，**每阶段需用户确认**：

1. 提需求 → 2. 探索理解 → 3. 复述对齐（用户确认后才动手）→ 4. 新建分支（从 main，如 `feat/xxx`，禁止直接改 main）→ 5. 执行任务（加载 `mywf` skill）→ 6. 效果确认（只汇报效果，用户亲自检查）→ 7. 用户下达 commit/merge 指令（**用户明确下令前绝不 commit/merge/push**）→ 8. 合并 main → 9. push 远端 → 10. 按 manage-server skill 部署服务器

## 红线

- 修改已有文件前**先 Read**；密钥/配置文件先 `cp file file.bak`
- 用户说"写到/放入/添加"= 追加，除非明确说"覆盖/替换"
- 组件 CSS 必须用 `var(--color-xxx)` token（`client/src/styles/tokens.css`），禁硬编码颜色
- 新接口必须走 `validate()` Zod 中间件；`user_id` 永不接受客户端传入
- 勿破坏 `client/vite.config.ts` 的 manualChunks vendor 分包
