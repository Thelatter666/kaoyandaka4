# 001 — 让钟跨步骤常驻，消除闪断重入，并补上「开始点火」

- **Status**: TODO
- **Commit**: 64fc253
- **Severity**: HIGH
- **Category**: Interruptibility / Purpose & frequency
- **Estimated scope**: `client/src/pages/PomodoroPage.tsx`（重构 JSX 结构）+ `client/src/pages/PomodoroPage.css`（新增 2 组 keyframes + 1 个隐藏类），约 120 行改动

## Problem

番茄钟的中央圆盘（RingCountdown/SmoothRing）在每次 step 切换（idle→active→completed→idle、开始/提前完成/取消/休息/继续）时**整棵渲染树卸载重挂**。重挂的新舞台带着 `reveal` 类重新播放 rise-in 入场动画，而旧舞台是瞬间消失的。

视觉证据（分支上已复现截图 `start-transition-80ms.png`）：点击「开始专注」后约 80ms，新圆环才处于 40-50% 透明度淡入中；200ms 才完全可见。用户盯着钟看的时候，钟先瞬灭、再花 420ms 淡入 —— 中心元素每次状态切换都"闪一下"。而且由于是重挂而非同一节点改 props，`ring-countdown__progress` 上精心设计的 `transition: stroke var(--dur-med) var(--ease-out)` 模式色渐变（RingCountdown.css:70）在步骤切换时**根本不会播放**（新节点直接以终色出现）。

相关代码：

```tsx
// PomodoroPage.tsx:279-287 — renderStage 给舞台挂 reveal，每次重挂都重播入场
const renderStage = (mode: RingMode, ring: React.ReactNode, revealIndex: number) => (
  <div
    className={`pomodoro-hero__stage pomodoro-hero__stage--${mode} reveal`}
    style={{ '--i': revealIndex } as React.CSSProperties}
  >
    <span className="pomodoro-stage__glow" aria-hidden="true" />
    {ring}
  </div>
);
```

```css
/* utilities.css:302-308 — reveal 的入场动画（420ms，backwards fill） */
.reveal {
  animation: rise-in var(--dur-rise) var(--ease-out) backwards;
  animation-delay: calc(var(--i, 0) * var(--stagger-step));
}
```

```tsx
// PomodoroPage.tsx:357-439 / 445-531 — idle 与 active 是两个独立 return 分支，
// 各自渲染不同的 SmoothRing/RingCountdown 实例，切换即卸载重挂
if (step === 'idle') { ... return <PageShell>...</PageShell>; }
if (step === 'active' && activeSession) { ... return <PageShell maxWidth={1080}>...</PageShell>; }
```

## Target

把三个 return 分支合并为**一个常驻的渲染树**：`SmoothRing` 始终挂载、永不重挂，step 变化只改它的 props（mode / endsAtMs / fallbackRemainingSeconds / subtitle / modeLabel）。钟从「瞬灭+淡入」变成**同一节点上的连续演化**：

- idle 预览（满环）→ active：同一节点，进度开始 rAF 消减，无任何入场动画
- focus → break：同一节点，模式色按既有 `transition: stroke 240ms` 渐变（这次终于能播放）
- completed：舞台加 `pomodoro-hero__stage--hidden`（`display: none`），SmoothRing 收 `endsAtMs: null` 停止 rAF

舞台不再带 `reveal` 类（钟不属于"新入场的内容"，它是持续存在的元素）。

追加"开始点火"（错过的机会）：点击「开始专注」成功后给舞台挂一次 240ms 的 scale 沉降 + 聚光灯涌起，作为开始时刻唯一的仪式感，`prefers-reduced-motion` 下取消。

## Repo conventions to follow

- 动效一律走 tokens：`--dur-fast: 160ms`、`--dur-med: 240ms`、`--ease-out: cubic-bezier(0.22, 1, 0.36, 1)`（tokens.css:139-142），不硬编码时长/曲线
- reduced-motion 降级已形成惯例：`PomodoroPage.css:335-341` 的 `@media (prefers-reduced-motion: reduce)` 块
- `reveal` 入场编排只留给**每次确实新出现的内容**（操作按钮、侧卡、dock），它们保留现有 `reveal` 类不动
- 注释风格：中文业务注释，沿用文件头注释块格式

## Steps

### 1. 改写 `PomodoroPage.tsx` 的组件返回部分

删除 `renderStage` 辅助函数（279-287 行）与三个 `if (step === ...)` 独立 return，改为单一 return。保留所有 handlers、useEffect、状态与类型不变。

在组件体内新增派生数据（放在 `showLongBreak` 计算之后、return 之前）：

