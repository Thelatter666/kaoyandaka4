# 每日复盘回顾（独立复盘页）— 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增独立复盘页（顶栏「复盘」入口，单页双栏），倒序浏览全部历史复盘，支持编辑与补写。

**Architecture:** 后端 `GET /api/v1/reviews/history` 一次性返回全部复盘（倒序含全文）；客户端 `reviewsApi.getHistory()`；新页面 `ReviewPage`（左栏日期列表 + 右栏详情编辑，复用 upsert 保存）；App.tsx 三处 + TopNav 一处集成。

**Tech Stack:** Express 4 + mysql2/promise、React 18 + Vite 6 + framer-motion、lucide。

**Spec:** `docs/superpowers/specs/2026-08-10-review-history-design.md`

## Global Constraints

- 零新 npm 依赖
- 所有 UI 颜色/间距必须用 `var(--color-*)`、`var(--space-*)` token，禁止硬编码
- 新页面 co-located CSS；业务注释中文；动画用 framer-motion（本页无复杂动画）
- 服务端查询按 `user_id` 隔离；错误形状 `{ error: { code, message, details } }`
- **commit 仅当用户显式下达指令**：每任务完成后停下汇报，不自动 commit

---

### Task 1: 后端历史列表接口

**Files:**
- Modify: `server/src/routes/reviews.ts`（追加 `/history` 路由）

**Interfaces:**
- Consumes: 既有 `ReviewRow` / `transformReview` / `pool`
- Produces: `GET /api/v1/reviews/history` → `[{ id, reviewDate, content, createdAt, updatedAt }]` 倒序；无记录 `[]`

- [ ] **Step 1: 追加路由**

`server/src/routes/reviews.ts` 在 `GET /` 路由之后追加：

```ts
// GET /api/v1/reviews/history — 全部复盘（倒序，含全文；个人数据量小不分页）
router.get('/history', async (req: Request, res: Response, next: NextFunction) => {
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

- [ ] **Step 2: 类型检查**

Run: `cd server && npx tsc --noEmit`
Expected: 无类型错误

- [ ] **Step 3: curl 验证**

Run（另开终端 `npm run dev:server`；若 3001 已被占用则先 `pkill -f "tsx src/index.ts"`）：

```bash
# 登录已有测试账号（sound-test@example.com / password123）
curl -s -c /tmp/kyc.txt -X POST http://localhost:3001/api/v1/auth/login -H 'Content-Type: application/json' -d '{"email":"sound-test@example.com","password":"password123"}'
# 写入两条不同日期的复盘
curl -s -b /tmp/kyc.txt -X PUT http://localhost:3001/api/v1/reviews -H 'Content-Type: application/json' -d '{"date":"2026-08-09","content":"昨天的复盘：数学强化 2 小时"}'
curl -s -b /tmp/kyc.txt -X PUT http://localhost:3001/api/v1/reviews -H 'Content-Type: application/json' -d '{"date":"2026-08-10","content":"今天的复盘：英语阅读正确率提升"}'
# 历史接口：倒序、含全文
curl -s -b /tmp/kyc.txt http://localhost:3001/api/v1/reviews/history
```

Expected: 返回两条记录，`2026-08-10` 在前、`2026-08-09` 在后，均含 `content` 全文；未登录访问返回 401。

- [ ] **Step 4: 汇报，等待提交指令**

---

### Task 2: 客户端 API 方法

**Files:**
- Modify: `client/src/api/reviews.ts`

**Interfaces:**
- Consumes: 既有 `api` / `Review` 接口
- Produces: `reviewsApi.getHistory(): Promise<Review[]>` → Task 3 使用

- [ ] **Step 1: 追加方法**

`client/src/api/reviews.ts` 的 `reviewsApi` 对象追加：

```ts
export const reviewsApi = {
  getByDate: (date: string) => api.get<Review | null>(`/reviews?date=${date}`),

  upsert: (data: UpsertReviewInput) => api.put<Review>('/reviews', data),

  getHistory: () => api.get<Review[]>('/reviews/history'),
};
```

- [ ] **Step 2: 类型检查**

Run: `cd client && npx tsc --noEmit`
Expected: 无类型错误

- [ ] **Step 3: 汇报，等待提交指令**

---

### Task 3: ReviewPage 页面

**Files:**
- Create: `client/src/pages/ReviewPage.tsx`
- Create: `client/src/pages/ReviewPage.css`

**Interfaces:**
- Consumes: `reviewsApi.getHistory/upsert`（Task 2）、`Card`/`Button`/`ConfirmDialog`/`EmptyState`/`ErrorState`/`LoadingState`/`showToast`、`today`/`formatDateDisplay`（utils/date）
- Produces: `<ReviewPage />` 自包含页面 → Task 4 路由注册

- [ ] **Step 1: 创建页面组件**

`client/src/pages/ReviewPage.tsx`：

```tsx
import React, { useState, useEffect, useCallback } from 'react';
import { NotebookPen, RefreshCw, Check, AlertCircle, CalendarDays, BookOpen } from 'lucide-react';
import { PageShell } from '../components/layout/PageShell';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { EmptyState } from '../components/ui/EmptyState';
import { ErrorState } from '../components/ui/ErrorState';
import { LoadingState } from '../components/ui/LoadingState';
import { showToast } from '../components/ui/Toast';
import { reviewsApi, Review } from '../api/reviews';
import { today, formatDateDisplay } from '../utils/date';
import './ReviewPage.css';

