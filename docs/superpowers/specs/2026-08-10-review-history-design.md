# 每日复盘回顾（独立复盘页）— 设计文档

- 日期：2026-08-10
- 分支：`feat/review-history`
- 规模：中量（新页面 + 新端点 + 导航改造）

## 背景与目标

每日复盘目前只能写、不能回顾：入口仅在计划页（今天/明天切换），历史复盘无任何查看入口；后端仅 `GET /reviews?date=` 单日接口。目标：独立复盘页，倒序浏览全部历史复盘，支持编辑与补写。

已确认需求约束：

- **独立复盘页**（顶栏导航新增「复盘」入口）
- **单页双栏**：左栏有复盘记录的日期列表（倒序），右栏所选日期的复盘详情
- 历史复盘**可编辑、可补写**（复用现有 upsert 逻辑）
- 不做删除、不做分页、不关联任务/专注统计

## 核心假设

- **H1**：复盘数据量小（个人每日一条），历史接口一次性返回全部记录（含 content 全文），列表加载即得全文，选中某日期无需二次请求单日接口。
- **H2**：补写无复盘日期的路径 = 右栏日期选择器选日期 → 输入 → 保存（upsert）。
- **H3**：计划页与复盘页可能编辑同一日期，最后写赢即可（个人使用，并发冲突概率趋零）。
- **H4**：复盘日期允许未来（与计划页「明天」语义一致），不限制。

## 显式权衡

| 取舍 | 选择 | 理由 |
|------|------|------|
| 列表接口：`/reviews/history` vs 复用 `/reviews?date=` | 新增 `GET /api/v1/reviews/history` | 单日接口语义不变；历史接口一次性取全部，H1 成立 |
| 未保存切换确认：ConfirmDialog vs 静默丢弃 | ConfirmDialog（destructive=false） | 防丢字；项目已有现成组件，风格一致 |
| 移动端布局：堆叠 vs 隐藏列表 | 窄屏列表横向滚动置顶 | 保留双栏信息结构，最小实现成本 |
| 导航图标 | lucide `NotebookPen` | 与现有 lucide 图标集一致 |

## 边界外声明

- 不做复盘删除（用户明确排除）
- 不做分页/虚拟滚动（数据量小）
- 不在复盘页展示当日任务/专注统计关联
- 计划页复盘卡保持现状（不迁入新页面）

## API 设计

### GET /api/v1/reviews/history（requireAuth 保护，挂载于既有 reviews 路由）

响应：`200 [{ id, reviewDate, content, updatedAt }]`，按 `review_date DESC` 排序；无记录返回 `[]`。

实现（`server/src/routes/reviews.ts` 追加）：

```ts
// GET /api/v1/reviews/history — 全部复盘（倒序，含全文；个人数据量小不分页）
router.get('/history', async (req, res, next) => {
  try {
    const [rows] = await pool.query<ReviewRow[]>(
      'SELECT * FROM daily_reviews WHERE user_id = ? ORDER BY review_date DESC',
      [req.userId]
    );
    res.json(rows.map(transformReview));
  } catch (err) {
    next(err);
  }
});
```

注意：Express 路由顺序——`/history` 必须在 `GET /`（按 query date 查询）之前注册或与之互不冲突（path 不同，不冲突）。现有 `GET /` 用 query 参数，`/history` 是路径参数形态，无歧义。

### 客户端

`client/src/api/reviews.ts` 追加：

```ts
getHistory: () => api.get<Review[]>('/reviews/history'),
```

复用现有 `Review` 接口（id/reviewDate/content/createdAt/updatedAt）。

## 页面设计（client/src/pages/ReviewPage.tsx + ReviewPage.css）

### 布局

- `PageShell title="复盘" subtitle="回顾每一段学习的痕迹"`，actions 槽空
- 主体双栏（`grid`，主内容 span 8 + 列表 span 4，参照 PlanPage bento 模式）：
  - **左栏**（日期列表，glass-1 卡）：顶部「日期选择器」+ 列表。列表项 = 日期（`formatDateDisplay`）+ 内容首行摘要（truncate）；选中项高亮；无复盘时列表空态（"还没有复盘，选择日期写下第一篇"）
  - **右栏**（详情卡，glass-1）：头部 = 所选日期 + 未保存状态指示；正文 textarea；底部保存按钮 + 保存状态（沿用 PlanPage 的 saving/saved/error 模式）
