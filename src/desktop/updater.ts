import { app, dialog, type BrowserWindow, type MessageBoxOptions } from "electron";
import { autoUpdater } from "electron-updater";

interface UpdateServiceOptions {
  getWindow: () => BrowserWindow | null;
  beforeInstall: () => Promise<void>;
}

export function createUpdateService(options: UpdateServiceOptions) {
  let manualCheck = false;
  let initialized = false;

  function showMessage(options_: MessageBoxOptions) {
    const window = options.getWindow();
    return window
      ? dialog.showMessageBox(window, options_)
      : dialog.showMessageBox(options_);
  }

  function initialize() {
    if (initialized) return;
    initialized = true;
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;

    autoUpdater.on("update-available", (info) => {
      if (!manualCheck) return;
      void showMessage({
        type: "info",
        title: "发现新版本",
        message: `发现新版本 ${info.version}`,
        detail: "正在后台下载，完成后会提示你重启安装。",
        buttons: ["知道了"]
      });
    });

    autoUpdater.on("update-not-available", () => {
      if (!manualCheck) return;
      manualCheck = false;
      void showMessage({
        type: "info",
        title: "已经是最新版",
        message: `当前版本 ${app.getVersion()} 已经是最新版。`,
        buttons: ["知道了"]
      });
    });

    autoUpdater.on("update-downloaded", (info) => {
      manualCheck = false;
      void showMessage({
        type: "info",
        title: "更新已下载",
        message: `新版本 ${info.version} 已准备好`,
        detail: "点击“立即重启”会关闭应用并自动完成安装；也可以稍后退出应用时安装。",
        buttons: ["立即重启", "稍后"],
        defaultId: 0,
        cancelId: 1
      }).then(async ({ response }) => {
        if (response !== 0) return;
        await options.beforeInstall();
        autoUpdater.quitAndInstall(false, true);
      });
    });

    autoUpdater.on("error", (error) => {
      if (!manualCheck) return;
      manualCheck = false;
      void showMessage({
        type: "error",
        title: "检查更新失败",
        message: "暂时无法检查更新。",
        detail: error.message,
        buttons: ["知道了"]
      });
    });
  }

  async function checkForUpdates(showResult = false) {
    initialize();
    if (!app.isPackaged) {
      if (showResult) {
        await showMessage({
          type: "info",
          title: "开发模式",
          message: "开发模式不检查安装包更新。",
          buttons: ["知道了"]
        });
      }
      return;
    }

    manualCheck = showResult;
    try {
      await autoUpdater.checkForUpdates();
    } catch (error) {
      if (!manualCheck) return;
      manualCheck = false;
      await showMessage({
        type: "error",
        title: "检查更新失败",
        message: "暂时无法检查更新。",
        detail: error instanceof Error ? error.message : String(error),
        buttons: ["知道了"]
      });
    }
  }

  return {
    initialize,
    checkForUpdates,

    scheduleInitialCheck(delayMs = 8_000) {
      initialize();
      setTimeout(() => {
        void checkForUpdates(false);
      }, delayMs);
    }
  };
}