/**
 * 复盘页（设计文档 2026-08-10）：单页双栏
 * - 左栏：有复盘记录的日期倒序列表 + 日期选择器（可补写无复盘的日子）
 * - 右栏：所选日期的复盘详情，可编辑/保存（复用 upsert，最后写赢）
 * - 未保存修改切换日期 → ConfirmDialog 确认，防丢字
 */
const DAY_NAMES = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

function formatListDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return `${d.getMonth() + 1}月${d.getDate()}日 ${DAY_NAMES[d.getDay()]}`;
}

export function ReviewPage() {
  const [history, setHistory] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>(today());
  const [content, setContent] = useState('');
  const [savedContent, setSavedContent] = useState('');
  const [saving, setSaving] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  /** 未保存确认中的待切换日期（null = 无待确认） */
  const [pendingDate, setPendingDate] = useState<string | null>(null);

  const dirty = content !== savedContent;

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await reviewsApi.getHistory();
      setHistory(list);
      if (list.length > 0) {
        const latest = list[0].reviewDate;
        setSelectedDate(latest);
        setContent(list[0].content);
        setSavedContent(list[0].content);
      } else {
        setSelectedDate(today());
        setContent('');
        setSavedContent('');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载复盘失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchHistory();
  }, [fetchHistory]);

  const applyDate = useCallback((date: string) => {
    setSelectedDate(date);
    const review = history.find((r) => r.reviewDate === date);
    setContent(review?.content ?? '');
    setSavedContent(review?.content ?? '');
    setSaving('idle');
  }, [history]);

  const handleSelectDate = (date: string) => {
    if (date === selectedDate) return;
    if (dirty) {
      setPendingDate(date);
      return;
    }
    applyDate(date);
  };

  const handleConfirmSwitch = () => {
    if (pendingDate) applyDate(pendingDate);
    setPendingDate(null);
  };

  const handleSave = async () => {
    setSaving('saving');
    try {
      await reviewsApi.upsert({ date: selectedDate, content });
      setSavedContent(content);
      setSaving('saved');
      showToast('success', '复盘已保存');
      // 更新列表缓存：新增或更新对应日期的摘要
      setHistory((prev) => {
        const exists = prev.some((r) => r.reviewDate === selectedDate);
        const updated: Review = {
          id: prev.find((r) => r.reviewDate === selectedDate)?.id ?? '',
          reviewDate: selectedDate,
          content,
          createdAt: prev.find((r) => r.reviewDate === selectedDate)?.createdAt ?? '',
          updatedAt: new Date().toISOString(),
        };
        return exists
          ? prev.map((r) => (r.reviewDate === selectedDate ? updated : r))
          : [updated, ...prev].sort((a, b) => b.reviewDate.localeCompare(a.reviewDate));
      });
      setTimeout(() => setSaving('idle'), 2000);
    } catch {
      setSaving('error');
      showToast('error', '保存失败，请重试');
    }
  };

  return (
    <PageShell title="复盘" subtitle="回顾每一段学习的痕迹">
      {loading ? (
        <LoadingState message="加载复盘记录中..." />
      ) : error ? (
        <ErrorState message={error} onRetry={fetchHistory} />
      ) : (
        <div className="review-grid">
          {/* 左栏：日期列表 + 日期选择器 */}
          <aside className="review-list-wrap reveal" style={{ '--i': 0 } as React.CSSProperties} aria-label="复盘日期列表">
            <Card>
              <h2 className="review-list__title">
                <CalendarDays size={18} strokeWidth={1.75} aria-hidden="true" />
                日期
              </h2>
              <label className="review-list__picker">
                <span className="sr-only">选择日期</span>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => handleSelectDate(e.target.value)}
                  aria-label="选择日期补写复盘"
                />
              </label>
              {history.length === 0 ? (
                <EmptyState
                  icon={<BookOpen size={36} strokeWidth={1.75} />}
                  title="还没有复盘"
                  description="选择右侧日期，写下第一篇复盘吧"
                />
              ) : (
                <ul className="review-list">
                  {history.map((r) => (
                    <li key={r.reviewDate}>
                      <button
                        type="button"
                        className={`review-list__item${r.reviewDate === selectedDate ? ' review-list__item--active' : ''}`}
                        onClick={() => handleSelectDate(r.reviewDate)}
                        aria-pressed={r.reviewDate === selectedDate}
                      >
                        <span className="review-list__date">{formatListDate(r.reviewDate)}</span>
                        <span className="review-list__summary truncate">
                          {r.content.split('\n')[0] || '（空白）'}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </aside>

          {/* 右栏：详情编辑 */}
          <section className="review-detail-wrap reveal" style={{ '--i': 1 } as React.CSSProperties} aria-label="复盘详情">
            <Card>
              <h2 className="review-detail__title">
                <NotebookPen size={18} strokeWidth={1.75} aria-hidden="true" />
                每日复盘
              </h2>
              <p className="review-detail__date">{formatDateDisplay(selectedDate)}</p>
              <textarea
                className="review-detail__textarea"
                value={content}
                onChange={(e) => {
                  setContent(e.target.value);
                  if (saving === 'saved') setSaving('idle');
                }}
                placeholder="记录学习心得、遇到的困难、明天的计划..."
                aria-label="复盘内容"
                rows={14}
              />
              <div className="review-detail__footer">
                <span className="review-detail__status-wrap" aria-live="polite">
                  {dirty && saving !== 'saving' && (
                    <span className="review-detail__status">有未保存的修改</span>
                  )}
                  {saving === 'saving' && (
                    <span className="review-detail__status">
                      <RefreshCw size={14} strokeWidth={1.75} className="review-spin" aria-hidden="true" />
                      保存中...
                    </span>
                  )}
                  {saving === 'saved' && (
                    <span className="review-detail__status review-detail__status--saved">
                      <Check size={14} strokeWidth={1.75} aria-hidden="true" />
                      已保存
                    </span>
                  )}
                  {saving === 'error' && (
                    <span className="review-detail__status review-detail__status--error">
                      <AlertCircle size={14} strokeWidth={1.75} aria-hidden="true" />
                      保存失败，点击重试
                    </span>
                  )}
                </span>
                <Button variant="primary" size="sm" onClick={handleSave} loading={saving === 'saving'}>
                  保存复盘
                </Button>
              </div>
            </Card>
          </section>
        </div>
      )}

      <ConfirmDialog
        isOpen={pendingDate !== null}
        onClose={() => setPendingDate(null)}
        onConfirm={handleConfirmSwitch}
        title="有未保存的修改"
        message="当前复盘内容尚未保存，切换日期将丢失这些修改。确定切换吗？"
        confirmLabel="放弃修改，切换"
        cancelLabel="留在当前日期"
        destructive={false}
      />
    </PageShell>
  );
}
```

- [ ] **Step 2: 创建样式**

`client/src/pages/ReviewPage.css`：

```css
/* ============================================================
   复盘页（2026-08-10 设计文档）：双栏 grid（列表 span 4 + 详情 span 8）
   ============================================================ */

.review-grid {
  display: grid;
  grid-template-columns: repeat(12, 1fr);
  gap: var(--space-lg);
  align-items: start;
}

.review-list-wrap,
.review-detail-wrap {
  min-width: 0;
}

.review-list-wrap {
  grid-column: span 4;
}

.review-detail-wrap {
  grid-column: span 8;
}

@media (max-width: 1023px) {
  .review-grid {
    gap: var(--space-md);
  }
  .review-list-wrap,
  .review-detail-wrap {
    grid-column: span 12;
  }
}

/* ---- 左栏：日期列表 ---- */
.review-list__title {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  font-family: var(--font-heading);
  font-size: var(--text-lg);
  font-weight: var(--font-semibold);
  color: var(--color-text-primary);
  margin-bottom: var(--space-md);
}

.review-list__title .lucide {
  color: var(--color-accent-primary);
}

.review-list__picker {
  display: block;
  margin-bottom: var(--space-md);
}

.review-list__picker input {
  width: 100%;
  padding: 10px 12px;
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border);
  background: var(--color-glass-bg);
  color: var(--color-text-primary);
  font-family: inherit;
  font-size: var(--text-sm);
  outline: none;
  transition:
    border-color var(--dur-fast) var(--ease-out),
    box-shadow var(--dur-fast) var(--ease-out);
}

.review-list__picker input:focus {
  border-color: var(--color-accent-primary);
  box-shadow: var(--glow-primary);
}

.review-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.review-list__item {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  padding: var(--space-sm) var(--space-md);
  border-radius: var(--radius-md);
  border: 1px solid transparent;
  background: var(--color-glass-bg);
  color: var(--color-text-primary);
  text-align: left;
  cursor: pointer;
  transition:
    border-color var(--dur-fast) var(--ease-out),
    background var(--dur-fast) var(--ease-out);
}

.review-list__item:hover {
  border-color: var(--color-border);
}

.review-list__item--active {
  border-color: var(--color-accent-primary);
  background: var(--color-glass-bg-strong);
}

.review-list__date {
  font-weight: var(--font-semibold);
  font-size: var(--text-sm);
}

.review-list__item--active .review-list__date {
  color: var(--color-accent-primary);
}

.review-list__summary {
  font-size: var(--text-xs);
  color: var(--color-text-secondary);
}

/* ---- 右栏：详情编辑（复用计划页复盘卡视觉模式） ---- */
.review-detail__title {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  font-family: var(--font-heading);
  font-size: var(--text-lg);
  font-weight: var(--font-semibold);
  color: var(--color-text-primary);
  margin-bottom: var(--space-xs);
}

.review-detail__title .lucide {
  color: var(--color-accent-primary);
}

.review-detail__date {
  font-size: var(--text-sm);
  color: var(--color-text-secondary);
  margin-bottom: var(--space-md);
}

.review-detail__textarea {
  width: 100%;
  padding: 12px;
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border);
  background: var(--color-glass-bg);
  color: var(--color-text-primary);
  font-size: var(--text-base);
  font-family: inherit;
  line-height: 1.6;
  resize: vertical;
  outline: none;
  transition:
    border-color var(--dur-fast) var(--ease-out),
    box-shadow var(--dur-fast) var(--ease-out);
}

.review-detail__textarea:focus {
  border-color: var(--color-accent-primary);
  box-shadow: var(--glow-primary);
}

.review-detail__footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--space-sm);
  margin-top: var(--space-md);
}

