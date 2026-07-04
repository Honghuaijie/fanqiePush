export interface ParsedChapterName {
  chapterNumber: number;
  displayNumber: string;
  title: string;
  autoNumbered?: boolean;
}

export interface ParsedMarkdownBody {
  body: string;
  characterCount: number;
}

interface ChapterNameMatch {
  chapterNumber: number;
  displayNumber: string;
  chapterName?: string;
  keepDisplayNumber: boolean;
}

const FILE_NAME_PATTERNS: Array<(baseName: string) => ChapterNameMatch | null> = [
  (baseName) => {
    const match = baseName.match(/^第(\d+)章(?:[\s._-]+(.+))?$/u);
    if (!match) return null;
    return {
      chapterNumber: Number(match[1]),
      displayNumber: match[1],
      chapterName: match[2]?.trim(),
      keepDisplayNumber: true
    };
  },
  (baseName) => {
    const match = baseName.match(/^(\d+)(?:[\s._-]+(.+))?$/u);
    if (!match) return null;
    return {
      chapterNumber: Number(match[1]),
      displayNumber: match[1],
      chapterName: match[2]?.trim(),
      keepDisplayNumber: false
    };
  }
];

export function parseChapterFileName(fileName: string, fallbackNumber?: number): ParsedChapterName | null {
  if (!fileName.endsWith(".md")) return null;

  const baseName = fileName.slice(0, -3).trim();
  if (!baseName) return null;

  for (const pattern of FILE_NAME_PATTERNS) {
    const match = pattern(baseName);
    if (!match) continue;

    const displayNumber = match.keepDisplayNumber ? match.displayNumber : normalizeDisplayNumber(match.chapterNumber, match.displayNumber);
    return buildParsedChapterName({
      chapterNumber: match.chapterNumber,
      displayNumber,
      chapterName: match.chapterName
    });
  }

  if (fallbackNumber === undefined) return null;

  const displayNumber = String(fallbackNumber).padStart(3, "0");
  return {
    ...buildParsedChapterName({
      chapterNumber: fallbackNumber,
      displayNumber,
      chapterName: baseName
    }),
    autoNumbered: true
  };
}

function buildParsedChapterName(input: {
  chapterNumber: number;
  displayNumber: string;
  chapterName?: string;
}): ParsedChapterName {
  const chapterName = input.chapterName?.trim();

  return {
    chapterNumber: input.chapterNumber,
    displayNumber: input.displayNumber,
    title: chapterName ? `第${input.displayNumber}章 ${chapterName}` : `第${input.displayNumber}章`
  };
}

function normalizeDisplayNumber(chapterNumber: number, rawDisplayNumber: string): string {
  if (rawDisplayNumber.length >= 3) return rawDisplayNumber;
  return String(chapterNumber).padStart(3, "0");
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
