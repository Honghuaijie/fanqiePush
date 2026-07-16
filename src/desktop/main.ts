import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { readdir } from "node:fs/promises";
import path from "node:path";
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  shell
} from "electron";
import { createPublishController, playwrightBrowserLauncher } from "../server/automation/publisher";
import type { PublishController } from "../server/automation/publisher";
import { startLocalServer, type LocalServerHandle } from "../server/start-server";
import { createAppDataStore } from "./app-data";
import { createDesktopPaths } from "./app-paths";
import { detectChrome } from "./chrome";
import { createCleanupService } from "./cleanup";
import { isAllowedRendererUrl, registerDesktopIpc } from "./ipc";
import { confirmCloseIfPublishing } from "./lifecycle";
import { createLogStore } from "./log-store";

const RELEASE_URL = "https://github.com/Honghuaijie/fanqiePush/releases";
const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;

let mainWindow: BrowserWindow | null = null;
let localServer: LocalServerHandle | null = null;
let publishController: PublishController | null = null;
let quitApproved = false;
let quitInProgress = false;

app.setPath(
  "userData",
  process.env.FANQIE_APP_DATA_DIR
    ? path.resolve(process.env.FANQIE_APP_DATA_DIR)
    : path.join(app.getPath("appData"), "fanqie-publish-tool")
);

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });

  void startDesktopApp().catch((error) => {
    dialog.showErrorBox(
      "番茄章节发布工具启动失败",
      error instanceof Error ? error.message : String(error)
    );
    app.quit();
  });
}

