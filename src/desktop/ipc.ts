import type {
  CleanupPreview,
  CleanupResult,
  DesktopInfo,
  DesktopRuntime
} from "./contracts";

export const DESKTOP_IPC_CHANNELS = {
  getRuntime: "fanqie:get-runtime",
  selectNovelFolder: "fanqie:select-novel-folder",
  rememberRecentFolder: "fanqie:remember-recent-folder",
  getDesktopInfo: "fanqie:get-desktop-info",
  openPath: "fanqie:open-path",
  openReleasePage: "fanqie:open-release-page",
  exportDiagnostics: "fanqie:export-diagnostics",
  previewCleanup: "fanqie:preview-cleanup",
  beginUninstall: "fanqie:begin-uninstall"
} as const;

export interface IpcInvokeEventLike {
  senderFrame?: { url: string } | null;
  sender: { getURL(): string };
}

export interface IpcMainLike {
  handle(
    channel: string,
    listener: (event: IpcInvokeEventLike, ...args: any[]) => unknown
  ): void;
}

export interface DesktopIpcHandlers {
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

export function isAllowedRendererUrl(rendererUrl: string, allowedOrigins: string[]): boolean {
  try {
    const origin = new URL(rendererUrl).origin;
    return allowedOrigins.some((allowed) => new URL(allowed).origin === origin);
  } catch {
    return false;
  }
}

function authorize(
  allowedRendererOrigins: string[],
  handler: (...args: any[]) => unknown
) {
  return (event: IpcInvokeEventLike, ...args: any[]) => {
    const rendererUrl = event.senderFrame?.url || event.sender.getURL();
    if (!isAllowedRendererUrl(rendererUrl, allowedRendererOrigins)) {
      throw new Error("不允许的桌面请求来源。");
    }
    return handler(...args);
  };
}

export function registerDesktopIpc(options: {
  ipcMain: IpcMainLike;
  allowedRendererOrigins: string[];
  handlers: DesktopIpcHandlers;
}) {
  const { ipcMain, allowedRendererOrigins, handlers } = options;
  ipcMain.handle(DESKTOP_IPC_CHANNELS.getRuntime, authorize(allowedRendererOrigins, () => handlers.getRuntime()));
  ipcMain.handle(DESKTOP_IPC_CHANNELS.selectNovelFolder, authorize(allowedRendererOrigins, () => handlers.selectNovelFolder()));
  ipcMain.handle(DESKTOP_IPC_CHANNELS.rememberRecentFolder, authorize(allowedRendererOrigins, (folderPath) => handlers.rememberRecentFolder(folderPath)));
  ipcMain.handle(DESKTOP_IPC_CHANNELS.getDesktopInfo, authorize(allowedRendererOrigins, () => handlers.getDesktopInfo()));
  ipcMain.handle(DESKTOP_IPC_CHANNELS.openPath, authorize(allowedRendererOrigins, (targetPath) => handlers.openPath(targetPath)));
  ipcMain.handle(DESKTOP_IPC_CHANNELS.openReleasePage, authorize(allowedRendererOrigins, () => handlers.openReleasePage()));
  ipcMain.handle(DESKTOP_IPC_CHANNELS.exportDiagnostics, authorize(allowedRendererOrigins, () => handlers.exportDiagnostics()));
  ipcMain.handle(DESKTOP_IPC_CHANNELS.previewCleanup, authorize(allowedRendererOrigins, (includeNovelRecords) => handlers.previewCleanup(includeNovelRecords)));
  ipcMain.handle(DESKTOP_IPC_CHANNELS.beginUninstall, authorize(allowedRendererOrigins, (includeNovelRecords) => handlers.beginUninstall(includeNovelRecords)));
}
