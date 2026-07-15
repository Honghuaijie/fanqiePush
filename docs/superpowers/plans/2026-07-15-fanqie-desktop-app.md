# Fanqie Desktop Application Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Package the existing Fanqie chapter publishing tool as a double-click Windows and macOS desktop application while preserving the current web development workflow and the proven Playwright publishing behavior.

**Architecture:** Electron owns the desktop lifecycle, native dialogs, application data directory, and uninstall entry points. The packaged application starts the existing Express service on a random loopback port, serves the built React UI from the same origin, and injects a per-launch API token; web development continues to run Vite and Express separately. The publishing controller receives desktop-only dependencies for the shared `default` account profile, generated-file registry, and interrupted-task marker without duplicating business logic.

**Tech Stack:** TypeScript, React 18, Express 4, Playwright, Electron, electron-builder, Vite, Vitest, tsup, GitHub Actions

**Design:** `docs/superpowers/specs/2026-07-15-fanqie-desktop-app-design.zh.md`

---

## File Map

### Server boundaries

- Create `src/server/app.ts`: construct an Express app with optional API authentication, static renderer files, and injected publish-controller dependencies.
- Create `src/server/start-server.ts`: listen on a requested or random loopback port and return a closeable server handle.
- Modify `src/server/index.ts`: keep the existing standalone web-development server by calling the new server factory.
- Modify `src/server/routes.ts`: accept a `PublishController` instead of importing the global singleton directly.
- Modify `src/server/automation/publisher.ts`: export the Playwright launcher separately and accept profile, generated-file, and task-state hooks.

### Desktop runtime and data

- Create `src/desktop/contracts.ts`: shared IPC request and response types.
- Create `src/desktop/app-paths.ts`: derive stable application, account, log, state, and registry paths.
- Create `src/desktop/app-data.ts`: versioned settings, recent folders, generated-file registry, and interrupted-task marker.
- Create `src/desktop/chrome.ts`: detect installed Chrome paths on Windows and macOS.
- Create `src/desktop/log-store.ts`: local rotating lifecycle log and sanitized diagnostic export.
- Create `src/desktop/lifecycle.ts`: pure close-confirmation and interrupted-task decisions.
- Create `src/desktop/cleanup.ts`: preview and execute application/generated-file cleanup.
- Create `src/desktop/ipc.ts`: register restricted desktop IPC handlers and validate renderer senders.
- Create `src/desktop/preload.ts`: expose only approved desktop methods through `contextBridge`.
- Create `src/desktop/main.ts`: single-instance Electron startup, local server startup, secure `BrowserWindow`, and graceful shutdown.

### Client integration

- Create `src/client/desktop.ts`: typed optional bridge used by both desktop and web modes.
- Create `src/client/components/SettingsPanel.tsx`: version, Chrome state, paths, sizes, logs, diagnostics, and update link.
- Create `src/client/components/UninstallDialog.tsx`: cleanup preview, generated-file choice, warning, and results.
- Modify `src/client/api.ts`: resolve desktop API origin/token lazily while keeping relative web API calls.
- Modify `src/client/App.tsx`: load desktop information, recent folders, interrupted-task warning, settings, and uninstall flow.
- Modify `src/client/components/ImportPanel.tsx`: add native folder selection and recent-folder choices while retaining manual input.
- Modify `src/client/styles.css`: style desktop controls, settings, cleanup rows, and responsive states.

### Build, test, and release

- Create `tsup.config.ts`: build Electron main/preload as CommonJS while leaving Electron and Playwright external.
- Create `tsconfig.desktop.json`: type-check desktop and shared server code.
- Create `electron-builder.yml`: NSIS and universal DMG packaging.
- Create `build/installer.nsh`: remove mandatory application data and optionally generated book records during Windows uninstall.
- Create `build/icon.png`, `build/icon.ico`, and `build/icon.icns`: original application icon assets.
- Create `.github/workflows/release.yml`: test and build on Windows/macOS tag pushes, then create a GitHub Release.
- Create `tests/server/app.test.ts`: local server, auth token, and static fallback tests.
- Create `tests/desktop/app-data.test.ts`: settings, registry, recent-folder, and migration tests.
- Create `tests/desktop/chrome.test.ts`: platform-specific Chrome detection tests.
- Create `tests/desktop/lifecycle.test.ts`: active-task close and interrupted-task tests.
- Create `tests/desktop/cleanup.test.ts`: mandatory and optional deletion tests.
- Create `tests/desktop/log-store.test.ts`: rotation and diagnostic redaction tests.
- Create `tests/client/desktop-ui.test.tsx`: folder picker, settings paths, and uninstall warning tests.
- Create `tests/e2e/fanqie-mock-server.ts`: local deterministic Fanqie-like pages.
- Create `tests/e2e/desktop-publish-flow.test.ts`: real Playwright flow against the local mock, never the live account.
- Modify `README.md`: installation, first launch, data paths, unsigned warnings, update, and uninstall instructions.
- Create `docs/desktop-release-checklist.zh.md`: Windows/macOS package and authorized live acceptance checklist.

---

### Task 1: Extract a closeable, authenticated local server

**Files:**
- Create: `src/server/app.ts`
- Create: `src/server/start-server.ts`
- Modify: `src/server/index.ts`
- Modify: `src/server/routes.ts`
- Test: `tests/server/app.test.ts`

- [ ] **Step 1: Write the failing local-server tests**

Create `tests/server/app.test.ts` with three focused cases:

```ts
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { startLocalServer, type LocalServerHandle } from "../../src/server/start-server";

let handle: LocalServerHandle | undefined;
let tempDir: string | undefined;

afterEach(async () => {
  await handle?.close();
  if (tempDir) await rm(tempDir, { recursive: true, force: true });
  handle = undefined;
  tempDir = undefined;
});

describe("local server", () => {
  it("listens on a random loopback port and closes cleanly", async () => {
    handle = await startLocalServer({ port: 0 });
    const response = await fetch(`${handle.origin}/api/health`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(handle.origin).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
  });

  it("requires the desktop token for protected API routes", async () => {
    handle = await startLocalServer({ port: 0, apiToken: "desktop-secret" });
    const missing = await fetch(`${handle.origin}/api/publish/state`);
    const accepted = await fetch(`${handle.origin}/api/publish/state`, {
      headers: { "x-fanqie-token": "desktop-secret" }
    });
    expect(missing.status).toBe(401);
    expect(accepted.status).toBe(200);
  });

  it("serves the React build and falls back to index.html", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "fanqie-renderer-"));
    await mkdir(path.join(tempDir, "assets"));
    await writeFile(path.join(tempDir, "index.html"), "<main>desktop shell</main>", "utf8");
    handle = await startLocalServer({ port: 0, staticDir: tempDir });
    const response = await fetch(`${handle.origin}/settings`);
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("desktop shell");
  });
});
```

