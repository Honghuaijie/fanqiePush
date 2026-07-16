// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";
import { importBook } from "../../src/client/api";
import { ImportPanel } from "../../src/client/components/ImportPanel";
import { App } from "../../src/client/App";
import { SettingsPanel } from "../../src/client/components/SettingsPanel";
import type { DesktopInfo } from "../../src/desktop/contracts";
import type { FanqieDesktopBridge } from "../../src/desktop/contracts";

afterEach(() => {
  cleanup();
  delete window.fanqieDesktop;
  vi.unstubAllGlobals();
});

function createDesktopBridge(overrides: Partial<FanqieDesktopBridge> = {}): FanqieDesktopBridge {
  return {
    getRuntime: vi.fn(async () => ({ apiOrigin: "http://127.0.0.1:43123", apiToken: "desktop-secret" })),
    selectNovelFolder: vi.fn(async () => "/books/测试书"),
    rememberRecentFolder: vi.fn(async () => undefined),
    getDesktopInfo: vi.fn(),
    openPath: vi.fn(),
    openReleasePage: vi.fn(),
    exportDiagnostics: vi.fn(),
    previewCleanup: vi.fn(),
    beginUninstall: vi.fn(),
    ...overrides
  } as FanqieDesktopBridge;
}

function renderImportPanel(overrides: Partial<ComponentProps<typeof ImportPanel>> = {}) {
  const props: ComponentProps<typeof ImportPanel> = {
    folderPath: "",
    chapterFileNamePattern: "",
    importedBook: null,
    recentFolders: [],
    onFolderPathChange: vi.fn(),
    onChapterFileNamePatternChange: vi.fn(),
    onRecentFolderSelect: vi.fn(),
    onImport: vi.fn(),
    error: null,
    ...overrides
  };
  render(<ImportPanel {...props} />);
  return props;
}

describe("desktop novel import", () => {
  it("selects a novel folder through the desktop bridge", async () => {
    window.fanqieDesktop = createDesktopBridge();
    const props = renderImportPanel();

    await userEvent.click(screen.getByRole("button", { name: "选择小说文件夹" }));

    expect(window.fanqieDesktop.selectNovelFolder).toHaveBeenCalledTimes(1);
    expect(props.onFolderPathChange).toHaveBeenCalledWith("/books/测试书");
  });

  it("keeps the path field editable and exposes recent folders", async () => {
    const props = renderImportPanel({ recentFolders: ["/books/旧书", "/books/测试书"] });
    const pathInput = screen.getByRole("textbox", { name: "小说文件夹路径" });

    await userEvent.type(pathInput, "/books/manual");
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "最近使用的小说" }), "/books/测试书");

    expect(props.onFolderPathChange).toHaveBeenCalled();
    expect(props.onRecentFolderSelect).toHaveBeenCalledWith("/books/测试书");
  });

  it("sends desktop API requests to the runtime origin with its token", async () => {
    window.fanqieDesktop = createDesktopBridge();
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      bookName: "测试书",
      folderPath: "/books/测试书",
      totalMarkdownFiles: 1,
      recognizedChapters: 1,
      autoNumberedChapters: 0,
      warnings: [],
      hasPublishLog: false,
      chapters: []
    }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    await importBook("/books/测试书");

    expect(fetchMock).toHaveBeenCalledWith("http://127.0.0.1:43123/api/import", expect.objectContaining({
      headers: {
        "content-type": "application/json",
        "x-fanqie-token": "desktop-secret"
      }
    }));
  });

  it("remembers a folder only after the import succeeds", async () => {
    const bridge = createDesktopBridge({
      getDesktopInfo: vi.fn(async () => ({
        version: "0.1.0",
        releaseUrl: "https://example.com/releases",
        chrome: { installed: true },
        paths: { applicationData: "/app", chromeProfile: "/profile", logs: "/logs" },
        usage: { applicationBytes: 0, profileBytes: 0, logsBytes: 0, generatedBytes: 0 },
        recentFolders: [],
        generatedFiles: []
      }))
    });
    window.fanqieDesktop = bridge;
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      bookName: "测试书",
      folderPath: "/books/测试书",
      totalMarkdownFiles: 1,
      recognizedChapters: 1,
      autoNumberedChapters: 0,
      warnings: [],
      hasPublishLog: false,
      chapters: [{
        chapterNumber: 1,
        displayNumber: "001",
        title: "第001章 开局",
        fileName: "第001章 开局.md",
        filePath: "/books/测试书/第001章 开局.md",
        body: "正文",
        characterCount: 2,
        status: "pending"
      }]
    }), { status: 200, headers: { "content-type": "application/json" } })));
    render(<App />);

    await userEvent.type(screen.getByRole("textbox", { name: "小说文件夹路径" }), "/books/测试书");
    await userEvent.click(screen.getByRole("button", { name: "导入" }));

    await waitFor(() => expect(bridge.rememberRecentFolder).toHaveBeenCalledWith("/books/测试书"));
    expect(await screen.findByText("未创建")).toBeTruthy();
  });
});

describe("desktop settings", () => {
  const info: DesktopInfo = {
    version: "0.2.0",
    releaseUrl: "https://example.com/releases",
    chrome: {
      installed: true,
      executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
    },
    paths: {
      applicationData: "/Users/test/Library/Application Support/fanqie-publish-tool",
      chromeProfile: "/Users/test/Library/Application Support/fanqie-publish-tool/accounts/default/chrome-profile",
      logs: "/Users/test/Library/Application Support/fanqie-publish-tool/logs"
    },
    usage: {
      applicationBytes: 1024,
      profileBytes: 2048,
      logsBytes: 512,
      generatedBytes: 128
    },
    recentFolders: [],
    generatedFiles: ["/books/测试书/.fanqie-publish.json"]
  };

  it("shows version, Chrome status, and every full storage path", () => {
    render(<SettingsPanel
      visible
      info={info}
      onClose={vi.fn()}
      onOpenPath={vi.fn()}
      onOpenReleasePage={vi.fn()}
    />);

    expect(screen.getByText("0.2.0")).toBeTruthy();
    expect(screen.getByText("已找到 Chrome")).toBeTruthy();
    expect(screen.getByText(info.paths.applicationData)).toBeTruthy();
    expect(screen.getByText(info.paths.chromeProfile)).toBeTruthy();
    expect(screen.getByText(info.paths.logs)).toBeTruthy();
    expect(screen.getByText(info.generatedFiles[0])).toBeTruthy();
  });

  it("opens the exact directory belonging to the clicked row", async () => {
    const onOpenPath = vi.fn();
    render(<SettingsPanel
      visible
      info={info}
      onClose={vi.fn()}
      onOpenPath={onOpenPath}
      onOpenReleasePage={vi.fn()}
    />);

    await userEvent.click(screen.getByRole("button", { name: "打开 Chrome 登录资料文件夹" }));

    expect(onOpenPath).toHaveBeenCalledWith(info.paths.chromeProfile);
  });
});
