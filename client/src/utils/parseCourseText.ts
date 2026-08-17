/**
 * 网课文本导入解析纯函数（移植 server/src/routes/courses.ts 的 POST /parse 逻辑，
 * 供本地模式 coursesApi.parse 使用；服务器路由保持原样）。
 */

export interface ParsedEpisode {
  title: string;
  durationText: string;
  durationSeconds: number;
}

export interface CourseParseResult {
  episodes: ParsedEpisode[];
  totalEpisodes: number;
  totalDurationSeconds: number;
  unrecognizedLines: string[];
}

function parseTimeString(text: string): { durationSeconds: number; durationText: string } | null {
  const trimmed = text.trim();
  const hmsMatch = trimmed.match(/^(\d{1,2}):(\d{2}):(\d{2})$/);
  if (hmsMatch) {
    const hours = parseInt(hmsMatch[1], 10);
    const minutes = parseInt(hmsMatch[2], 10);
    const seconds = parseInt(hmsMatch[3], 10);
    if (minutes < 60 && seconds < 60) {
      return { durationSeconds: hours * 3600 + minutes * 60 + seconds, durationText: trimmed };
    }
  }
  const mmssMatch = trimmed.match(/^(\d{1,3}):(\d{2})$/);
  if (mmssMatch) {
    const minutes = parseInt(mmssMatch[1], 10);
    const seconds = parseInt(mmssMatch[2], 10);
    if (seconds < 60) {
      return { durationSeconds: minutes * 60 + seconds, durationText: trimmed };
    }
  }
  return null;
}

export function parseCourseText(rawText: string): CourseParseResult {
  const rawLines = rawText.split('\n');
  const episodes: ParsedEpisode[] = [];
  const unrecognizedLines: string[] = [];

  const lines = rawLines.map((l) => l.trim()).filter((l) => l.length > 0);
  const used = new Set<number>();

  for (let i = 0; i < lines.length; i++) {
    if (used.has(i)) continue;
    const line = lines[i];

    // Case 1: "Title MM:SS" / "Title H:MM:SS"
    const sameLineMatch = line.match(/^(.+?)\s+(\d{1,3}:\d{2}(?::\d{2})?)\s*$/);
    if (sameLineMatch) {
      const title = sameLineMatch[1].trim();
      const durationText = sameLineMatch[2];
      const parsed = parseTimeString(durationText);
      if (parsed && title) {
        episodes.push({ title, durationText, durationSeconds: parsed.durationSeconds });
        used.add(i);
        continue;
      }
    }

    // Case 2: 标题与时长分行
    if (i + 1 < lines.length) {
      const nextLine = lines[i + 1];
      const pureTimeMatch = nextLine.match(/^(\d{1,3}):(\d{2})(?::(\d{2}))?$/);
      if (pureTimeMatch) {
        const durationText = pureTimeMatch[0];
        const parsed = parseTimeString(durationText);
        if (parsed) {
          episodes.push({ title: line, durationText, durationSeconds: parsed.durationSeconds });
          used.add(i);
          used.add(i + 1);
          i++;
          continue;
        }
      }
    }

    // Case 3: 孤立时间行静默消费
    if (line.match(/^(\d{1,3}):(\d{2})(?::(\d{2}))?$/)) {
      used.add(i);
      continue;
    }
  }

  for (let i = 0; i < lines.length; i++) {
    if (!used.has(i)) {
      unrecognizedLines.push(lines[i]);
    }
  }

  const totalDurationSeconds = episodes.reduce((sum, ep) => sum + ep.durationSeconds, 0);

  return {
    episodes,
    totalEpisodes: episodes.length,
    totalDurationSeconds,
    unrecognizedLines,
  };
}