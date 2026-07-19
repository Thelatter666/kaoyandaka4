import React, { useState, useEffect, useCallback } from 'react';
import { TopNav } from './components/layout/TopNav';
import { SkipLink } from './components/ui/SkipLink';
import { ToastContainer } from './components/ui/Toast';
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

function getHash(): string {
  return window.location.hash || '#/';
}

function parseHashRoute(hash: string): { page: string; params: Record<string, string> } {
  const path = hash.replace(/^#/, '') || '/';
  // Check for course detail: /courses/:id
  const courseMatch = path.match(/^\/courses\/(.+)$/);
  if (courseMatch) {
    return { page: 'course-detail', params: { id: courseMatch[1] } };
  }
  return { page: path, params: {} };
}

export default function App() {
  const [hash, setHash] = useState(getHash);
  const { page, params } = parseHashRoute(hash);

  useEffect(() => {
    const handler = () => setHash(getHash());
    window.addEventListener('hashchange', handler);
    return () => window.removeEventListener('hashchange', handler);
  }, []);

  const navigate = useCallback((newHash: string) => {
    window.location.hash = newHash;
  }, []);

  const renderPage = () => {
    switch (page) {
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
        return <CourseDetailPage courseId={params.id} />;
      case '/statistics':
        return <StatisticsPage />;
      default:
        return <HomePage navigate={navigate} />;
    }
  };

  return (
    <>
      <SkipLink />
      <TopNav activeHash={hash} onNavigate={navigate} />
      {renderPage()}
      <ToastContainer />
    </>
  );
}