- [ ] **Step 2: Run the test and confirm the new module is missing**

Run: `npm test -- tests/server/app.test.ts`

Expected: FAIL because `src/server/start-server.ts` does not exist.

- [ ] **Step 3: Inject the publish controller into routes**

Change the route factory signature in `src/server/routes.ts` and replace every use of the imported singleton:

```ts
import type { PublishController } from "./automation/publisher";

export interface CreateRoutesOptions {
  publishController: PublishController;
}

export function createRoutes({ publishController }: CreateRoutesOptions): Router {
  const router = Router();
  // Existing route bodies remain unchanged.
  return router;
}
```

- [ ] **Step 4: Implement the Express app and closeable listener**

Create `src/server/app.ts`:

```ts
import path from "node:path";
import cors from "cors";
import express from "express";
import { publishController as defaultPublishController, type PublishController } from "./automation/publisher";
import { createRoutes } from "./routes";

export interface CreateServerAppOptions {
  apiToken?: string;
  allowedOrigins?: string[];
  staticDir?: string;
  publishController?: PublishController;
}

export function createServerApp(options: CreateServerAppOptions = {}) {
  const app = express();
  const allowedOrigins = options.allowedOrigins ?? ["http://127.0.0.1:5173"];

  app.use(cors({ origin: allowedOrigins }));
  app.use(express.json({ limit: "10mb" }));
  app.get("/api/health", (_req, res) => res.json({ ok: true }));
  app.use("/api", (req, res, next) => {
    if (options.apiToken && req.header("x-fanqie-token") !== options.apiToken) {
      res.status(401).json({ error: "桌面应用访问令牌无效。" });
      return;
    }
    next();
  });
  app.use("/api", createRoutes({
    publishController: options.publishController ?? defaultPublishController
  }));

  if (options.staticDir) {
    app.use(express.static(options.staticDir));
    app.get("*", (_req, res) => res.sendFile(path.join(options.staticDir!, "index.html")));
  }
  return app;
}
```

Create `src/server/start-server.ts`:

```ts
import type { Server } from "node:http";
import { createServerApp, type CreateServerAppOptions } from "./app";

export interface StartLocalServerOptions extends CreateServerAppOptions {
  port?: number;
}

export interface LocalServerHandle {
  origin: string;
  server: Server;
  close(): Promise<void>;
}

export async function startLocalServer(options: StartLocalServerOptions = {}): Promise<LocalServerHandle> {
  const app = createServerApp(options);
  const server = await new Promise<Server>((resolve, reject) => {
    const listener = app.listen(options.port ?? 0, "127.0.0.1", () => resolve(listener));
    listener.once("error", reject);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("本地服务没有获得有效端口。");
  return {
    origin: `http://127.0.0.1:${address.port}`,
    server,
    close: () => new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    })
  };
}
```

Replace `src/server/index.ts` with a call to `startLocalServer({ port: Number(process.env.PORT ?? 3456) })` and log the returned origin.

- [ ] **Step 5: Verify server and existing tests**

Run: `npm test -- tests/server/app.test.ts tests/server/routes.test.ts`

Expected: PASS.

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 6: Commit the server boundary**

```bash
git add src/server/app.ts src/server/start-server.ts src/server/index.ts src/server/routes.ts tests/server/app.test.ts
git commit -m "refactor: expose desktop-ready local server"
```

---

### Task 2: Add versioned application data and desktop publish dependencies

**Files:**
- Create: `src/desktop/app-paths.ts`
- Create: `src/desktop/app-data.ts`
- Modify: `src/server/automation/publisher.ts`
- Test: `tests/desktop/app-data.test.ts`
- Test: `tests/server/publisher.test.ts`
- Modify: `.gitignore`

- [ ] **Step 1: Write failing path and persistence tests**

Create `tests/desktop/app-data.test.ts`:

```ts
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createAppDataStore } from "../../src/desktop/app-data";
import { createDesktopPaths } from "../../src/desktop/app-paths";

let root: string | undefined;
afterEach(async () => root && rm(root, { recursive: true, force: true }));

describe("desktop app data", () => {
  it("uses one default account profile outside novel folders", async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "fanqie-data-"));
    const paths = createDesktopPaths(root);
    expect(paths.defaultAccountProfile).toBe(path.join(root, "accounts", "default", "chrome-profile"));
  });

  it("deduplicates and limits recent folders", async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "fanqie-data-"));
    const store = createAppDataStore(createDesktopPaths(root));
    for (let index = 0; index < 12; index += 1) await store.rememberFolder(`/books/${index}`);
    await store.rememberFolder("/books/5");
    const settings = await store.readSettings();
    expect(settings.schemaVersion).toBe(1);
    expect(settings.recentFolders).toHaveLength(10);
    expect(settings.recentFolders[0]).toBe("/books/5");
  });

  it("records generated files for uninstall", async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "fanqie-data-"));
    const paths = createDesktopPaths(root);
    const store = createAppDataStore(paths);
    await store.registerGeneratedFile("/books/demo/.fanqie-publish.json");
    await store.registerGeneratedFile("/books/demo/.fanqie-publish.json");
    expect(await store.readGeneratedFiles()).toEqual(["/books/demo/.fanqie-publish.json"]);
    expect(await readFile(paths.generatedFilesText, "utf8")).toBe("/books/demo/.fanqie-publish.json\n");
  });
});
```

- [ ] **Step 2: Run the test and verify missing modules**

Run: `npm test -- tests/desktop/app-data.test.ts`

Expected: FAIL because the desktop data modules do not exist.

- [ ] **Step 3: Implement stable paths and atomic settings**

Create `src/desktop/app-paths.ts` with this public shape:

```ts
import path from "node:path";

export interface DesktopPaths {
  root: string;
  settingsFile: string;
  generatedFilesText: string;
  logsDir: string;
  diagnosticsDir: string;
  defaultAccountProfile: string;
  interruptedTaskFile: string;
}

