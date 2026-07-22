import React, { useState, useEffect, useCallback, useRef } from 'react';
import { AuroraBackground } from './components/layout/AuroraBackground';
import { TopNav } from './components/layout/TopNav';
import { SkipLink } from './components/ui/SkipLink';
import { ToastContainer } from './components/ui/Toast';
import { LoadingState } from './components/ui/LoadingState';
import { LandingPage } from './components/landing/LandingPage';
import { useAuth } from './hooks/useAuth';
import './styles/global.css';
import './styles/utilities.css';

// Page placeholders — will be replaced with real pages in subsequent phases
import { HomePage } from './pages/HomePage';
import { PlanPage } from './pages/PlanPage';
import { PresetsPage } from './pages/PresetsPage';
import { PomodoroPage } from './pages/PomodoroPage';
import { CoursesPage } from './pages/CoursesPage';
import { CourseDetailPage } from './pages/CourseDetailPage';
import { StatisticsPage } from './pages/StatisticsPage';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';

/* 未登录可访问的公开路由（账号系统 T2.4）：介绍页 + 登录 + 注册 */
const PUBLIC_PAGES = new Set(['/', '/login', '/register']);
/* 仅未登录可访问：已登录访问这两个路由会被守卫重定向回 #/ */
const GUEST_ONLY_PAGES = new Set(['/login', '/register']);

function getHash(): string {
  return window.location.hash || '#/';
}

interface Route {
  page: string;
  params: Record<string, string>;
}

function parseHashRoute(hash: string): Route {
  const path = hash.replace(/^#/, '') || '/';
  // Check for course detail: /courses/:id
  const courseMatch = path.match(/^\/courses\/(.+)$/);
  if (courseMatch) {
    return { page: 'course-detail', params: { id: courseMatch[1] } };
  }
  return { page: path, params: {} };
}

/** 过渡容器 key：page + 参数，参数变化也触发重挂载与过渡 */
function routeKey(route: Route): string {
  return route.page + '|' + JSON.stringify(route.params);
}

/** 与 .page-exit 动画时长（--dur-page-exit: 140ms）保持一致 */
const EXIT_DURATION_MS = 140;

export default function App() {
  /* 登录态：未登录 → 介绍页/登录/注册；已登录 → 应用。
     isLoading = 首次会话探测（GET /auth/me）进行中，期间渲染加载壳避免闪现 landing */
  const { isLoggedIn, isLoading } = useAuth();
  const [hash, setHash] = useState(getHash);
  const incoming = parseHashRoute(hash);

  /* v2 页面切换状态机（设计文档 13.2）：
     displayed 为当前实际渲染的路由；phase='exit' 时旧页面播 .page-exit，
     140ms 后卸载旧页、挂载新页（自动带 .page-enter）。 */
  const [displayed, setDisplayed] = useState<Route>(incoming);
  const [phase, setPhase] = useState<'idle' | 'exit'>('idle');
  const exitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<Route>(incoming);

  useEffect(() => {
    const handler = () => setHash(getHash());
    window.addEventListener('hashchange', handler);
    return () => window.removeEventListener('hashchange', handler);
  }, []);

  useEffect(() => {
    const next = parseHashRoute(hash);
    pendingRef.current = next;

    // 目标路由与当前展示一致：取消未完成的退出，直接停留
    if (routeKey(next) === routeKey(displayed)) {
      if (exitTimerRef.current !== null) {
        clearTimeout(exitTimerRef.current);
        exitTimerRef.current = null;
      }
      setPhase('idle');
      return;
    }

    // prefers-reduced-motion：立即切换，无过渡
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      if (exitTimerRef.current !== null) {
        clearTimeout(exitTimerRef.current);
        exitTimerRef.current = null;
      }
      setDisplayed(next);
      setPhase('idle');
      return;
    }

    // 旧页面进入退出阶段；快速连续切换时取消未完成计时器，
    // 140ms 后切换到最新目标（pendingRef 始终指向最后一次 hash）
    setPhase('exit');
    if (exitTimerRef.current !== null) {
      clearTimeout(exitTimerRef.current);
    }
    exitTimerRef.current = setTimeout(() => {
      exitTimerRef.current = null;
      setDisplayed(pendingRef.current);
      setPhase('idle');
    }, EXIT_DURATION_MS);
  }, [hash, displayed]);

  // 卸载时清理计时器，避免内存泄漏
  useEffect(() => {
    return () => {
      if (exitTimerRef.current !== null) {
        clearTimeout(exitTimerRef.current);
      }
    };
  }, []);

  const navigate = useCallback((newHash: string) => {
    window.location.hash = newHash;
  }, []);

  /* 路由守卫（账号系统 T2.4）：
     - 未登录访问应用路由（#/plan 等）→ 重定向回 #/
     - 已登录访问 #/login、#/register → 重定向回 #/
     会话探测进行中（isLoading）暂缓判定，避免刷新页面时被误踢回 #/ 后再跳回。
     以 hash 派生的 incoming 为准（而非 displayed），hashchange 当帧即响应。 */
  useEffect(() => {
    if (isLoading) return;
    const page = incoming.page;
    if (!isLoggedIn && !PUBLIC_PAGES.has(page)) {
      window.location.hash = '#/';
    } else if (isLoggedIn && GUEST_ONLY_PAGES.has(page)) {
      window.location.hash = '#/';
    }
  }, [isLoggedIn, isLoading, hash]);

  const renderPage = () => {
    switch (displayed.page) {
      case '/':
        return <HomePage navigate={navigate} />;
      case '/plan':
        return <PlanPage />;
      case '/presets':
        return <PresetsPage />;
      case '/pomodoro':
        return <PomodoroPage />;
      case '/courses':
        return <CoursesPage navigate={navigate} />;
      case 'course-detail':
        return <CourseDetailPage courseId={displayed.params.id} />;
      case '/statistics':
        return <StatisticsPage />;
      default:
        return <HomePage navigate={navigate} />;
    }
  };

  /* 会话探测中：加载壳（不渲染 landing/应用，避免闪烁与误重定向） */
  if (isLoading) {
    return (
      <>
        <SkipLink />
        <AuroraBackground />
        <main
          id="main-content"
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 'var(--space-xl) var(--space-lg)',
          }}
        >
          <div style={{ width: 'min(360px, 100%)' }}>
            <LoadingState message="正在恢复登录状态..." />
          </div>
        </main>
        <ToastContainer />
      </>
    );
  }

  /* 未登录：按 hash 渲染介绍页 / 登录页 / 注册页（均为公开路由；
     其他 hash 由守卫重定向回 #/，此处兜底为介绍页，不会闪现受保护内容） */
  if (!isLoggedIn) {
    return (
      <>
        <SkipLink />
        <AuroraBackground />
        {incoming.page === '/login' ? (
          <LoginPage />
        ) : incoming.page === '/register' ? (
          <RegisterPage />
        ) : (
          <LandingPage />
        )}
        <ToastContainer />
      </>
    );
  }

  return (
    <>
      <SkipLink />
      {/* 极光背景：固定全屏 z-index 0，全页面共享（设计文档 7.1） */}
      <AuroraBackground />
      <TopNav activeHash={hash} onNavigate={navigate} />
      {/* 页面过渡容器：key = page + 参数，重挂载即播 .page-enter */}
      <div
        key={routeKey(displayed)}
        className={`page-transition ${phase === 'exit' ? 'page-exit' : 'page-enter'}`}
      >
        {renderPage()}
      </div>
      <ToastContainer />
    </>
  );
}
