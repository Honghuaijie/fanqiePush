import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import * as fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createAppDataStore } from "../../src/desktop/app-data";
import { createDesktopPaths } from "../../src/desktop/app-paths";

let tempDir: string | null = null;

afterEach(async () => {
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
    tempDir = null;
  }
});

async function createStore() {
  tempDir = await mkdtemp(path.join(os.tmpdir(), "fanqie-desktop-data-"));
  const paths = createDesktopPaths(tempDir);
  return { paths, store: createAppDataStore(paths) };
}

describe("desktop app data", () => {
  it("uses stable paths under the operating system user data root", async () => {
    const { paths } = await createStore();

    expect(paths.defaultAccountProfile).toBe(
      path.join(tempDir!, "accounts", "default", "chrome-profile")
    );
    expect(paths.settingsFile).toBe(path.join(tempDir!, "settings.json"));
    expect(paths.generatedFilesText).toBe(path.join(tempDir!, "generated-files.txt"));
    expect(paths.interruptedTaskFile).toBe(path.join(tempDir!, "active-publish-task.json"));
  });

  it("stores a versioned list of the ten most recently used unique folders", async () => {
    const { store } = await createStore();

    for (let index = 1; index <= 11; index += 1) {
      await store.rememberFolder(`/books/book-${index}`);
    }
    await store.rememberFolder("/books/book-5");

    const settings = await store.readSettings();
    expect(settings.schemaVersion).toBe(1);
    expect(settings.recentFolders).toHaveLength(10);
    expect(settings.recentFolders[0]).toBe("/books/book-5");
    expect(new Set(settings.recentFolders).size).toBe(10);
    expect(settings.recentFolders).not.toContain("/books/book-1");
  });

  it("deduplicates generated file paths while preserving their registration order", async () => {
    const { paths, store } = await createStore();

    await store.registerGeneratedFile("/books/one/.fanqie-publish.json");
    await store.registerGeneratedFile("/books/two/.fanqie-publish.json");
    await store.registerGeneratedFile("/books/one/.fanqie-publish.json");

    expect(await store.readGeneratedFiles()).toEqual([
      "/books/one/.fanqie-publish.json",
      "/books/two/.fanqie-publish.json"
    ]);
    expect(await readFile(paths.generatedFilesText, "utf8")).toBe(
      "/books/one/.fanqie-publish.json\n/books/two/.fanqie-publish.json\n"
    );
  });

  it("writes settings through a temporary file before replacing the destination", async () => {
    const events: string[] = [];
    const { paths } = await createStore();
    const store = createAppDataStore(paths, {
      async writeFile(filePath, content) {
        events.push(`write:${filePath}`);
        await fs.writeFile(filePath, content, "utf8");
      },
      async rename(from, to) {
        events.push(`rename:${from}->${to}`);
        await fs.rename(from, to);
      }
    });

    await store.rememberFolder("/books/atomic");

    expect(events).toHaveLength(2);
    expect(events[0]).toMatch(/write:.*settings\.json\.tmp-/);
    expect(events[1]).toContain(`->${paths.settingsFile}`);
    expect(events[1]?.split("->")[0]?.replace("rename:", "")).toBe(
      events[0]?.replace("write:", "")
    );
  });

  it("persists and clears the interrupted publish task marker", async () => {
    const { store } = await createStore();
    const task = {
      bookName: "测试书",
      folderPath: "/books/测试书",
      startedAt: "2026-07-16T10:00:00.000Z"
    };

    await store.markTaskActive(task);
    await expect(store.readTaskMarker()).resolves.toEqual(task);

    await store.clearTaskMarker();
    await expect(store.readTaskMarker()).resolves.toBeUndefined();
  });

  it("counts application storage and only registered novel record files", async () => {
    const { paths, store } = await createStore();
    const bookDir = path.join(tempDir!, "outside-book");
    const publishRecord = path.join(bookDir, ".fanqie-publish.json");
    await mkdir(paths.defaultAccountProfile, { recursive: true });
    await mkdir(paths.logsDir, { recursive: true });
    await mkdir(bookDir, { recursive: true });
    await writeFile(path.join(paths.defaultAccountProfile, "profile.bin"), "1234", "utf8");
    await writeFile(path.join(paths.logsDir, "desktop.log"), "123", "utf8");
    await writeFile(path.join(bookDir, "第001章 开局.md"), "这段正文不能计入生成文件占用", "utf8");
    await writeFile(publishRecord, "12345", "utf8");
    await store.registerGeneratedFile(publishRecord);

    const usage = await store.getStorageUsage();

    expect(usage.profileBytes).toBe(4);
    expect(usage.logsBytes).toBe(3);
    expect(usage.generatedBytes).toBe(5);
    expect(usage.applicationBytes).toBeGreaterThanOrEqual(7);
  });
});
