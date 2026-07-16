import { randomBytes } from "node:crypto";
import path from "node:path";
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  shell
} from "electron";
import { createPublishController, playwrightBrowserLauncher } from "../server/automation/publisher";
import { startLocalServer, type LocalServerHandle } from "../server/start-server";
import { createAppDataStore } from "./app-data";
import { createDesktopPaths } from "./app-paths";
import { detectChrome } from "./chrome";
import { isAllowedRendererUrl, registerDesktopIpc } from "./ipc";

const RELEASE_URL = "https://github.com/Honghuaijie/fanqiePush/releases";
const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;

let mainWindow: BrowserWindow | null = null;
let localServer: LocalServerHandle | null = null;
let shuttingDown = false;

app.setPath("userData", path.join(app.getPath("appData"), "fanqie-publish-tool"));

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
  const chrome = await detectChrome();
  const apiToken = randomBytes(32).toString("hex");
  const publishController = createPublishController(playwrightBrowserLauncher, {
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
    onTaskFinished: () => dataStore.clearTaskMarker()
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
      exportDiagnostics: async () => null,
      previewCleanup: async () => ({ applicationData: [], novelRecords: [] }),
      beginUninstall: async () => {
        throw new Error("卸载清理功能尚未启用。");
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
  mainWindow.on("closed", () => {
    mainWindow = null;
    app.quit();
  });

  await mainWindow.loadURL(rendererUrl);
}

app.on("before-quit", (event) => {
  if (shuttingDown || !localServer) return;
  event.preventDefault();
  shuttingDown = true;
  void localServer.close().finally(() => {
    localServer = null;
    app.quit();
  });
});
