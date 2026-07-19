/**
 * Format a Date object to YYYY-MM-DD string
 */
export function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Get today's date as YYYY-MM-DD string
 */
export function today(): string {
  return formatDate(new Date());
}

/**
 * Get tomorrow's date as YYYY-MM-DD string
 */
export function tomorrow(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return formatDate(d);
}

/**
 * Parse YYYY-MM-DD string to Date object (local timezone)
 */
export function parseDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
}