export function createDesktopPaths(root: string): DesktopPaths {
  return {
    root,
    settingsFile: path.join(root, "data", "settings.json"),
    generatedFilesText: path.join(root, "data", "generated-files.txt"),
    logsDir: path.join(root, "logs"),
    diagnosticsDir: path.join(root, "diagnostics"),
    defaultAccountProfile: path.join(root, "accounts", "default", "chrome-profile"),
    interruptedTaskFile: path.join(root, "data", "interrupted-task.json")
  };
}
```

Create `src/desktop/app-data.ts` with `DesktopSettingsV1`, `readSettings`, `rememberFolder`, `registerGeneratedFile`, `readGeneratedFiles`, `markTaskActive`, and `clearTaskMarker`. Write JSON through a sibling `.tmp` file and `rename` so an interrupted write cannot corrupt settings. Normalize paths with `path.resolve`, keep at most ten recent folders, and rewrite `generated-files.txt` after every registry update.

- [ ] **Step 4: Make publish profile and file tracking injectable**

Add options to `createPublishController` in `src/server/automation/publisher.ts`:

```ts
export interface PublishControllerOptions {
  resolveProfileDir?: (input: StartPublishInput) => string;
  onGeneratedFile?: (filePath: string) => Promise<void> | void;
  onTaskStarted?: (input: StartPublishInput) => Promise<void> | void;
  onTaskFinished?: () => Promise<void> | void;
}

export function createPublishController(
  launcher: BrowserLauncher,
  options: PublishControllerOptions = {}
): PublishController {
  // existing state
}
```

Resolve the profile with:

```ts
const profileDir = options.resolveProfileDir?.(input)
  ?? path.join(input.folderPath, ".fanqie-browser-profile");
```

Call `onTaskStarted` before opening the browser, call `onGeneratedFile(path.join(folderPath, PUBLISH_LOG_FILE))` after every successful `writePublishLog`, and call `onTaskFinished` after a clean stop or full successful batch. Export the anonymous real launcher as `playwrightBrowserLauncher`, then retain the web singleton:

```ts
export const playwrightBrowserLauncher: BrowserLauncher = { /* existing launcher body */ };
export const publishController = createPublishController(playwrightBrowserLauncher);
```

Add a publisher test asserting that a supplied resolver receives the start input and that generated-file/task hooks fire exactly once.

- [ ] **Step 5: Ignore future per-book browser profiles**

Append to `.gitignore`:

```gitignore
.fanqie-browser-profile/
release/
dist-electron/
```

Do not delete user browser profiles during this task. The desktop version intentionally asks for one fresh login and starts using the global `default` profile.

- [ ] **Step 6: Verify and commit**

Run: `npm test -- tests/desktop/app-data.test.ts tests/server/publisher.test.ts`

Expected: PASS.

Run: `npm run typecheck`

Expected: PASS.

```bash
git add .gitignore src/desktop/app-paths.ts src/desktop/app-data.ts src/server/automation/publisher.ts tests/desktop/app-data.test.ts tests/server/publisher.test.ts
git commit -m "feat: add desktop data and account profile boundaries"
```

---

### Task 3: Detect Chrome on Windows and macOS

**Files:**
- Create: `src/desktop/chrome.ts`
- Modify: `src/desktop/app-data.ts`
- Modify: `src/server/automation/publisher.ts`
- Test: `tests/desktop/chrome.test.ts`

- [ ] **Step 1: Write the failing Chrome candidate tests**

Create `tests/desktop/chrome.test.ts` using an injected `exists` function. Cover macOS system Chrome, macOS user Chrome, Windows Program Files, Windows Local AppData, and no-match behavior:

```ts
import { describe, expect, it } from "vitest";
import { detectChromeExecutable } from "../../src/desktop/chrome";

describe("Chrome detection", () => {
  it("returns the first existing macOS candidate", async () => {
    const expected = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
    const result = await detectChromeExecutable({
      platform: "darwin",
      env: { HOME: "/Users/test" },
      exists: async (candidate) => candidate === expected
    });
    expect(result).toEqual({ installed: true, executablePath: expected });
  });

  it("returns a readable missing result", async () => {
    const result = await detectChromeExecutable({
      platform: "win32",
      env: { LOCALAPPDATA: "C:\\Users\\test\\AppData\\Local" },
      exists: async () => false
    });
    expect(result).toEqual({ installed: false });
  });
});
```

- [ ] **Step 2: Run the failing test**

Run: `npm test -- tests/desktop/chrome.test.ts`

Expected: FAIL because `src/desktop/chrome.ts` is missing.

- [ ] **Step 3: Implement deterministic platform candidates**

Create `src/desktop/chrome.ts` with:

```ts
export interface ChromeDetectionResult {
  installed: boolean;
  executablePath?: string;
}

export interface ChromeDetectionOptions {
  platform: NodeJS.Platform;
  env: NodeJS.ProcessEnv;
  exists: (candidate: string) => Promise<boolean>;
}
```

Use these candidate roots in order:

- macOS: `/Applications/Google Chrome.app/...`, then `$HOME/Applications/Google Chrome.app/...`.
- Windows: `%PROGRAMFILES%`, `%PROGRAMFILES(X86)%`, then `%LOCALAPPDATA%`, each ending with `Google\\Chrome\\Application\\chrome.exe`.

Return `{ installed: false }` on unsupported platforms or no match.

- [ ] **Step 4: Allow the Playwright launcher to use the detected executable**

Extend `BrowserLauncher.openBrowser` to accept an optional executable path:

```ts
openBrowser(profileDir: string, executablePath?: string): Promise<BrowserSession>;
```

Add `chromeExecutablePath?: string` to `PublishControllerOptions`, pass it to `openBrowser`, and configure Playwright with either `executablePath` or `channel: "chrome"`, never both.

- [ ] **Step 5: Verify and commit**

Run: `npm test -- tests/desktop/chrome.test.ts tests/server/publisher.test.ts`

Expected: PASS.

```bash
git add src/desktop/chrome.ts src/server/automation/publisher.ts tests/desktop/chrome.test.ts tests/server/publisher.test.ts
git commit -m "feat: detect system Chrome for desktop publishing"
```

---

### Task 4: Add the secure Electron runtime and native folder picker

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `tsconfig.desktop.json`
- Create: `tsup.config.ts`
- Create: `src/desktop/contracts.ts`
- Create: `src/desktop/ipc.ts`
- Create: `src/desktop/preload.ts`
- Create: `src/desktop/main.ts`
- Create: `src/client/desktop.ts`
- Test: `tests/desktop/ipc.test.ts`

- [ ] **Step 1: Record the pre-Electron baseline**

Run:

```bash
npm test
npm run typecheck
npm run build
```

Expected: all commands PASS before dependency changes.

- [ ] **Step 2: Install the desktop toolchain**

Run:

```bash
npm install --save-dev electron electron-builder tsup concurrently wait-on cross-env @testing-library/react @testing-library/user-event jsdom
```

Set `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` in CI and packaging environments; the application uses installed Chrome.

- [ ] **Step 3: Write a failing IPC sender-validation test**

Create `tests/desktop/ipc.test.ts` around an exported pure helper:

```ts
import { describe, expect, it } from "vitest";
import { isAllowedRendererUrl } from "../../src/desktop/ipc";

