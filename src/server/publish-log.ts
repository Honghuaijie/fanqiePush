import type { Chapter, PublishLog, PublishLogChapter } from "../shared/types";

export function createEmptyPublishLog(bookName: string): PublishLog {
  return {
    bookName,
    updatedAt: new Date().toISOString(),
    chapters: []
  };
}

export function mergeChaptersWithLog(chapters: Chapter[], log: PublishLog | null): Chapter[] {
  if (!log) return chapters;

  const byFileName = new Map(log.chapters.map((chapter) => [chapter.fileName, chapter]));

  return chapters.map((chapter) => {
    const existing = byFileName.get(chapter.fileName);
    if (!existing) return chapter;

    return {
      ...chapter,
      status: existing.status
    };
  });
}

export function updateChapterStatus(log: PublishLog, chapter: PublishLogChapter): PublishLog {
  const chapters = log.chapters.filter((item) => item.fileName !== chapter.fileName);
  chapters.push(chapter);
  chapters.sort((a, b) => a.chapterNumber - b.chapterNumber);

  return {
    ...log,
    updatedAt: new Date().toISOString(),
    chapters
  };
}

export function shouldSkipChapter(status: string): boolean {
  return status === "scheduled";
}
