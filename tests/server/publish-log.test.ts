import { describe, expect, it } from "vitest";
import { mergeChaptersWithLog, updateChapterStatus } from "../../src/server/publish-log";
import type { Chapter, PublishLog } from "../../src/shared/types";

const chapters: Chapter[] = [
  {
    chapterNumber: 1,
    displayNumber: "001",
    title: "第001章 开局",
    fileName: "第001章 开局.md",
    filePath: "/book/第001章 开局.md",
    body: "正文",
    characterCount: 2,
    status: "pending"
  },
  {
    chapterNumber: 2,
    displayNumber: "002",
    title: "第002章 夜雨",
    fileName: "第002章 夜雨.md",
    filePath: "/book/第002章 夜雨.md",
    body: "正文",
    characterCount: 2,
    status: "pending"
  }
];

describe("publish log", () => {
  it("marks scheduled chapters from existing log", () => {
    const log: PublishLog = {
      bookName: "测试书",
      updatedAt: "2026-06-30T00:00:00.000Z",
      chapters: [
        {
          chapterNumber: 1,
          title: "第001章 开局",
          fileName: "第001章 开局.md",
          characterCount: 2,
          plannedDate: "2026-06-30",
          plannedTime: "09:30",
          status: "scheduled"
        }
      ]
    };

    const result = mergeChaptersWithLog(chapters, log);

    expect(result[0].status).toBe("scheduled");
    expect(result[1].status).toBe("pending");
  });

  it("updates one chapter status without dropping other records", () => {
    const log: PublishLog = {
      bookName: "测试书",
      updatedAt: "2026-06-30T00:00:00.000Z",
      chapters: []
    };

    const result = updateChapterStatus(log, {
      chapterNumber: 2,
      title: "第002章 夜雨",
      fileName: "第002章 夜雨.md",
      characterCount: 2,
      plannedDate: "2026-07-01",
      plannedTime: "12:00",
      submittedAt: "2026-06-30T01:00:00.000Z",
      status: "scheduled"
    });

    expect(result.chapters).toHaveLength(1);
    expect(result.chapters[0].status).toBe("scheduled");
    expect(result.updatedAt).not.toBe(log.updatedAt);
  });
});
