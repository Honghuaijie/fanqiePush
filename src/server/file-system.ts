import { promises as fs } from "node:fs";
import path from "node:path";
import { PUBLISH_LOG_FILE } from "../shared/constants";
import type { Chapter, PublishLog } from "../shared/types";
import { parseChapterFileName, parseMarkdownBody } from "./chapter-parser";
import { createEmptyPublishLog, mergeChaptersWithLog } from "./publish-log";

export interface ImportedBook {
  bookName: string;
  folderPath: string;
  totalMarkdownFiles: number;
  recognizedChapters: number;
  autoNumberedChapters: number;
  warnings: string[];
  hasPublishLog: boolean;
  chapters: Chapter[];
  publishLog: PublishLog;
}

export async function importBookFolder(folderPath: string): Promise<ImportedBook> {
  const entries = await fs.readdir(folderPath, { withFileTypes: true });
  const bookName = path.basename(folderPath);
  const markdownFiles = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right, "zh-CN", { numeric: true }));

  const publishLog = await readPublishLog(folderPath, bookName);
  const chapters: Chapter[] = [];
  const warnings: string[] = [];
  let autoNumberedChapters = 0;

  for (const [index, fileName] of markdownFiles.entries()) {
    const parsedName = parseChapterFileName(fileName, index + 1);
    if (!parsedName) continue;

    if (parsedName.autoNumbered) {
      autoNumberedChapters += 1;
    }

    const filePath = path.join(folderPath, fileName);
    const markdown = await fs.readFile(filePath, "utf8");
    const parsedBody = parseMarkdownBody(markdown);

    chapters.push({
      ...parsedName,
      fileName,
      filePath,
      body: parsedBody.body,
      characterCount: parsedBody.characterCount,
      status: "pending",
      autoNumbered: parsedName.autoNumbered
    });
  }

  chapters.sort((a, b) => a.chapterNumber - b.chapterNumber);
  const mergedChapters = mergeChaptersWithLog(chapters, publishLog.log);
  if (autoNumberedChapters > 0) {
    warnings.push(`有 ${autoNumberedChapters} 个章节未从文件名识别到章节号，已按文件顺序自动编号，请确认顺序。`);
  }

  return {
    bookName,
    folderPath,
    totalMarkdownFiles: markdownFiles.length,
    recognizedChapters: mergedChapters.length,
    autoNumberedChapters,
    warnings,
    hasPublishLog: publishLog.exists,
    chapters: mergedChapters,
    publishLog: publishLog.log ?? createEmptyPublishLog(bookName)
  };
}

export async function readPublishLog(
  folderPath: string,
  bookName: string
): Promise<{ exists: boolean; log: PublishLog | null }> {
  const logPath = path.join(folderPath, PUBLISH_LOG_FILE);

  try {
    const content = await fs.readFile(logPath, "utf8");
    return { exists: true, log: JSON.parse(content) as PublishLog };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { exists: false, log: createEmptyPublishLog(bookName) };
    }
    throw error;
  }
}

export async function writePublishLog(folderPath: string, log: PublishLog): Promise<void> {
  const logPath = path.join(folderPath, PUBLISH_LOG_FILE);
  await fs.writeFile(logPath, `${JSON.stringify(log, null, 2)}\n`, "utf8");
}