describe("desktop IPC security", () => {
  it("accepts only the local application origins", () => {
    expect(isAllowedRendererUrl("http://127.0.0.1:5173/", ["http://127.0.0.1:5173"])).toBe(true);
    expect(isAllowedRendererUrl("http://127.0.0.1:48931/settings", ["http://127.0.0.1:48931"])).toBe(true);
    expect(isAllowedRendererUrl("https://example.com/", ["http://127.0.0.1:5173"])).toBe(false);
  });
});
```

Run: `npm test -- tests/desktop/ipc.test.ts`

Expected: FAIL because `src/desktop/ipc.ts` is missing.

- [ ] **Step 4: Define the restricted desktop bridge**

In `src/desktop/contracts.ts`, define serializable `DesktopRuntime`, `DesktopInfo`, `CleanupPreview`, `CleanupResult`, and this bridge:

```ts
export interface FanqieDesktopBridge {
  getRuntime(): Promise<{ apiOrigin: string; apiToken: string }>;
  selectNovelFolder(): Promise<string | null>;
  rememberRecentFolder(folderPath: string): Promise<void>;
  getDesktopInfo(): Promise<DesktopInfo>;
  openPath(targetPath: string): Promise<{ ok: boolean; error?: string }>;
  openReleasePage(): Promise<void>;
  exportDiagnostics(): Promise<string | null>;
  previewCleanup(includeNovelRecords: boolean): Promise<CleanupPreview>;
  beginUninstall(includeNovelRecords: boolean): Promise<CleanupResult>;
}
```

Expose it in `src/desktop/preload.ts` through `contextBridge`. In `src/client/desktop.ts`, return `window.fanqieDesktop` when available and safe web fallbacks otherwise. Add the global `Window` declaration in the same client module.

- [ ] **Step 5: Register validated IPC handlers**

Implement `registerDesktopIpc` in `src/desktop/ipc.ts`. Every handler must call `isAllowedRendererUrl(event.senderFrame.url, allowedOrigins)` before reading paths, opening folders, or starting cleanup. Use `dialog.showOpenDialog({ properties: ["openDirectory"] })` for novel selection. Only call `shell.openExternal` with the hard-coded repository release URL:

```text
https://github.com/Honghuaijie/fanqiePush/releases
```

- [ ] **Step 6: Implement Electron startup**

In `src/desktop/main.ts`:

1. Set a stable user data path under `path.join(app.getPath("appData"), "fanqie-publish-tool")` before `app.whenReady()`.
2. Obtain `app.requestSingleInstanceLock()` and quit the second instance.
3. Build `DesktopPaths`, create the data store, detect Chrome, and create a desktop `PublishController` using the global default account profile.
4. Generate `randomBytes(32).toString("hex")` as the API token.
5. Start the local server with `port: 0`, injected controller, token, and packaged `dist` directory.
6. Create `BrowserWindow` with `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`, and the compiled preload path.
7. Load `VITE_DEV_SERVER_URL` during desktop development, otherwise load the local server origin.
8. Deny unexpected navigation and new windows.
9. Focus and restore the main window on `second-instance`.

- [ ] **Step 7: Add build and development scripts**

Create `tsup.config.ts` with `main` and `preload` entries, CommonJS `.cjs` output, and `electron`, `playwright`, and `playwright-core` as externals. Add `tsconfig.desktop.json` extending the Node config and including `src/desktop`.

Add scripts to `package.json`:

```json
{
  "main": "dist-electron/main.cjs",
  "scripts": {
    "build:web": "vite build",
    "build:desktop": "tsup",
    "build": "npm run build:web && npm run build:desktop",
    "dev:desktop": "npm run build:desktop && concurrently -k \"vite --host 127.0.0.1\" \"cross-env VITE_DEV_SERVER_URL=http://127.0.0.1:5173 wait-on tcp:5173 && electron .\"",
    "typecheck": "tsc -p tsconfig.node.json --noEmit && tsc -p tsconfig.desktop.json --noEmit && tsc --noEmit"
  }
}
```

- [ ] **Step 8: Verify the desktop shell manually**

Run: `npm run dev:desktop`

Expected:

- One desktop window opens without a separate backend terminal command.
- A second launch focuses the existing window.
- Native folder selection returns a folder path.
- DevTools contains no Electron security warning about Node integration or context isolation.
- Closing an idle window exits the local server.

- [ ] **Step 9: Run tests and commit**

Run: `npm test -- tests/desktop/ipc.test.ts tests/server/app.test.ts`

Run: `npm run typecheck`

Run: `npm run build`

Expected: all PASS.

```bash
git add package.json package-lock.json tsconfig.desktop.json tsup.config.ts src/desktop/contracts.ts src/desktop/ipc.ts src/desktop/preload.ts src/desktop/main.ts src/client/desktop.ts tests/desktop/ipc.test.ts
git commit -m "feat: add secure Electron desktop shell"
```

---

### Task 5: Connect the desktop API, native folder selection, and recent books

**Files:**
- Modify: `src/client/api.ts`
- Modify: `src/client/App.tsx`
- Modify: `src/client/components/ImportPanel.tsx`
- Modify: `src/client/styles.css`
- Test: `tests/client/desktop-ui.test.tsx`

- [ ] **Step 1: Write the failing desktop UI test**

Create `tests/client/desktop-ui.test.tsx` with `// @vitest-environment jsdom`. Mock `window.fanqieDesktop.selectNovelFolder` to return `/books/测试书`, render `ImportPanel`, click “选择小说文件夹”, and assert the path callback receives that value. Add a second assertion that manual text entry still works.