.review-detail__status-wrap {
  flex: 1;
  display: flex;
  justify-content: flex-end;
  min-width: 0;
}

.review-detail__status {
  display: inline-flex;
  align-items: center;
  gap: var(--space-xs);
  font-size: var(--text-xs);
  color: var(--color-text-muted);
}

.review-detail__status--saved {
  color: var(--color-accent-success-strong);
}

.review-detail__status--error {
  color: var(--color-accent-danger);
}

/* 保存中：RefreshCw 转动（transform 动画） */
@keyframes review-spin {
  to {
    transform: rotate(360deg);
  }
}

.review-spin {
  animation: review-spin 0.8s linear infinite;
}

@media (max-width: 719px) {
  .review-list {
    flex-direction: row;
    overflow-x: auto;
    padding-bottom: var(--space-xs);
  }
  .review-list__item {
    min-width: 160px;
  }
}
```

- [ ] **Step 3: 类型检查**

Run: `cd client && npx tsc --noEmit`
Expected: 无类型错误

- [ ] **Step 4: 汇报，等待提交指令**

---

### Task 4: 路由与导航集成

**Files:**
- Modify: `client/src/App.tsx`（pageLoaders + lazy 变量 + NAV_PREFETCH + renderPage 四处）
- Modify: `client/src/components/layout/TopNav.tsx`（NAV_ITEMS + lucide import）

**Interfaces:**
- Consumes: `<ReviewPage />`（Task 3）
- Produces: `#/review` 路由可用，顶栏「复盘」入口出现

