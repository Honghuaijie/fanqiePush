import { describe, expect, it, vi } from "vitest";
import {
  DESKTOP_IPC_CHANNELS,
  isAllowedRendererUrl,
  registerDesktopIpc,
  type IpcMainLike
} from "../../src/desktop/ipc";

describe("desktop IPC security", () => {
  it("allows configured local renderer origins and rejects unknown websites", () => {
    const allowed = ["http://127.0.0.1:5173", "http://127.0.0.1:43123"];

    expect(isAllowedRendererUrl("http://127.0.0.1:5173/", allowed)).toBe(true);
    expect(isAllowedRendererUrl("http://127.0.0.1:43123/settings", allowed)).toBe(true);
    expect(isAllowedRendererUrl("https://example.com/", allowed)).toBe(false);
    expect(isAllowedRendererUrl("not a url", allowed)).toBe(false);
  });

  it("guards every exposed desktop channel with the sender URL", async () => {
    const registered = new Map<string, (...args: any[]) => unknown>();
    const ipcMain: IpcMainLike = {
      handle(channel, listener) {
        registered.set(channel, listener);
      }
    };
    const handlers = {
      getRuntime: vi.fn(async () => ({ apiOrigin: "http://127.0.0.1:43123", apiToken: "secret" })),
      selectNovelFolder: vi.fn(async () => "/books/测试书"),
      rememberRecentFolder: vi.fn(async () => undefined),
      getDesktopInfo: vi.fn(async () => ({
        version: "0.2.0",
        releaseUrl: "https://example.com/releases",
        chrome: { installed: true },
        paths: { applicationData: "/app", chromeProfile: "/profile", logs: "/logs" },
        usage: { applicationBytes: 0, profileBytes: 0, logsBytes: 0, generatedBytes: 0 },
        recentFolders: [],
        generatedFiles: []
      })),
      openPath: vi.fn(async () => ({ ok: true })),
      openReleasePage: vi.fn(async () => undefined),
      exportDiagnostics: vi.fn(async () => null),
      previewCleanup: vi.fn(async () => ({ applicationData: [], novelRecords: [] })),
      beginUninstall: vi.fn(async () => ({ items: [] }))
    };

    registerDesktopIpc({
      ipcMain,
      allowedRendererOrigins: ["http://127.0.0.1:5173"],
      handlers
    });

    expect([...registered.keys()].sort()).toEqual([...Object.values(DESKTOP_IPC_CHANNELS)].sort());

    const externalEvent = {
      senderFrame: { url: "https://example.com/" },
      sender: { getURL: () => "https://example.com/" }
    };
    for (const listener of registered.values()) {
      await expect(Promise.resolve().then(() => listener(externalEvent)))
        .rejects.toThrow("不允许的桌面请求来源");
    }
    expect(Object.values(handlers).every((handler) => handler.mock.calls.length === 0)).toBe(true);

    const localEvent = {
      senderFrame: { url: "http://127.0.0.1:5173/" },
      sender: { getURL: () => "http://127.0.0.1:5173/" }
    };
    await expect(registered.get(DESKTOP_IPC_CHANNELS.selectNovelFolder)?.(localEvent))
      .resolves.toBe("/books/测试书");
  });
});