Core assertion:

```tsx
await user.click(screen.getByRole("button", { name: "选择小说文件夹" }));
expect(onFolderPathChange).toHaveBeenCalledWith("/books/测试书");
```

- [ ] **Step 2: Run the UI test and verify failure**

Run: `npm test -- tests/client/desktop-ui.test.tsx`

Expected: FAIL because the button and bridge call are not present.

- [ ] **Step 3: Make API calls desktop-aware**

In `src/client/api.ts`, cache the optional runtime and build every request from it:

```ts
let runtimePromise: Promise<{ apiOrigin: string; apiToken: string } | null> | undefined;

async function getRuntime() {
  runtimePromise ??= window.fanqieDesktop?.getRuntime().then((value) => value) ?? Promise.resolve(null);
  return runtimePromise;
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const runtime = await getRuntime();
  const response = await fetch(`${runtime?.apiOrigin ?? ""}${url}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(runtime ? { "x-fanqie-token": runtime.apiToken } : {})
    },
    body: JSON.stringify(body)
  });
  // Keep existing error mapping.
}
```

Use the same helper for GET requests introduced by settings or state polling.

- [ ] **Step 4: Add native selection and recent folders**

Extend `ImportPanelProps` with `recentFolders`, `onChooseFolder`, and `onRecentFolderSelect`. Place the familiar folder icon/text button beside the path input, retain manual editing, and render at most ten recent paths in a compact menu/select control.

In `App.tsx`, load `getDesktopInfo()` on mount, wire `selectNovelFolder`, and call `rememberRecentFolder(imported.folderPath)` only after a successful import. Web mode returns no recent folders and keeps manual input fully functional.

- [ ] **Step 5: Verify responsive layout and tests**

Run: `npm test -- tests/client/desktop-ui.test.tsx`

Run: `npm run typecheck`

Run: `npm run build`

Expected: all PASS. Manually resize the desktop window to 760px wide and confirm the path input and both buttons do not overlap.

- [ ] **Step 6: Commit**

```bash
git add src/client/api.ts src/client/App.tsx src/client/components/ImportPanel.tsx src/client/styles.css tests/client/desktop-ui.test.tsx
git commit -m "feat: add native novel folder selection"
```

---

### Task 6: Add settings, visible storage paths, version, and Chrome state

**Files:**
- Create: `src/client/components/SettingsPanel.tsx`
- Modify: `src/client/App.tsx`
- Modify: `src/client/styles.css`
- Modify: `src/desktop/ipc.ts`
- Modify: `src/desktop/main.ts`
- Test: `tests/client/desktop-ui.test.tsx`
- Test: `tests/desktop/app-data.test.ts`

- [ ] **Step 1: Add failing settings assertions**

Extend `tests/client/desktop-ui.test.tsx` to render `SettingsPanel` with fixed `DesktopInfo`. Assert it displays the full application-data, Chrome-profile, and log paths; shows version `0.2.0`; reports “已找到 Chrome”; and invokes `openPath` for the exact path row.

- [ ] **Step 2: Add failing directory-size assertions**

Extend `tests/desktop/app-data.test.ts` with files of known byte lengths and assert `calculateStorageUsage(paths)` returns separate `applicationBytes`, `profileBytes`, `logsBytes`, and `generatedBytes` values without reading Markdown contents.

- [ ] **Step 3: Implement desktop information**

Add to `DesktopInfo`:

```ts
export interface DesktopInfo {
  version: string;
  releaseUrl: string;
  chrome: ChromeDetectionResult;
  paths: {
    applicationData: string;
    chromeProfile: string;
    logs: string;
  };
  usage: {
    applicationBytes: number;
    profileBytes: number;
    logsBytes: number;
    generatedBytes: number;
  };
  recentFolders: string[];
  generatedFiles: string[];
  interruptedTask?: InterruptedTask;
}
```

Implement recursive byte calculation with `lstat`; skip symbolic links and unreadable entries, returning an error list separately rather than failing the entire settings page.

- [ ] **Step 4: Build the settings panel**

Create an un-nested, scrollable settings modal with sections for Environment, Data and Storage, Diagnostics, Update, and Uninstall. Every path is selectable text and has an “打开文件夹” icon button with a tooltip. Use compact headings suitable for a utility, not hero-sized text.

Add a Settings icon button to the app header. The release button opens only the fixed GitHub releases URL.

- [ ] **Step 5: Verify and commit**

Run: `npm test -- tests/client/desktop-ui.test.tsx tests/desktop/app-data.test.ts`

Run: `npm run typecheck`

Run: `npm run build`

Expected: all PASS.

```bash
git add src/client/components/SettingsPanel.tsx src/client/App.tsx src/client/styles.css src/desktop/contracts.ts src/desktop/ipc.ts src/desktop/main.ts src/desktop/app-data.ts tests/client/desktop-ui.test.tsx tests/desktop/app-data.test.ts
git commit -m "feat: show desktop storage and environment settings"
```

---

### Task 7: Add local logs, sanitized diagnostics, and interrupted-task recovery

**Files:**
- Create: `src/desktop/log-store.ts`
- Create: `src/desktop/lifecycle.ts`
- Modify: `src/desktop/app-data.ts`
- Modify: `src/desktop/main.ts`
- Modify: `src/desktop/ipc.ts`
- Modify: `src/client/App.tsx`
- Modify: `src/client/components/SettingsPanel.tsx`
- Test: `tests/desktop/log-store.test.ts`
- Test: `tests/desktop/lifecycle.test.ts`

- [ ] **Step 1: Write failing log and redaction tests**

Create `tests/desktop/log-store.test.ts`. Verify daily log append, rotation after an injected byte limit, deletion of files older than 14 days, and diagnostic JSON redaction. The test input must include `body`, `cookie`, `password`, and `authorization`; the exported file must contain `"[REDACTED]"` and none of the secret values.

- [ ] **Step 2: Write failing lifecycle tests**

Create `tests/desktop/lifecycle.test.ts` around pure helpers:

```ts
expect(isActivePublishStatus("running")).toBe(true);
expect(isActivePublishStatus("waiting-login")).toBe(true);
expect(isActivePublishStatus("stopped")).toBe(false);
expect(describeInterruptedTask({ bookName: "测试书", currentChapter: 27 })).toContain("第 27 章");
```

- [ ] **Step 3: Implement the local log store**

Create `createLogStore({ logsDir, maxBytes: 5_000_000, retentionDays: 14 })` with `info`, `warn`, `error`, `rotate`, and `exportDiagnostics`. Export a single `fanqie-diagnostics-YYYYMMDD-HHmmss.json` file containing app version, platform, sanitized settings, Chrome installed state, and recent log lines. Never traverse the account profile or novel Markdown files.

- [ ] **Step 4: Persist active and clean task transitions**

Use the Task 2 controller hooks to write `interrupted-task.json` before browser launch and delete it after full success or explicit stop. The marker contains only book name, folder path, current chapter, start time, and last known status; it contains no chapter body.

At startup, `getDesktopInfo` returns the marker. `App.tsx` renders a warning band stating that the previous task ended unexpectedly and asks the user to inspect Fanqie before regenerating or publishing. Do not automatically resume or re-submit.

- [ ] **Step 5: Guard application close**

In `src/desktop/lifecycle.ts`, implement a dependency-injected `requestClose` that checks `publishController.getState()`. For active states, show “发布任务正在运行，退出将停止当前任务” with Cancel as the default. On confirmed exit, await `publishController.stop()`, close the local server, then allow `app.quit()`.

- [ ] **Step 6: Verify and commit**

Run: `npm test -- tests/desktop/log-store.test.ts tests/desktop/lifecycle.test.ts tests/server/publisher.test.ts`

Run: `npm run typecheck`

Expected: PASS.

```bash
git add src/desktop/log-store.ts src/desktop/lifecycle.ts src/desktop/app-data.ts src/desktop/main.ts src/desktop/ipc.ts src/client/App.tsx src/client/components/SettingsPanel.tsx tests/desktop/log-store.test.ts tests/desktop/lifecycle.test.ts
git commit -m "feat: add desktop diagnostics and interrupted task recovery"
```

---

### Task 8: Implement cleanup preview and uninstall behavior

**Files:**
- Create: `src/desktop/cleanup.ts`
- Create: `src/client/components/UninstallDialog.tsx`
- Modify: `src/desktop/ipc.ts`
- Modify: `src/desktop/main.ts`
- Modify: `src/client/components/SettingsPanel.tsx`
- Modify: `src/client/styles.css`
- Test: `tests/desktop/cleanup.test.ts`
- Test: `tests/client/desktop-ui.test.tsx`

- [ ] **Step 1: Write failing cleanup tests**

Create temporary application data and two generated publish records. Assert:

```ts
const keepBooks = await cleanup.execute({ includeNovelRecords: false });
expect(keepBooks.items.find((item) => item.kind === "application-data")?.status).toBe("deleted");
expect(await fileExists(novelRecord)).toBe(true);

