import { contextBridge, ipcRenderer } from "electron";
import type { FanqieDesktopBridge } from "./contracts";
import { DESKTOP_IPC_CHANNELS } from "./ipc";

const bridge: FanqieDesktopBridge = {
  getRuntime: () => ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.getRuntime),
  selectNovelFolder: () => ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.selectNovelFolder),
  rememberRecentFolder: (folderPath) => ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.rememberRecentFolder, folderPath),
  getDesktopInfo: () => ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.getDesktopInfo),
  openPath: (targetPath) => ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.openPath, targetPath),
  openReleasePage: () => ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.openReleasePage),
  exportDiagnostics: () => ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.exportDiagnostics),
  previewCleanup: (includeNovelRecords) => ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.previewCleanup, includeNovelRecords),
  beginUninstall: (includeNovelRecords) => ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.beginUninstall, includeNovelRecords)
};

contextBridge.exposeInMainWorld("fanqieDesktop", bridge);