- 窄屏（<1024px）：左栏列表横向滚动置顶，右栏在其下

### 状态与交互

```
history: Review[]           // 列表数据（含全文）
selectedDate: string        // YYYY-MM-DD，默认 = 最新记录日期；无记录 = today()
content: string             // 右栏编辑内容（从 history 中对应项初始化）
dirty: boolean              // content 与已保存值不一致
saving: 'idle'|'saving'|'saved'|'error'
loading: boolean / error: string | null
```

- 挂载：`reviewsApi.getHistory()` → setHistory → 默认选中最新日期
- 选中日期（列表点击 / 日期选择器 change）：
  - 若 dirty → ConfirmDialog「有未保存的修改，确定切换日期吗？」（destructive=false，确认才切换）
  - 切换后 content 初始化为该日期记录内容（无记录 → 空串）
- 内容编辑：content onChange → dirty=true（若与记录不同）；saved 状态回落 idle
- 保存：`reviewsApi.upsert({ date: selectedDate, content })` → 成功：更新 history 中对应项 content + saved 状态 + toast；失败：error 状态 + toast
- 日期选择器：`<input type="date">`，无 max 限制（H4），change 走与列表点击相同的切换逻辑
- 空态：history 为空时左栏显示空态、右栏默认今天可立即写第一篇

### 路由与导航（三处联动，勿漏）

1. `client/src/App.tsx` `pageLoaders` 加 `review: () => import('./pages/ReviewPage').then((m) => ({ default: m.ReviewPage }))` + `const ReviewPage = lazy(pageLoaders.review)`
2. `App.tsx` `NAV_PREFETCH` 加 `'#/review': pageLoaders.review`
3. `App.tsx` `renderPage` 加 `case '/review': return <ReviewPage />;`
4. `TopNav.tsx` `NAV_ITEMS` 加 `{ label: '复盘', hash: '#/review', icon: NotebookPen }`（lucide import）
5. 路由守卫：'/review' 不在 PUBLIC_PAGES → 自动受保护 ✓

## 错误处理

- 列表加载失败：ErrorState + 重试按钮（项目既有模式）
- 保存失败：saving='error' + toast，内容不丢
- 未保存切换：ConfirmDialog 拦截（见上）
- 401：全局 unauthorizedHandler 已有（api client 自动触发登出）

## 测试

- 单测：无新增纯逻辑模块（upsert 复用既有 schema），暂不新增单测
- E2E：手动验证清单（Playwright MCP 验证列表加载/编辑/补写/未保存确认）

## 术语表

| 术语 | 含义 |
|------|------|
| 复盘页 | 顶栏「复盘」入口进入的独立页面 |
| 日期列表 | 左栏有复盘记录的日期倒序列表 |
| 补写 | 对无复盘记录的历史日期新增复盘 |
| dirty | 右栏内容与已保存值不一致（未保存修改） |

## ADR（对抗性审查结论）

- **ADR-1**：历史接口一次性返回全文（不分页）——数据量假设 H1 若不成立（如多年使用 + 长文），届时再分页，当前最简。
- **ADR-2**：未保存修改切换日期用 ConfirmDialog 拦截——防丢字；不做自动保存（复杂度不值）。
- **ADR-3**：多端并发编辑最后写赢，不做冲突检测——个人场景。

## 验证标准

1. 顶栏出现「复盘」入口，点击进入复盘页（已登录）
2. 左栏倒序列出所有历史复盘（日期 + 摘要），选中项高亮
3. 右栏显示所选日期全文；编辑 → 保存 → 列表摘要同步更新
4. 日期选择器选无记录日期 → 右栏空 → 输入保存 → 列表出现该日期
5. 编辑未保存切换日期 → 弹确认框；确认丢弃 / 取消停留
6. 无复盘时空态正常，可直接写今天
7. 移动端窄屏布局不破
8. 页面无 console error；`npm run lint`/`build`/`test` 通过