const deleteBooks = await cleanup.execute({ includeNovelRecords: true });
expect(deleteBooks.items.find((item) => item.path === novelRecord)?.status).toBe("deleted");
```

Add cases for `missing`, `kept`, and injected permission failure. A result containing a failure must have `complete: false`.

- [ ] **Step 2: Write the uninstall warning UI test**

Render `UninstallDialog`, verify “同时删除小说文件夹中的发布记录” is checked by default, and verify the warning includes “以后可能无法识别已经提交过的章节”. Unchecking it must call preview with `false`.

- [ ] **Step 3: Implement cleanup preview and execution**

Create `createCleanupService({ paths, store, remove, exists })` with:

```ts
type CleanupStatus = "pending" | "deleted" | "kept" | "missing" | "failed";
type CleanupKind = "application-data" | "generated-file";

interface CleanupItem {
  kind: CleanupKind;
  path: string;
  status: CleanupStatus;
  error?: string;
}
```

Preview lists full absolute paths. Execution deletes selected generated files first and application data last. It must never delete a directory outside the exact configured application root; generated entries are files only, and each path must be present in the registry.

- [ ] **Step 4: Implement the two-step client flow**

The settings button opens `UninstallDialog`. The first confirmation performs cleanup preview and selected generated-file cleanup. If any item fails, show exact paths and keep the app installed. If cleanup succeeds, a second “卸载应用” action invokes the platform uninstaller.

- [ ] **Step 5: Add platform uninstall adapters**

- Windows packaged mode: locate the NSIS uninstaller beside the installed executable, spawn it detached, and quit only after spawn succeeds.
- macOS packaged mode: stop the publisher and logger, remove the app data root, move the `.app` bundle derived from `process.execPath` to Trash with `shell.trashItem`, then quit.
- Development mode: never delete source files; return a message that uninstall is available only in an installed build.

- [ ] **Step 6: Verify and commit**

Run: `npm test -- tests/desktop/cleanup.test.ts tests/client/desktop-ui.test.tsx`

Run: `npm run typecheck`

Expected: PASS.

```bash
git add src/desktop/cleanup.ts src/client/components/UninstallDialog.tsx src/desktop/ipc.ts src/desktop/main.ts src/client/components/SettingsPanel.tsx src/client/styles.css tests/desktop/cleanup.test.ts tests/client/desktop-ui.test.tsx
git commit -m "feat: add explicit data cleanup and uninstall flow"
```

---

### Task 9: Package unsigned Windows and macOS installers

**Files:**
- Modify: `package.json`
- Create: `electron-builder.yml`
- Create: `build/installer.nsh`
- Create: `build/icon.png`
- Create: `build/icon.ico`
- Create: `build/icon.icns`
- Modify: `README.md`

- [ ] **Step 1: Create and inspect original icon assets**

Create an original 1024×1024 bitmap source that represents chapter scheduling without copying the Fanqie logo. Generate matching ICO and ICNS assets, then inspect the icon at 16, 32, 128, 256, and 1024 pixels. It must remain recognizable and contain no tiny text.

- [ ] **Step 2: Add electron-builder configuration**

Create `electron-builder.yml`:

```yaml
appId: com.honghuaijie.fanqiepush
productName: 番茄章节发布工具
directories:
  output: release
  buildResources: build