- [ ] **Step 1: App.tsx — pageLoaders 与 lazy 变量**

`pageLoaders` 对象追加（`register` 之后）：

```ts
  review: () => import('./pages/ReviewPage').then((m) => ({ default: m.ReviewPage })),
```

lazy 声明追加（`RegisterPage` 之后）：

```ts
const ReviewPage = lazy(pageLoaders.review);
```

- [ ] **Step 2: App.tsx — NAV_PREFETCH**

`NAV_PREFETCH` 追加（`'#/statistics'` 之后）：

```ts
  '#/review': pageLoaders.review,
```

- [ ] **Step 3: App.tsx — renderPage**

`renderPage` switch 追加（`case '/statistics'` 之后）：

```ts
      case '/review':
        return <ReviewPage />;
```

- [ ] **Step 4: TopNav.tsx — 导航项**

lucide import 追加：

```ts
  NotebookPen,
```

（保持字母序：`MonitorPlay, NotebookPen, Trees`）

`NAV_ITEMS` 追加（`统计` 之后）：

```ts
  { label: '复盘', hash: '#/review', icon: NotebookPen },
```

- [ ] **Step 5: 构建验证**

Run: `cd client && npx tsc --noEmit && npx vite build`
Expected: 无类型错误，构建成功（ReviewPage chunk 独立分包）

