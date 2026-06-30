const FILE_NAME_PATTERN = /^第(\d{3})章\s+(.+)\.md$/u;

export interface ParsedChapterName {
  chapterNumber: number;
  displayNumber: string;
  title: string;
}

export interface ParsedMarkdownBody {
  body: string;
  characterCount: number;
}

export function parseChapterFileName(fileName: string): ParsedChapterName | null {
  const match = fileName.match(FILE_NAME_PATTERN);
  if (!match) return null;

  const displayNumber = match[1];
  const chapterName = match[2].trim();

  return {
    chapterNumber: Number(displayNumber),
    displayNumber,
    title: `第${displayNumber}章 ${chapterName}`
  };
}

export function parseMarkdownBody(markdown: string): ParsedMarkdownBody {
  const normalized = markdown.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");
  const bodyLines = lines[0]?.startsWith("# ") ? lines.slice(1) : lines;
  const body = bodyLines.join("\n").trim();

  return {
    body,
    characterCount: countChinesePublishingCharacters(body)
  };
}

function countChinesePublishingCharacters(text: string): number {
  return Array.from(text).filter((char) => !/\s/u.test(char)).length;
}
