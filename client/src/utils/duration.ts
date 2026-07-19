export function secondsToMinutes(seconds: number): number {
  return Math.round(seconds / 60);
}

export function minutesToSeconds(minutes: number): number {
  return minutes * 60;
}

export function formatSeconds(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function formatMinutes(minutes: number): string {
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const remaining = minutes % 60;
    return remaining > 0 ? `${hours}小时${remaining}分钟` : `${hours}小时`;
  }
  return `${minutes}分钟`;
}

export function formatDurationHuman(seconds: number): string {
  const totalMinutes = Math.round(seconds / 60);
  return formatMinutes(totalMinutes);
}

export function parseTimeString(text: string): { durationSeconds: number; durationText: string } | null {
  const trimmed = text.trim();

  // Try H:MM:SS
  const hmsMatch = trimmed.match(/^(\d{1,2}):(\d{2}):(\d{2})$/);
  if (hmsMatch) {
    const hours = parseInt(hmsMatch[1], 10);
    const minutes = parseInt(hmsMatch[2], 10);
    const seconds = parseInt(hmsMatch[3], 10);
    if (minutes < 60 && seconds < 60) {
      return {
        durationSeconds: hours * 3600 + minutes * 60 + seconds,
        durationText: trimmed,
      };
    }
  }

  // Try MM:SS
  const mmssMatch = trimmed.match(/^(\d{1,3}):(\d{2})$/);
  if (mmssMatch) {
    const minutes = parseInt(mmssMatch[1], 10);
    const seconds = parseInt(mmssMatch[2], 10);
    if (seconds < 60) {
      return {
        durationSeconds: minutes * 60 + seconds,
        durationText: trimmed,
      };
    }
  }

  return null;
}
