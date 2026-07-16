import { access, rm } from "node:fs/promises";
import path from "node:path";
import type { CleanupPreview, CleanupResult, CleanupResultItem } from "./contracts";

interface CleanupServiceOptions {
  applicationDataRoot: string;
  readGeneratedFiles: () => Promise<string[]>;
  removePath?: (targetPath: string) => Promise<void>;
  pathExists?: (targetPath: string) => Promise<boolean>;
}

function isPublishRecord(filePath: string): boolean {
  return path.isAbsolute(filePath) && path.basename(filePath) === ".fanqie-publish.json";
}

export function createCleanupService(options: CleanupServiceOptions) {
  const removePath = options.removePath ?? ((targetPath: string) => rm(targetPath, {
    recursive: true,
    force: false
  }));
  const pathExists = options.pathExists ?? (async (targetPath: string) => {
    try {
      await access(targetPath);
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
      throw error;
    }
  });

  async function registeredRecords(): Promise<string[]> {
    const files = await options.readGeneratedFiles();
    return [...new Set(files.filter(isPublishRecord))];
  }

  async function preview(includeNovelRecords: boolean): Promise<CleanupPreview> {
    return {
      applicationData: [options.applicationDataRoot],
      novelRecords: includeNovelRecords ? await registeredRecords() : []
    };
  }

  async function removeOne(targetPath: string): Promise<CleanupResultItem> {
    try {
      if (!await pathExists(targetPath)) return { path: targetPath, status: "missing" };
      await removePath(targetPath);
      return { path: targetPath, status: "deleted" };
    } catch (error) {
      return {
        path: targetPath,
        status: "failed",
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  return {
    preview,

    async execute(includeNovelRecords: boolean): Promise<CleanupResult> {
      const records = await registeredRecords();
      const items: CleanupResultItem[] = [];
      for (const record of records) {
        items.push(includeNovelRecords
          ? await removeOne(record)
          : { path: record, status: "kept" });
      }
      items.push(await removeOne(options.applicationDataRoot));
      return {
        items,
        complete: items.every((item) => item.status !== "failed"),
        uninstallStarted: false
      };
    }
  };
}
