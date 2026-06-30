import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { handleImportBook, handleGeneratePlan } from "../../src/server/route-handlers";

let tempDir: string | null = null;

afterEach(async () => {
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
    tempDir = null;
  }
});

describe("routes", () => {
  it("imports a folder and generates a plan", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "fanqie-book-"));
    const bookDir = path.join(tempDir, "测试书");
    await mkdir(bookDir);
    await writeFile(path.join(bookDir, "第001章 开局.md"), "# 第001章 开局\n\n正文一", "utf8");
    await writeFile(path.join(bookDir, "第002章 夜雨.md"), "# 第002章 夜雨\n\n正文二", "utf8");

    const imported = await handleImportBook({ folderPath: bookDir });

    expect(imported.bookName).toBe("测试书");
    expect(imported.recognizedChapters).toBe(2);

    const plan = await handleGeneratePlan({
      folderPath: bookDir,
      startChapter: 1,
      endChapter: 2,
      startDate: "2026-06-30",
      dailyTimes: ["08:00"]
    });

    expect(plan.items).toHaveLength(2);
    expect(plan.items.map((item) => `${item.plannedDate} ${item.plannedTime}`)).toEqual([
      "2026-06-30 08:00",
      "2026-07-01 08:00"
    ]);
  });
});
