import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createCleanupService } from "../../src/desktop/cleanup";

let tempDir: string | null = null;

afterEach(async () => {
  if (tempDir) await rm(tempDir, { recursive: true, force: true });
  tempDir = null;
});

async function fixture() {
  tempDir = await mkdtemp(path.join(os.tmpdir(), "fanqie-cleanup-"));
  const applicationDataRoot = path.join(tempDir, "app-data");
  const novelDir = path.join(tempDir, "我的小说");
  const record = path.join(novelDir, ".fanqie-publish.json");
  const manuscript = path.join(novelDir, "第001章 开局.md");
  await mkdir(applicationDataRoot, { recursive: true });
  await mkdir(novelDir, { recursive: true });
  await writeFile(path.join(applicationDataRoot, "settings.json"), "{}", "utf8");
  await writeFile(record, "{}", "utf8");
  await writeFile(manuscript, "正文", "utf8");
  return { applicationDataRoot, novelDir, record, manuscript };
}

describe("desktop cleanup", () => {
  it("always removes app data but keeps novel records when requested", async () => {
    const paths = await fixture();
    const cleanup = createCleanupService({
      applicationDataRoot: paths.applicationDataRoot,
      readGeneratedFiles: async () => [paths.record]
    });

    const result = await cleanup.execute(false);

    expect(result.items).toContainEqual({ path: paths.record, status: "kept" });
    expect(result.items).toContainEqual({ path: paths.applicationDataRoot, status: "deleted" });
    await expect(access(paths.applicationDataRoot)).rejects.toThrow();
    await expect(readFile(paths.record, "utf8")).resolves.toBe("{}");
    await expect(readFile(paths.manuscript, "utf8")).resolves.toBe("正文");
  });

  it("removes only registered publish records without deleting the novel folder", async () => {
    const paths = await fixture();
    const unregistered = path.join(paths.novelDir, "notes.txt");
    await writeFile(unregistered, "keep", "utf8");
    const cleanup = createCleanupService({
      applicationDataRoot: paths.applicationDataRoot,
      readGeneratedFiles: async () => [paths.record, unregistered]
    });

    const preview = await cleanup.preview(true);
    expect(preview.novelRecords).toEqual([paths.record]);
    const result = await cleanup.execute(true);

    expect(result.items).toContainEqual({ path: paths.record, status: "deleted" });
    await expect(access(paths.record)).rejects.toThrow();
    await expect(readFile(unregistered, "utf8")).resolves.toBe("keep");
    await expect(readFile(paths.manuscript, "utf8")).resolves.toBe("正文");
  });

  it("reports missing and failed paths without claiming complete cleanup", async () => {
    const paths = await fixture();
    const missing = path.join(paths.novelDir, ".fanqie-publish.json");
    await rm(missing);
    const removePath = vi.fn(async (targetPath: string) => {
      if (targetPath === paths.applicationDataRoot) throw new Error("permission denied");
      await rm(targetPath);
    });
    const cleanup = createCleanupService({
      applicationDataRoot: paths.applicationDataRoot,
      readGeneratedFiles: async () => [missing],
      removePath
    });

    const result = await cleanup.execute(true);

    expect(result.complete).toBe(false);
    expect(result.items).toContainEqual({ path: missing, status: "missing" });
    expect(result.items).toContainEqual({
      path: paths.applicationDataRoot,
      status: "failed",
      error: "permission denied"
    });
  });
});
