import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import type { DesktopPaths } from "./app-paths";

export interface DesktopSettings {
  schemaVersion: 1;
  recentFolders: string[];
}

export interface InterruptedTask {
  bookName: string;
  folderPath: string;
  startedAt: string;
}

export interface AtomicWriteOperations {
  writeFile(filePath: string, content: string): Promise<void>;
  rename(from: string, to: string): Promise<void>;
}

const defaultWriteOperations: AtomicWriteOperations = {
  async writeFile(filePath, content) {
    await writeFile(filePath, content, "utf8");
  },
  rename
};

const defaultSettings: DesktopSettings = {
  schemaVersion: 1,
  recentFolders: []
};

function isMissingFile(error: unknown): boolean {
  return (error as NodeJS.ErrnoException).code === "ENOENT";
}

export function createAppDataStore(
  paths: DesktopPaths,
  writeOperations: AtomicWriteOperations = defaultWriteOperations
) {
  async function ensureRoot() {
    await mkdir(paths.root, { recursive: true });
  }

  async function atomicWrite(destination: string, content: string) {
    await ensureRoot();
    const temporaryFile = `${destination}.tmp-${process.pid}-${randomUUID()}`;
    await writeOperations.writeFile(temporaryFile, content);
    await writeOperations.rename(temporaryFile, destination);
  }

  async function readSettings(): Promise<DesktopSettings> {
    try {
      const parsed = JSON.parse(await readFile(paths.settingsFile, "utf8")) as Partial<DesktopSettings>;
      return {
        schemaVersion: 1,
        recentFolders: Array.isArray(parsed.recentFolders)
          ? parsed.recentFolders.filter((folder): folder is string => typeof folder === "string")
          : []
      };
    } catch (error) {
      if (isMissingFile(error)) return { ...defaultSettings, recentFolders: [] };
      throw error;
    }
  }

  async function writeSettings(settings: DesktopSettings) {
    await atomicWrite(paths.settingsFile, `${JSON.stringify(settings, null, 2)}\n`);
  }

  async function readGeneratedFiles(): Promise<string[]> {
    try {
      const content = await readFile(paths.generatedFilesText, "utf8");
      return [...new Set(content.split(/\r?\n/).map((line) => line.trim()).filter(Boolean))];
    } catch (error) {
      if (isMissingFile(error)) return [];
      throw error;
    }
  }

  async function pathSize(targetPath: string): Promise<number> {
    try {
      const details = await stat(targetPath);
      if (details.isFile()) return details.size;
      if (!details.isDirectory()) return 0;

      const entries = await readdir(targetPath, { withFileTypes: true });
      const sizes = await Promise.all(entries.map((entry) => {
        if (entry.isSymbolicLink()) return 0;
        return pathSize(path.join(targetPath, entry.name));
      }));
      return sizes.reduce((total, size) => total + size, 0);
    } catch (error) {
      if (isMissingFile(error)) return 0;
      throw error;
    }
  }

  return {
    readSettings,

    async rememberFolder(folderPath: string) {
      const settings = await readSettings();
      settings.recentFolders = [
        folderPath,
        ...settings.recentFolders.filter((existing) => existing !== folderPath)
      ].slice(0, 10);
      await writeSettings(settings);
      return settings;
    },

    async registerGeneratedFile(filePath: string) {
      const existing = await readGeneratedFiles();
      if (!existing.includes(filePath)) existing.push(filePath);
      await atomicWrite(paths.generatedFilesText, existing.length > 0 ? `${existing.join("\n")}\n` : "");
      return existing;
    },

    readGeneratedFiles,

    async getStorageUsage() {
      const generatedFiles = await readGeneratedFiles();
      const [applicationBytes, profileBytes, logsBytes, generatedSizes] = await Promise.all([
        pathSize(paths.root),
        pathSize(paths.defaultAccountProfile),
        pathSize(paths.logsDir),
        Promise.all(generatedFiles.map(pathSize))
      ]);
      return {
        applicationBytes,
        profileBytes,
        logsBytes,
        generatedBytes: generatedSizes.reduce((total, size) => total + size, 0)
      };
    },

    async markTaskActive(task: InterruptedTask) {
      await atomicWrite(paths.interruptedTaskFile, `${JSON.stringify(task, null, 2)}\n`);
    },

    async readTaskMarker(): Promise<InterruptedTask | undefined> {
      try {
        return JSON.parse(await readFile(paths.interruptedTaskFile, "utf8")) as InterruptedTask;
      } catch (error) {
        if (isMissingFile(error)) return undefined;
        throw error;
      }
    },

    async clearTaskMarker() {
      await rm(paths.interruptedTaskFile, { force: true });
    }
  };
}
