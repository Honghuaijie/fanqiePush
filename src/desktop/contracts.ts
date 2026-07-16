import type { ChromeDetectionResult } from "./chrome";

export interface DesktopRuntime {
  apiOrigin: string;
  apiToken: string;
}

export interface StorageUsage {
  applicationBytes: number;
  profileBytes: number;
  logsBytes: number;
  generatedBytes: number;
}

export interface DesktopInfo {
  version: string;
  releaseUrl: string;
  chrome: ChromeDetectionResult;
  paths: {
    applicationData: string;
    chromeProfile: string;
    logs: string;
  };
  usage: StorageUsage;
  recentFolders: string[];
  generatedFiles: string[];
  interruptedTask?: {
    bookName: string;
    folderPath: string;
    startedAt: string;
  };
}

export interface CleanupPreview {
  applicationData: string[];
  novelRecords: string[];
}

export interface CleanupResultItem {
  path: string;
  status: "pending" | "deleted" | "kept" | "missing" | "failed";
  error?: string;
}

export interface CleanupResult {
  items: CleanupResultItem[];
  complete?: boolean;
  uninstallStarted?: boolean;
  message?: string;
}

export interface FanqieDesktopBridge {
  getRuntime(): Promise<DesktopRuntime>;
  selectNovelFolder(): Promise<string | null>;
  rememberRecentFolder(folderPath: string): Promise<void>;
  getDesktopInfo(): Promise<DesktopInfo>;
  openPath(targetPath: string): Promise<{ ok: boolean; error?: string }>;
  openReleasePage(): Promise<void>;
  exportDiagnostics(): Promise<string | null>;
  previewCleanup(includeNovelRecords: boolean): Promise<CleanupPreview>;
  beginUninstall(includeNovelRecords: boolean): Promise<CleanupResult>;
}