```tsx
const breakTotalSeconds = breakMode === 'short_break' ? SHORT_BREAK_MINUTES * 60 : LONG_BREAK_MINUTES * 60;

// 钟的 props 由 step 派生：单一常驻 SmoothRing，永不重挂
const ringProps = (() => {
  if (step === 'active' && activeSession) {
    return {
      mode: 'focus' as RingMode,
      totalSeconds: totalPlannedSeconds,
      endsAtMs: new Date(activeSession.plannedEndAt).getTime(),
      fallbackRemainingSeconds: 0,
      subtitle:
        activeSession.subjectSnapshot === 'free'
          ? '漫游专注'
          : `${activeSession.presetNameSnapshot} · ${SUBJECT_LABELS[activeSession.subjectSnapshot as Subject]}`,
    };
  }
  if (breakMode) {
    return {
      mode: breakMode as RingMode,
      totalSeconds: breakTotalSeconds,
      endsAtMs: breakEndsAt,
      fallbackRemainingSeconds: breakRemainingSeconds,
    };
  }
  return {
    mode: 'focus' as RingMode,
    totalSeconds: durationMinutes * 60,
    endsAtMs: null,
    fallbackRemainingSeconds: durationMinutes * 60,
    modeLabel: '准备开始',
    subtitle: selectedPreset
      ? `${selectedPreset.name} · ${SUBJECT_LABELS[selectedPreset.subject as Subject]}`
      : '漫游专注',
  };
})();
```

舞台元素（不再有 reveal、不再由 renderStage 生成）：

```tsx
<div
  className={`pomodoro-hero__stage pomodoro-hero__stage--${ringProps.mode}${
    step === 'completed' ? ' pomodoro-hero__stage--hidden' : ''
  }${igniting ? ' pomodoro-hero__stage--ignite' : ''}`}
>
  <span className="pomodoro-stage__glow" aria-hidden="true" />
  <SmoothRing {...ringProps} completedRoundsToday={completedRoundsToday} />
</div>
```

新增 state 与点火触发（放在现有 state 区，`selfEndedRef` 附近）：

```tsx
/** 开始专注瞬间的点火动画：一次 240ms scale 沉降 + 聚光灯涌起 */
const [igniting, setIgniting] = useState(false);
```

在 `handleStartFocus`（206-217 行）的 `await startFocus(...)` 成功之后、`setStep('active')` 之后追加：

```tsx
setIgniting(true);
window.setTimeout(() => setIgniting(false), 260);
```

（`igniting` 只是 CSS 类开关，260ms 比动画 240ms 长即可；不需要清理定时器，组件生命周期内无害。若坚持清理可用 ref 保存并放进卸载 effect，但不是必须。）

### 2. 重组 JSX 为单一常驻树

`return` 结构如下（保留原注释块，文案原样）：

```tsx
return (
  <PageShell
    title="番茄钟"
    subtitle={breakMode ? '休息一下，恢复精力' : '设定时长，即刻开始一段专注'}
    maxWidth={step === 'active' ? 1080 : step === 'completed' ? 720 : undefined}
  >
    <p className="sr-only">今日已完成 {completedRoundsToday} 轮</p>

    <div className={step === 'active' && activeSession ? 'pomodoro-active' : undefined}>
      <div className="pomodoro-hero">
        {/* 常驻舞台：钟跨步骤持续存在，props 随状态演化 */}
        <div
          className={`pomodoro-hero__stage pomodoro-hero__stage--${ringProps.mode}${
            step === 'completed' ? ' pomodoro-hero__stage--hidden' : ''
          }${igniting ? ' pomodoro-hero__stage--ignite' : ''}`}
        >
          <span className="pomodoro-stage__glow" aria-hidden="true" />
          <SmoothRing {...ringProps} completedRoundsToday={completedRoundsToday} />
        </div>

        {step === 'idle' && !breakMode && (
          /* 空闲态控制卡（原 411-431 行内容原样搬入，含 reveal 与 --i: 1） */
          <div className="glass-2 pomodoro-control reveal" style={{ '--i': 1 } as React.CSSProperties}>
            {/* DurationSelector + Magnetic CTA + tree hint，原样保留 */}
          </div>
        )}

        {step === 'idle' && breakMode && (
          <div className="pomodoro-ops reveal" style={{ '--i': 1 } as React.CSSProperties}>
            <Button variant="ghost" onClick={completeBreak}>
              <X size={16} strokeWidth={1.75} aria-hidden="true" />
              跳过休息
            </Button>
          </div>
        )}

        {step === 'active' && activeSession && (
          <div className="pomodoro-ops reveal" style={{ '--i': 1 } as React.CSSProperties}>
            <Button variant="primary" size="lg" onClick={handleComplete} loading={actionLoading}>
              <Check size={18} strokeWidth={1.75} aria-hidden="true" />
              提前完成
            </Button>
            <Button variant="danger" onClick={handleCancel} disabled={actionLoading}>
              <X size={16} strokeWidth={1.75} aria-hidden="true" />
              取消
            </Button>
          </div>
        )}
      </div>

      {step === 'active' && activeSession && (
        <aside
          className="pomodoro-active__side reveal"
          style={{ '--i': 2 } as React.CSSProperties}
          aria-label="当前专注信息"
        >
          {/* 原 483-523 行侧卡内容原样搬入 */}
        </aside>
      )}
    </div>

    {step === 'completed' ? (
      /* 完成态（原 537-586 行内容原样搬入，保留 pomodoro-completed 相对定位容器） */
      <div className="pomodoro-completed">
        <BurstParticles burstKey={burstKey} colorVar="--color-accent-primary" />
        <div className="pomodoro-hero reveal" style={{ '--i': 0, textAlign: 'center' } as React.CSSProperties}>
          {/* 勾选图标 + 标题 + 副标题 + 四个按钮，原样保留 */}
        </div>
      </div>
    ) : (
      <div className="pomodoro-below">
        {renderPresetDock(step === 'active', step === 'active' ? 3 : 2)}
      </div>
    )}
  </PageShell>
);
```

