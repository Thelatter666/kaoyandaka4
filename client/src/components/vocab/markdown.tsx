/**
 * 极简 Markdown 渲染（零新依赖，只覆盖词卡 extra 的实际排版需求）：
 * - 按空行分段；
 * - 整段均为 `- ` 开头的行时聚合为 <ul>；
 * - 行内 `**bold**` 支持（单 `*斜体*` 不做，按纯文本显示）；
 * - 其余一律按纯文本节点输出。
 *
 * 安全红线：**不使用 dangerouslySetInnerHTML**。LLM 输出不可信，
 * 任何 HTML 标签都按字面量展示，渲染层不存在注入口。
 */
import React from 'react';

/** 行内 **bold** 拆分为纯文本/strong 节点序列 */
function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const boldRe = /\*\*([^*\n]+)\*\*/g;
  let cursor = 0;
  let match: RegExpExecArray | null;
  let index = 0;
  while ((match = boldRe.exec(text)) !== null) {
    if (match.index > cursor) nodes.push(text.slice(cursor, match.index));
    nodes.push(<strong key={`${keyPrefix}-b${index++}`}>{match[1]}</strong>);
    cursor = match.index + match[0].length;
  }
  if (cursor < text.length) nodes.push(text.slice(cursor));
  return nodes;
}

export function MarkdownText({ text }: { text: string }) {
  const blocks = React.useMemo(
    () =>
      text
        .split(/\n\s*\n/)
        .map((block) => block.trim())
        .filter((block) => block.length > 0),
    [text]
  );

  return (
    <div className="vocab-md">
      {blocks.map((block, blockIndex) => {
        const lines = block
          .split('\n')
          .map((line) => line.trim())
          .filter((line) => line.length > 0);
        const isList = lines.length > 0 && lines.every((line) => /^[-*]\s+/.test(line));

        if (isList) {
          return (
            <ul className="vocab-md__list" key={`blk${blockIndex}`}>
              {lines.map((line, lineIndex) => (
                <li key={`blk${blockIndex}-l${lineIndex}`}>
                  {renderInline(line.replace(/^[-*]\s+/, ''), `blk${blockIndex}-l${lineIndex}`)}
                </li>
              ))}
            </ul>
          );
        }

        return (
          <p className="vocab-md__p" key={`blk${blockIndex}`}>
            {lines.map((line, lineIndex) => (
              <React.Fragment key={`blk${blockIndex}-l${lineIndex}`}>
                {lineIndex > 0 && <br />}
                {renderInline(line, `blk${blockIndex}-l${lineIndex}`)}
              </React.Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}
