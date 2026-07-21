import { access, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { detectChrome } from "../../src/desktop/chrome";
import {
  createPlaywrightBrowserLauncher,
  createPublishController,
  type PublishController
} from "../../src/server/automation/publisher";
import { startFanqieMockServer } from "./fanqie-mock-server";

const temporaryPaths: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryPaths.splice(0).map((target) => rm(target, { recursive: true, force: true })));
});

describe("scheduled publish flow against local Fanqie pages", () => {
  it.each([
    ["错别字提示分支", true],
    ["直接检测分支", false]
  ])("publishes through %s using full detection only", async (_name, typoPrompt) => {
    const root = await mkdtemp(path.join(os.tmpdir(), "fanqie-e2e-"));
    temporaryPaths.push(root);
    const bookDir = path.join(root, "测试书");
    const profileDir = path.join(root, "chrome-profile");
    await mkdir(bookDir);
    const body = `测试正文。${"这是用于本地自动化验证的章节内容。".repeat(90)}`;
    await writeFile(path.join(bookDir, "第001章 开局.md"), `# 第001章 开局\n\n${body}`, "utf8");
    const mock = await startFanqieMockServer({ typoPrompt });
    let controller: PublishController | undefined;

    try {
      const chrome = await detectChrome();
      expect(chrome.executablePath).toBeTruthy();
      const requestUrls: string[] = [];
      const launcher = createPlaywrightBrowserLauncher({
        executablePath: chrome.executablePath,
        headless: true,
        viewport: { width: 1400, height: 900 },
        onRequest: (url) => requestUrls.push(url)
      });
      controller = createPublishController(launcher, {
        resolveProfileDir: () => profileDir,
        bookManageUrl: `${mock.origin}/main/writer/book-manage`
      });
      const item = {
        chapterNumber: 1,
        title: "第001章 开局",
        fileName: "第001章 开局.md",
        characterCount: body.length,
        plannedDate: "2026-08-01",
        plannedTime: "09:30",
        status: "pending" as const
      };

      const opened = await controller.start({ bookName: "测试书", folderPath: bookDir, items: [item] });
      expect(opened.status).toBe("paused");
      const completed = await controller.scheduleCurrentChapter();
      expect(completed.status).toBe("stopped");

      expect(mock.detectionClicks).toEqual(["full"]);
      expect(requestUrls.some((url) => url.includes("fanqienovel.com"))).toBe(false);
      expect(mock.submissions).toEqual([expect.objectContaining({
        chapterNumber: "1",
        title: "第001章 开局",
        body: expect.stringContaining("测试正文"),
        plannedDate: "2026-08-01",
        plannedTime: "09:30",
        aiUsed: false,
        detectionMethod: "full"
      })]);
      const publishLog = JSON.parse(await readFile(path.join(bookDir, ".fanqie-publish.json"), "utf8"));
      expect(publishLog.chapters).toContainEqual(expect.objectContaining({
        chapterNumber: 1,
        status: "scheduled"
      }));
      await expect(access(path.join(bookDir, ".fanqie-browser-profile"))).rejects.toThrow();
    } finally {
      await controller?.stop();
      await mock.close();
    }
  }, 120_000);
});