注意：
- 原 idle 分支的 `PageShell` 带 title/subtitle（357-362 行），原 active/completed 不带；合并后统一带（行为无差异）。
- completed 状态下舞台 `display: none`，`SmoothRing` 收 `endsAtMs: null` → SmoothRing 的 rAF effect（PomodoroPage.tsx:627-649）立即返回，不空转。
- `renderPresetDock` 的 dimmed 与 reveal 索引逻辑照搬原调用：idle→`(false, 2)`，active→`(true, 3)`。

### 3. 给 `PomodoroPage.css` 追加样式

在 `.pomodoro-roam--selected`（220-223 行）附近追加（用文件内已有注释风格）：

```css
/* ---- 常驻舞台：completed 时隐藏（节点保持挂载，回 idle 不复播入场） ---- */
.pomodoro-hero__stage--hidden {
  display: none;
}

/* ---- 开始专注「点火」：一次 scale 沉降 + 聚光灯涌起（设计文档 13.4 弹性家族） ---- */
@keyframes stage-ignite {
  from {
    transform: scale(0.97);
  }
}

.pomodoro-hero__stage--ignite {
  animation: stage-ignite 240ms var(--ease-out);
}

@keyframes stage-glow-surge {
  from {
    opacity: 0;
  }
}

.pomodoro-hero__stage--ignite .pomodoro-stage__glow {
  animation: stage-glow-surge 240ms var(--ease-out);
}
```

在文件末尾 reduced-motion 块（335-341 行）内追加：

```css
.pomodoro-hero__stage--ignite,
.pomodoro-hero__stage--ignite .pomodoro-stage__glow {
  animation: none;
}
```

## Boundaries

- **不要改动** `RingCountdown.tsx` / `RingCountdown.css` / `BurstParticles.tsx` / `SmoothRing` 内部实现
- 不改任何 API 调用、handler 逻辑、useEffect 逻辑（只搬位置与改触发点）
- 不新增依赖
- 不删除任何既有 class 名；辅助元素（ops/side/dock）的 `reveal` 保留不动
- 若发现结构与上述步骤不符（代码漂移），STOP 并报告，不要即兴改编

## Verification

- **Mechanical**: `npm run lint` 与 `npm run build`（client 构建含 `tsc`）通过；确认无未使用变量（如 `renderStage` 已删除）
- **Feel check**（DevTools Animations 面板开 10% 播放速度）：
  - 点击「开始专注」：旧环**不再淡入**，同一圆环原地连续演化；点火动画只播一次 240ms scale(0.97→1) 沉降
  - 点击「提前完成」/「取消」/「继续专注」/「短休息」：环不闪断；focus→break 时环色按 240ms 渐变（而不是瞬间变绿）
  - completed 页：钟消失（display:none），粒子爆散仍在居中位置触发
  - 切到后台标签页再回来：环位置瞬间校准（rAF 恢复首帧直写），无过渡跳动
  - 打开 Rendering 面板模拟 `prefers-reduced-motion: reduce`：点火动画消失，其余交互正常
- **Done when**: 连续走 idle→active→completed→idle→break 全流程，钟元素在 DevTools 中仅挂载一次（`$0` 检查或 React DevTools 高亮元素不闪烁），无任何淡入重播