- [ ] **Step 6: 汇报，等待提交指令**

---

### Task 5: 全量验证

**Files:** 无（验证清单）

- [ ] **Step 1: 单测 + lint + build**

Run: `npm test && npm run lint && npm run build`
Expected: vitest 通过（sound 4 个）；lint 无新增错误（既有 Modal.tsx error 除外）；build 成功

- [ ] **Step 2: MCP 手动验证清单**（浏览器，交给用户或本会话 Playwright MCP 执行）

1. 顶栏出现「复盘」入口，点击进入复盘页
2. 左栏倒序列出测试数据（08-10 / 08-09），选中最新日期高亮
3. 右栏显示对应全文；修改内容 → 保存 → toast + 列表摘要同步
4. 日期选择器选无记录日期（如 2026-08-08）→ 右栏空 → 输入保存 → 列表新增该日期
5. 编辑未保存时切换日期 → 弹确认框；取消停留、确认切换
6. 无复盘空态
7. 窄屏布局（列表横向滚动）
8. 无 console error

- [ ] **Step 3: 汇报验证结果，等待用户验收 + 提交/合并指令**

---

## Self-Review 记录

- **Spec 覆盖**：history 端点（T1）✓ / getHistory（T2）✓ / 双栏页面 + 编辑 + 补写 + 未保存确认 + 空态（T3）✓ / 路由与导航三处联动（T4）✓ / 验证（T5）✓
- **占位符扫描**：无 TBD/TODO；每步含完整代码与命令
- **类型一致性**：`reviewsApi.getHistory(): Promise<Review[]>`、`Review` 接口字段（id/reviewDate/content/createdAt/updatedAt）、`formatDateDisplay`/`today` 均与既有代码一致
- **约束**：全计划无自动 commit；零新依赖；token 变量全用
