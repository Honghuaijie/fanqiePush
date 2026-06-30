import { describe, expect, it } from "vitest";
import { generatePublishPlan } from "../../src/server/schedule";
import type { Chapter } from "../../src/shared/types";

function chapter(number: number, status: Chapter["status"] = "pending"): Chapter {
  const displayNumber = String(number).padStart(3, "0");
  return {
    chapterNumber: number,
    displayNumber,
    title: `第${displayNumber}章 测试${number}`,
    fileName: `第${displayNumber}章 测试${number}.md`,
    filePath: `/book/第${displayNumber}章 测试${number}.md`,
    body: "正文",
    characterCount: 2,
    status
  };
}

describe("schedule", () => {
  it("generates four daily publish slots from selected range", () => {
    const plan = generatePublishPlan({
      chapters: [chapter(5), chapter(6), chapter(7), chapter(8), chapter(9)],
      startChapter: 5,
      endChapter: 9,
      startDate: "2026-06-30"
    });

    expect(plan.map((item) => `${item.chapterNumber}:${item.plannedDate} ${item.plannedTime}`)).toEqual([
      "5:2026-06-30 09:30",
      "6:2026-06-30 12:00",
      "7:2026-06-30 19:00",
      "8:2026-06-30 19:05",
      "9:2026-07-01 09:30"
    ]);
  });

  it("skips already scheduled chapters", () => {
    const plan = generatePublishPlan({
      chapters: [chapter(1, "scheduled"), chapter(2), chapter(3)],
      startChapter: 1,
      endChapter: 3,
      startDate: "2026-06-30"
    });

    expect(plan.map((item) => item.chapterNumber)).toEqual([2, 3]);
  });

  it("uses custom daily publish times to decide chapters per day", () => {
    const plan = generatePublishPlan({
      chapters: [chapter(1), chapter(2), chapter(3), chapter(4)],
      startChapter: 1,
      endChapter: 4,
      startDate: "2026-06-30",
      dailyTimes: ["08:00", "13:30", "22:00"]
    });

    expect(plan.map((item) => `${item.chapterNumber}:${item.plannedDate} ${item.plannedTime}`)).toEqual([
      "1:2026-06-30 08:00",
      "2:2026-06-30 13:30",
      "3:2026-06-30 22:00",
      "4:2026-07-01 08:00"
    ]);
  });
});