async function startDesktopApp() {
  await app.whenReady();

  const paths = createDesktopPaths(app.getPath("userData"));
  const dataStore = createAppDataStore(paths);
  const logStore = createLogStore({
    logsDir: paths.logsDir,
    diagnosticsDir: paths.diagnosticsDir
  });
  await logStore.pruneExpired();
  const chrome = await detectChrome();
  const cleanupService = createCleanupService({
    applicationDataRoot: paths.root,
    readGeneratedFiles: () => dataStore.readGeneratedFiles()
  });
  const apiToken = randomBytes(32).toString("hex");
  publishController = createPublishController(playwrightBrowserLauncher, {
    resolveProfileDir: () => paths.defaultAccountProfile,
    chromeExecutablePath: chrome.executablePath,
    onGeneratedFile: async (filePath) => {
      await dataStore.registerGeneratedFile(filePath);
    },
    onTaskStarted: (input) => dataStore.markTaskActive({
      bookName: input.bookName,
      folderPath: input.folderPath,
      startedAt: new Date().toISOString()
    }),
    onTaskFinished: () => dataStore.clearTaskMarker(),
    onLogEntry: (entry) => logStore.append(entry.level, entry.message)
  });

  localServer = await startLocalServer({
    port: 0,
    apiToken,
    allowedOrigins: DEV_SERVER_URL ? [DEV_SERVER_URL] : [],
    staticDir: DEV_SERVER_URL ? undefined : path.join(__dirname, "..", "dist"),
    publishController
  });

  const rendererUrl = DEV_SERVER_URL ?? localServer.origin;
  const allowedRendererOrigins = [rendererUrl];

  registerDesktopIpc({
    ipcMain,
    allowedRendererOrigins,
    handlers: {
      getRuntime: async () => ({ apiOrigin: localServer!.origin, apiToken }),
      selectNovelFolder: async () => {
        const result = await dialog.showOpenDialog(mainWindow!, {
          title: "选择小说文件夹",
          properties: ["openDirectory"]
        });
        return result.canceled ? null : result.filePaths[0] ?? null;
      },
      rememberRecentFolder: async (folderPath) => {
        await dataStore.rememberFolder(folderPath);
      },
      getDesktopInfo: async () => {
        const settings = await dataStore.readSettings();
        const usage = await dataStore.getStorageUsage();
        return {
          version: app.getVersion(),
          releaseUrl: RELEASE_URL,
          chrome,
          paths: {
            applicationData: paths.root,
            chromeProfile: paths.defaultAccountProfile,
            logs: paths.logsDir
          },
          usage,
          recentFolders: settings.recentFolders,
          generatedFiles: await dataStore.readGeneratedFiles(),
          interruptedTask: await dataStore.readTaskMarker()
        };
      },
      openPath: async (targetPath) => {
        const error = await shell.openPath(targetPath);
        return error ? { ok: false, error } : { ok: true };
      },
      openReleasePage: async () => {
        await shell.openExternal(RELEASE_URL);
      },
      exportDiagnostics: async () => {
        const settings = await dataStore.readSettings();
        const diagnosticPath = await logStore.exportDiagnostics({
          appVersion: app.getVersion(),
          platform: process.platform,
          chromeInstalled: chrome.installed,
          settings
        });
        await logStore.append("info", "已导出诊断包。", { diagnosticPath });
        return diagnosticPath;
      },
      previewCleanup: (includeNovelRecords) => cleanupService.preview(includeNovelRecords),
      beginUninstall: async (includeNovelRecords) => {
        if (!app.isPackaged) {
          return {
            items: [],
            complete: false,
            uninstallStarted: false,
            message: "开发模式不会删除源码或数据，请安装正式版本后再使用卸载功能。"
          };
        }

        await publishController?.stop();
        await logStore.flush();
        const result = await cleanupService.execute(includeNovelRecords);
        if (!result.complete) {
          return {
            ...result,
            message: "部分数据清理失败，尚未启动系统卸载。请处理失败路径后重试。"
          };
        }

        try {
          await launchSystemUninstall();
        } catch (error) {
          return {
            ...result,
            complete: false,
            uninstallStarted: false,
            message: error instanceof Error ? error.message : String(error),
            items: [...result.items, {
              path: app.getPath("exe"),
              status: "failed" as const,
              error: error instanceof Error ? error.message : String(error)
            }]
          };
        }

        quitApproved = true;
        setTimeout(() => {
          const server = localServer;
          localServer = null;
          void (server?.close() ?? Promise.resolve()).finally(() => app.quit());
        }, 250);
        return {
          ...result,
          uninstallStarted: true,
          message: "数据已清理，系统卸载已启动。"
        };
      }
    }
  });

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 720,
    minHeight: 680,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    }
  });

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mainWindow.webContents.on("will-navigate", (event, targetUrl) => {
    if (!isAllowedRendererUrl(targetUrl, allowedRendererOrigins)) event.preventDefault();
  });
  mainWindow.once("ready-to-show", () => mainWindow?.show());
  mainWindow.on("close", (event) => {
    if (quitApproved) return;
    event.preventDefault();
    void requestQuit();
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  await mainWindow.loadURL(rendererUrl);
}

async function launchSystemUninstall() {
  if (process.platform === "darwin") {
    const executablePath = app.getPath("exe");
    const appSuffixIndex = executablePath.indexOf(".app/");
    if (appSuffixIndex < 0) throw new Error("没有找到当前应用程序包，无法移入废纸篓。");
    const appBundle = executablePath.slice(0, appSuffixIndex + 4);
    await shell.trashItem(appBundle);
    return;
  }

  if (process.platform === "win32") {
    const installDir = path.dirname(app.getPath("exe"));
    const files = await readdir(installDir);
    const uninstallerName = files.find((file) => /^(?:unins|uninstall).*\.exe$/i.test(file));
    if (!uninstallerName) throw new Error("没有找到 Windows 卸载程序，请从系统设置的“已安装的应用”中卸载。");
    spawn(path.join(installDir, uninstallerName), [], {
      detached: true,
      stdio: "ignore"
    }).unref();
    return;
  }

  throw new Error("当前操作系统暂不支持应用内卸载。");
}

async function requestQuit() {
  if (quitInProgress || quitApproved) return;
  quitInProgress = true;
  try {
    const allowed = await confirmCloseIfPublishing({
      status: publishController?.getState().status ?? "idle",
      showMessageBox: (options) => dialog.showMessageBox(options),
      stop: () => publishController?.stop()
    });
    if (!allowed) return;

    quitApproved = true;
    if (localServer) {
      await localServer.close();
      localServer = null;
    }
    app.quit();
  } finally {
    quitInProgress = false;
  }
}

app.on("before-quit", (event) => {
  if (quitApproved) return;
  event.preventDefault();
  void requestQuit();
});
