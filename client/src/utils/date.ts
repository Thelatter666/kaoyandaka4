const EXAM_DATE = '2026-12-20';

export function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function today(): string {
  return formatDate(new Date());
}

export function tomorrow(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return formatDate(d);
}

export function getDaysRemaining(examDate: string = EXAM_DATE): number {
  const now = new Date();
  const exam = new Date(examDate + 'T00:00:00');
  const todayStart = new Date(formatDate(now) + 'T00:00:00');

  if (todayStart > exam) return 0;

  const diffTime = exam.getTime() - todayStart.getTime();
  return Math.floor(diffTime / (1000 * 60 * 60 * 24));
}

const DAY_NAMES = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

export function getDayOfWeek(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return DAY_NAMES[d.getDay()];
}

export function formatDateDisplay(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  const year = d.getFullYear();
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const dayOfWeek = DAY_NAMES[d.getDay()];
  return `${year}年${month}月${day}日 ${dayOfWeek}`;
}

export function isBeforeToday(dateStr: string): boolean {
  return dateStr < today();
}

export function isAfterToday(dateStr: string): boolean {
  return dateStr > today();
}

export function isToday(dateStr: string): boolean {
  return dateStr === today();
}