files:
  - dist/**
  - dist-electron/**
  - package.json
  - node_modules/**
asarUnpack:
  - node_modules/playwright-core/**
win:
  icon: build/icon.ico
  target:
    - target: nsis
      arch: [x64]
  artifactName: FanqiePublish-${version}-Windows-${arch}.${ext}
nsis:
  oneClick: false
  allowToChangeInstallationDirectory: true
  createDesktopShortcut: true
  include: build/installer.nsh
mac:
  icon: build/icon.icns
  identity: null
  category: public.app-category.productivity
  target:
    - target: dmg
      arch: [universal]
  artifactName: FanqiePublish-${version}-macOS-${arch}.${ext}
```

- [ ] **Step 3: Add Windows uninstall cleanup**

Create `build/installer.nsh`. In `customUnInstall`, default the question to Yes, optionally read each newline from `$APPDATA\\fanqie-publish-tool\\data\\generated-files.txt` and delete those exact files, then always remove `$APPDATA\\fanqie-publish-tool`. Do not recursively delete the parent book directories.

The script must show this warning before optional deletion:

```text
是否同时删除小说文件夹中的发布记录？删除后，以后可能无法识别已经提交过的章节。
```

Use this exact NSIS structure and verify it with a path containing Chinese characters:

```nsh
!include "TextFunc.nsh"

!macro customUnInstall
  MessageBox MB_YESNO|MB_ICONEXCLAMATION|MB_DEFBUTTON1 \
    "是否同时删除小说文件夹中的发布记录？删除后，以后可能无法识别已经提交过的章节。" \
    IDNO skipNovelRecords

  IfFileExists "$APPDATA\fanqie-publish-tool\data\generated-files.txt" 0 skipNovelRecords
  FileOpen $0 "$APPDATA\fanqie-publish-tool\data\generated-files.txt" r

  readGeneratedFile:
    ClearErrors
    FileRead $0 $1
    IfErrors closeGeneratedFile
    ${TrimNewLines} $1 $1
    StrCmp $1 "" readGeneratedFile
    Delete "$1"
    Goto readGeneratedFile

  closeGeneratedFile:
    FileClose $0

  skipNovelRecords:
    RMDir /r "$APPDATA\fanqie-publish-tool"
!macroend
```

- [ ] **Step 4: Add packaging scripts and stable metadata**

Add repository metadata and scripts:

```json
{
  "version": "0.2.0",
  "repository": "https://github.com/Honghuaijie/fanqiePush.git",
  "scripts": {
    "dist:win": "npm run build && electron-builder --win --publish never",
    "dist:mac": "npm run build && electron-builder --mac --publish never"
  }
}
```

- [ ] **Step 5: Build the local-platform installer**

On macOS run: `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm run dist:mac`

On Windows run: `set PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 && npm run dist:win`

Expected: unsigned installer appears under `release/`, installs, launches, detects Chrome, and opens the desktop UI without Node.js installed globally.

- [ ] **Step 6: Document unsigned first launch**

Update `README.md` with exact Windows “More info → Run anyway” and macOS “Privacy & Security → Open Anyway” instructions, desktop data paths, first login, manual update, and uninstall choices. Do not describe unsigned packages as suitable for public sale.

- [ ] **Step 7: Commit packaging**

```bash
git add package.json package-lock.json electron-builder.yml build/installer.nsh build/icon.png build/icon.ico build/icon.icns README.md
git commit -m "build: package Windows and macOS desktop apps"
```

---

### Task 10: Test the full selector flow against a local mock site

**Files:**
- Modify: `src/server/automation/publisher.ts`
- Create: `tests/e2e/fanqie-mock-server.ts`
- Create: `tests/e2e/desktop-publish-flow.test.ts`

- [ ] **Step 1: Export a configurable Playwright launcher factory**

Refactor the existing real launcher without changing its selector logic:

```ts
export interface PlaywrightLauncherOptions {
  channel?: "chrome";
  executablePath?: string;
  headless?: boolean;
  viewport?: { width: number; height: number };
}

export function createPlaywrightBrowserLauncher(options: PlaywrightLauncherOptions = {}): BrowserLauncher {
  return {
    async openBrowser(profileDir, executablePath) {
      const context = await chromium.launchPersistentContext(profileDir, {
        ...(executablePath || options.executablePath
          ? { executablePath: executablePath ?? options.executablePath }
          : { channel: options.channel ?? "chrome" }),
        headless: options.headless ?? false,
        viewport: options.viewport ?? { width: 1400, height: 900 }
      });
      // Return the existing BrowserSession implementation unchanged.
    }
  };
}
```

Allow `createPublishController` to receive `writerBookManageUrl`, defaulting to the real Fanqie URL. Tests pass the local mock URL.

- [ ] **Step 2: Create the local deterministic Fanqie-like server**

`tests/e2e/fanqie-mock-server.ts` must serve three states with the exact visible labels and CSS hooks the current selectors use:

1. Book list containing `测试书` and “章节管理”.
2. Chapter manager containing “新建章节”, opening the editor in a new tab.
3. Editor containing serial input, title input, ProseMirror body, “下一步”, typo submission branch, content detection with “全面检测”, and publish settings with AI “否”, schedule toggle, date/time inputs, and “确认发布”.

The confirmation handler stores this payload in memory for assertions:

```ts
interface MockSubmission {
  chapterNumber: string;
  title: string;
  body: string;
  plannedDate: string;
  plannedTime: string;
  aiUsed: false;
}
```

- [ ] **Step 3: Write the failing end-to-end test**

Create a temporary novel folder with one chapter over 1000 Chinese characters. Start the mock server, create a headless launcher, start the controller with the mock writer URL, and call `scheduleCurrentChapter()`.

Assert:

```ts
expect(mockServer.submissions).toEqual([{
  chapterNumber: "1",
  title: "第001章 开局",
  body: expect.stringContaining("测试正文"),
  plannedDate: "2026-08-01",
  plannedTime: "09:30",
  aiUsed: false
}]);
expect(JSON.parse(await readFile(logPath, "utf8")).chapters[0].status).toBe("scheduled");
```

- [ ] **Step 4: Run and repair selector mismatches without weakening assertions**

Run: `npm test -- tests/e2e/desktop-publish-flow.test.ts`

Expected before fixture completion: FAIL at the first missing visible control.

Adjust the mock page to accurately model the current verified Fanqie flow. Do not add production selectors that only exist in the mock.

- [ ] **Step 5: Verify both typo and no-typo branches**

Parameterize the test so one run shows “检测到你还有错别字未修改” and requires “提交”, while the other proceeds directly to content detection. Both must select “全面检测” and reach the same publish settings assertion.

- [ ] **Step 6: Commit mock end-to-end coverage**

Run: `npm test -- tests/e2e/desktop-publish-flow.test.ts tests/server/publisher.test.ts`

Expected: PASS without contacting `fanqienovel.com`.

```bash
git add src/server/automation/publisher.ts tests/e2e/fanqie-mock-server.ts tests/e2e/desktop-publish-flow.test.ts
git commit -m "test: cover scheduled publish flow with local mock"
```

---

### Task 11: Automate Windows and macOS GitHub releases

**Files:**
- Create: `.github/workflows/release.yml`
- Create: `docs/desktop-release-checklist.zh.md`

- [ ] **Step 1: Add the release workflow**

Create `.github/workflows/release.yml`:

```yaml
name: Desktop Release

on:
  push:
    tags:
      - "v*"

permissions:
  contents: write

jobs:
  build:
    strategy:
      fail-fast: false
      matrix:
        include:
          - os: windows-latest
            command: npm run dist:win
            artifact: windows-installer
          - os: macos-latest
            command: npm run dist:mac
            artifact: macos-installer
    runs-on: ${{ matrix.os }}
    env:
      PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: "1"
      CSC_IDENTITY_AUTO_DISCOVERY: "false"
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm test
      - run: npm run typecheck
      - run: ${{ matrix.command }}
      - uses: actions/upload-artifact@v4
        with:
          name: ${{ matrix.artifact }}
          path: release/*
          if-no-files-found: error

  release:
    needs: build
    runs-on: ubuntu-latest
    steps:
      - uses: actions/download-artifact@v4
        with:
          path: artifacts
          merge-multiple: true
      - name: Create GitHub Release
        env:
          GH_TOKEN: ${{ github.token }}
        run: gh release create "$GITHUB_REF_NAME" artifacts/* --generate-notes --title "$GITHUB_REF_NAME"
```

- [ ] **Step 2: Add the release checklist**

Create `docs/desktop-release-checklist.zh.md` with checkboxes for:

- Clean `npm ci`, tests, type-check, and build.
- Windows install/start/folder picker/Chrome detection/update preservation/uninstall.
- macOS DMG install/start/folder picker/Chrome detection/update preservation/uninstall.
- Unsigned warning instructions verified.
- Mock end-to-end test passed.
- Authorized live one-chapter publish date/time and local record verified.
- Explicit wording when live acceptance has not run: “构建通过，尚未完成真实发布验收”.

- [ ] **Step 3: Validate workflow syntax and commit**

Run: `npm test && npm run typecheck && npm run build`

Expected: PASS.

Inspect `.github/workflows/release.yml` and confirm no repository secrets are required for unsigned builds.

```bash
git add .github/workflows/release.yml docs/desktop-release-checklist.zh.md
git commit -m "ci: build desktop installers on version tags"
```

---

### Task 12: Perform packaged smoke tests and authorized live acceptance

**Files:**
- Modify: `docs/desktop-release-checklist.zh.md`
- Modify: `README.md`

- [ ] **Step 1: Run the complete local verification suite**

Run:

```bash
npm ci
npm test
npm run typecheck
npm run build
```

Expected: all PASS with no skipped desktop tests except platform-specific installer execution.

- [ ] **Step 2: Create a release candidate tag**

Show the user the exact version and commit SHA, then obtain explicit approval to create and push the release-candidate tag. Only after approval, and only when the worktree is clean and all prior tasks are committed, run:

```bash
git tag v0.2.0-rc.1
git push origin v0.2.0-rc.1
```

Expected: GitHub Actions produces one Windows installer and one universal macOS DMG in the release candidate.

- [ ] **Step 3: Test the Windows package**

On Windows:

1. Install without Node.js running.
2. Open the application by desktop shortcut.
3. Confirm the application data path is visible and opens.
4. Choose a novel folder with the native picker and by manual path.
5. Confirm the installed Chrome is detected and the independent browser opens.
6. Install the same release candidate over the existing installation and confirm settings/login data remain.
7. Uninstall once while retaining `.fanqie-publish.json`, then reinstall and uninstall once with deletion enabled.
8. Confirm `%APPDATA%\\fanqie-publish-tool` is removed after uninstall.

Record exact artifact name, Windows version, and result in the checklist.

- [ ] **Step 4: Test the macOS package**

On macOS:

1. Mount the DMG and drag the application to Applications.
2. Follow the documented unsigned first-open flow.
3. Repeat the path, folder picker, Chrome, overwrite-update, retain-record, and delete-record checks from Windows.
4. Confirm the application data root is gone and the app moves to Trash after “卸载并清理”.

Record exact artifact name, macOS version, architecture, and result in the checklist.

- [ ] **Step 5: Request explicit live-publish authorization**

Prepare one new chapter that does not already exist in the selected book, schedule it for a user-approved future time, and show the final chapter/date/time preview. Do not click “确认发布” until the user explicitly authorizes this external-state change.

- [ ] **Step 6: Verify the live result**

After authorization:

1. Run exactly one chapter through the packaged application.
2. Confirm Fanqie shows the chapter as “待发布”.
3. Confirm Fanqie date/time exactly match the local plan.
4. Confirm `.fanqie-publish.json` records `scheduled`, planned date, planned time, and submission time.
5. Save non-sensitive screenshots or text evidence in the release checklist; never commit cookies or manuscript body.

- [ ] **Step 7: State completion accurately and commit the checklist**

If either OS package or the live publish is unverified, report “构建通过，尚未完成真实发布验收” and leave the corresponding checkbox open. Only use “桌面版完成” after every required item is checked.

```bash
git add docs/desktop-release-checklist.zh.md README.md
git commit -m "docs: record desktop release verification"
```

---

## Official References

- Electron security checklist: https://www.electronjs.org/docs/latest/tutorial/security
- Electron application paths and single-instance lock: https://www.electronjs.org/docs/latest/api/app
- Electron native dialogs: https://www.electronjs.org/docs/latest/api/dialog
- electron-builder configuration: https://www.electron.build/docs/configuration/
- electron-builder NSIS target: https://www.electron.build/docs/nsis/
- electron-builder DMG target: https://www.electron.build/docs/dmg/
- electron-builder GitHub Actions guidance: https://www.electron.build/docs/features/github-actions/
