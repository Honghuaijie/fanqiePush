# 番茄章节发布工具桌面化实施计划

> **给执行本计划的开发代理：** 必须使用 `superpowers:subagent-driven-development`（推荐）或 `superpowers:executing-plans`，逐个任务执行。每完成一步，就更新对应的复选框，不允许跳过测试直接实现。

**目标：** 把现有番茄章节发布工具做成 Windows 和 macOS 上双击即可使用的桌面应用，同时保留现有网页开发模式和已经跑通的 Playwright 发布流程。

**总体架构：** Electron 负责桌面窗口、系统文件夹选择、应用数据目录、单实例运行、退出提醒和卸载入口。桌面应用启动时，在后台自动启动现有 Express 服务，并让 React 页面从本机随机端口加载；网页开发模式仍然可以分别运行 Vite 和 Express。番茄发布控制器通过依赖注入使用桌面版统一的 `default` 账号资料目录，不复制第二套发布逻辑。

**技术栈：** TypeScript、React 18、Express 4、Playwright、Electron、electron-builder、Vite、Vitest、tsup、GitHub Actions

**对应设计文档：** `docs/superpowers/specs/2026-07-15-fanqie-desktop-app-design.zh.md`

---

## 一、实施原则

1. 现有发布流程已经能够实际使用，桌面化过程中优先复用，不进行无关重构。
2. 每项功能先写失败测试，再写最小实现，然后运行测试确认通过。
3. 每个任务单独提交，方便出现问题时定位和回退。
4. 桌面应用和网页开发模式共用章节解析、排期、发布记录和番茄自动化代码。
5. 小说正文、登录资料、配置、日志和发布记录只保存在本地。
6. 未经过用户明确授权，不能推送版本标签，也不能在真实番茄账号点击“确认发布”。
7. 自动测试和安装包构建通过，不等于真实发布验收完成。

---

## 二、文件结构规划

### 2.1 后端服务边界

- 新建 `src/server/app.ts`：创建可配置的 Express 应用，支持 API 令牌、静态页面和发布控制器注入。
- 新建 `src/server/start-server.ts`：在本机随机端口启动服务，并提供可靠的关闭方法。
- 修改 `src/server/index.ts`：保留现在的网页开发启动方式。
- 修改 `src/server/routes.ts`：不再直接依赖全局发布控制器，改为接收传入的控制器。
- 修改 `src/server/automation/publisher.ts`：把真实 Playwright 启动器单独导出，允许桌面版传入账号资料目录和任务记录回调。

### 2.2 桌面运行和本地数据

- 新建 `src/desktop/contracts.ts`：桌面主进程与 React 页面之间的数据类型。
- 新建 `src/desktop/app-paths.ts`：统一生成应用数据、登录资料、日志和任务记录路径。
- 新建 `src/desktop/app-data.ts`：保存配置、最近小说、工具生成文件清单和异常中断任务。
- 新建 `src/desktop/chrome.ts`：检查 Windows 和 macOS 是否安装 Chrome。
- 新建 `src/desktop/log-store.ts`：本地日志轮转和脱敏诊断包。
- 新建 `src/desktop/lifecycle.ts`：关闭提醒和异常中断判断。
- 新建 `src/desktop/cleanup.ts`：卸载前预览和数据删除。
- 新建 `src/desktop/ipc.ts`：注册受限制的桌面通信接口。
- 新建 `src/desktop/preload.ts`：只向 React 页面暴露允许使用的桌面能力。
- 新建 `src/desktop/main.ts`：Electron 启动入口。

### 2.3 React 页面

- 新建 `src/client/desktop.ts`：网页模式和桌面模式共用的可选桌面接口。
- 新建 `src/client/components/SettingsPanel.tsx`：版本、Chrome 状态、数据地址、日志和更新入口。
- 新建 `src/client/components/UninstallDialog.tsx`：卸载清理预览、选择和结果。
- 修改 `src/client/api.ts`：桌面模式自动携带本地服务地址和临时令牌。
- 修改 `src/client/App.tsx`：加载桌面信息、最近小说、异常中断提醒、设置和卸载流程。
- 修改 `src/client/components/ImportPanel.tsx`：增加系统文件夹选择器，同时保留手动路径输入。
- 修改 `src/client/styles.css`：桌面设置、路径展示、卸载和响应式布局。

### 2.4 构建、测试和发布

- 新建 `tsup.config.ts`：构建 Electron 主进程和预加载脚本。
- 新建 `tsconfig.desktop.json`：单独检查桌面代码类型。
- 新建 `electron-builder.yml`：生成 Windows NSIS 安装程序和 macOS DMG。
- 新建 `build/installer.nsh`：Windows 卸载时清理数据。
- 新建 `build/icon.png`、`build/icon.ico`、`build/icon.icns`：原创应用图标。
- 新建 `.github/workflows/release.yml`：GitHub 自动构建两个系统的安装包。
- 新建桌面、客户端和模拟发布测试。
- 更新 `README.md` 和新增桌面版发布验收清单。

---

## 任务 1：把 Express 服务改成可由桌面应用启动和关闭

**目的：** 让 Electron 可以在后台启动现有服务，不再要求用户手动运行后端，同时不影响现在的网页开发方式。

**文件：**

- 新建：`src/server/app.ts`
- 新建：`src/server/start-server.ts`
- 修改：`src/server/index.ts`
- 修改：`src/server/routes.ts`
- 测试：`tests/server/app.test.ts`

- [ ] **步骤 1：先写失败测试**

测试必须覆盖：

1. 使用端口 `0` 时，系统自动分配一个可用的本机端口。
2. `/api/health` 可以正常访问。
3. 开启桌面临时令牌后，未携带令牌的业务接口返回 `401`。
4. 携带正确令牌可以访问业务接口。
5. 打包模式可以提供 React 静态页面，访问 `/settings` 时回退到 `index.html`。
6. 测试结束后服务可以彻底关闭，不残留端口。

核心测试结构：

```ts
handle = await startLocalServer({ port: 0, apiToken: "desktop-secret" });

const missing = await fetch(`${handle.origin}/api/publish/state`);
expect(missing.status).toBe(401);

const accepted = await fetch(`${handle.origin}/api/publish/state`, {
  headers: { "x-fanqie-token": "desktop-secret" }
});
expect(accepted.status).toBe(200);
```

- [ ] **步骤 2：运行测试，确认它确实失败**

运行：

```bash
npm test -- tests/server/app.test.ts
```

预期：因为 `src/server/start-server.ts` 尚不存在而失败。

- [ ] **步骤 3：让路由接收发布控制器**

`src/server/routes.ts` 改为：

```ts
import type { PublishController } from "./automation/publisher";

export interface CreateRoutesOptions {
  publishController: PublishController;
}

export function createRoutes({ publishController }: CreateRoutesOptions): Router {
  const router = Router();
  // 现有路由主体保持原行为。
  return router;
}
```

- [ ] **步骤 4：实现 Express 应用工厂**

`src/server/app.ts` 提供：

```ts
export interface CreateServerAppOptions {
  apiToken?: string;
  allowedOrigins?: string[];
  staticDir?: string;
  publishController?: PublishController;
}

export function createServerApp(options: CreateServerAppOptions = {}) {
  // 健康检查不需要令牌；其他 /api 接口需要正确令牌。
  // staticDir 存在时提供 React 静态页面和前端路由回退。
}
```

`src/server/start-server.ts` 返回：

```ts
export interface LocalServerHandle {
  origin: string;
  server: Server;
  close(): Promise<void>;
}
```

服务只能监听 `127.0.0.1`，不能绑定到局域网地址。

- [ ] **步骤 5：保留网页开发入口**

`src/server/index.ts` 使用固定开发端口调用新服务：

```ts
const handle = await startLocalServer({
  port: Number(process.env.PORT ?? 3456)
});
console.log(`Fanqie publish tool API listening on ${handle.origin}`);
```

- [ ] **步骤 6：验证并提交**

```bash
npm test -- tests/server/app.test.ts tests/server/routes.test.ts
npm run typecheck
```

预期：全部通过。

```bash
git add src/server/app.ts src/server/start-server.ts src/server/index.ts src/server/routes.ts tests/server/app.test.ts
git commit -m "refactor: expose desktop-ready local server"
```

---

## 任务 2：增加版本化应用数据和统一账号资料目录

**目的：** 桌面版所有小说共用一个 `default` 番茄账号登录状态，并记录最近使用的小说和工具生成的文件。

**文件：**

- 新建：`src/desktop/app-paths.ts`
- 新建：`src/desktop/app-data.ts`
- 修改：`src/server/automation/publisher.ts`
- 修改：`.gitignore`
- 测试：`tests/desktop/app-data.test.ts`
- 测试：`tests/server/publisher.test.ts`

- [ ] **步骤 1：先写路径和持久化失败测试**

测试必须确认：

- 默认账号资料路径是 `accounts/default/chrome-profile`。
- 最近小说去重并最多保存 10 个。
- 最近使用的小说排在最前面。
- 生成文件清单不会重复。
- 配置文件包含 `schemaVersion: 1`。
- 写入配置使用临时文件再重命名，避免突然退出导致配置损坏。

```ts
const paths = createDesktopPaths(root);
expect(paths.defaultAccountProfile).toBe(
  path.join(root, "accounts", "default", "chrome-profile")
);
```

- [ ] **步骤 2：运行失败测试**

```bash
npm test -- tests/desktop/app-data.test.ts
```

预期：桌面数据模块尚不存在，测试失败。

- [ ] **步骤 3：实现稳定路径**

```ts
export interface DesktopPaths {
  root: string;
  settingsFile: string;
  generatedFilesText: string;
  logsDir: string;
  diagnosticsDir: string;
  defaultAccountProfile: string;
  interruptedTaskFile: string;
}
```

应用内部目录统一放在操作系统提供的 `userData` 根目录下，不能继续把 Chrome 登录资料放在小说文件夹中。

- [ ] **步骤 4：实现配置和清单存储**

`src/desktop/app-data.ts` 至少提供：

```ts
readSettings()
rememberFolder(folderPath)
registerGeneratedFile(filePath)
readGeneratedFiles()
markTaskActive(task)
clearTaskMarker()
```

`generated-files.txt` 每行只保存一个工具生成文件的完整地址，供 Windows 卸载程序读取。

- [ ] **步骤 5：给发布控制器增加桌面依赖**

```ts
export interface PublishControllerOptions {
  resolveProfileDir?: (input: StartPublishInput) => string;
  onGeneratedFile?: (filePath: string) => Promise<void> | void;
  onTaskStarted?: (input: StartPublishInput) => Promise<void> | void;
  onTaskFinished?: () => Promise<void> | void;
  chromeExecutablePath?: string;
}
```

网页开发模式没有传入这些配置时，继续使用原来的小说目录资料路径；桌面版传入统一的 `default` 账号路径。

- [ ] **步骤 6：分离真实 Playwright 启动器**

```ts
export const playwrightBrowserLauncher: BrowserLauncher = {
  // 保留现有已经跑通的浏览器操作代码。
};

export const publishController = createPublishController(
  playwrightBrowserLauncher
);
```

- [ ] **步骤 7：增加忽略规则并验证**

`.gitignore` 增加：

```gitignore
.fanqie-browser-profile/
release/
dist-electron/
```

不在这个任务里删除用户已有浏览器资料。桌面版第一次使用时按确认过的方案重新登录一次。

```bash
npm test -- tests/desktop/app-data.test.ts tests/server/publisher.test.ts
npm run typecheck
```

- [ ] **步骤 8：提交**

```bash
git add .gitignore src/desktop/app-paths.ts src/desktop/app-data.ts src/server/automation/publisher.ts tests/desktop/app-data.test.ts tests/server/publisher.test.ts
git commit -m "feat: add desktop data and account profile boundaries"
```

---

## 任务 3：检测 Windows 和 macOS 的 Chrome

**目的：** 应用启动时知道能否进行发布；没有 Chrome 时仍能进入主界面查看设置，但禁止开始发布。

**文件：**

- 新建：`src/desktop/chrome.ts`
- 修改：`src/server/automation/publisher.ts`
- 测试：`tests/desktop/chrome.test.ts`

- [ ] **步骤 1：先写 Chrome 路径失败测试**

覆盖以下情况：

- macOS 系统 Applications 目录。
- macOS 当前用户 Applications 目录。
- Windows `PROGRAMFILES`。
- Windows `PROGRAMFILES(X86)`。
- Windows `LOCALAPPDATA`。
- 所有路径都不存在。

```ts
expect(result).toEqual({
  installed: true,
  executablePath: expected
});
```

- [ ] **步骤 2：运行测试确认失败**

```bash
npm test -- tests/desktop/chrome.test.ts
```

- [ ] **步骤 3：实现检测模块**

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

只返回第一个确实存在的 Chrome 可执行文件。找不到时返回 `{ installed: false }`，不抛出难懂的技术异常。

- [ ] **步骤 4：让 Playwright 使用检测到的 Chrome**

```ts
openBrowser(profileDir: string, executablePath?: string): Promise<BrowserSession>;
```

传入 `executablePath` 时使用它；未传入时网页开发模式继续使用 `channel: "chrome"`。二者不能同时传给 Playwright。

- [ ] **步骤 5：验证并提交**

```bash
npm test -- tests/desktop/chrome.test.ts tests/server/publisher.test.ts
npm run typecheck
git add src/desktop/chrome.ts src/server/automation/publisher.ts tests/desktop/chrome.test.ts tests/server/publisher.test.ts
git commit -m "feat: detect system Chrome for desktop publishing"
```

---

## 任务 4：建立安全的 Electron 桌面外壳

**目的：** 双击应用后自动启动后端、打开桌面窗口，并提供系统文件夹选择器。

**文件：**

- 修改：`package.json`
- 修改：`package-lock.json`
- 新建：`tsconfig.desktop.json`
- 新建：`tsup.config.ts`
- 新建：`src/desktop/contracts.ts`
- 新建：`src/desktop/ipc.ts`
- 新建：`src/desktop/preload.ts`
- 新建：`src/desktop/main.ts`
- 新建：`src/client/desktop.ts`
- 测试：`tests/desktop/ipc.test.ts`

- [ ] **步骤 1：记录改造前基线**

```bash
npm test
npm run typecheck
npm run build
```

预期：安装 Electron 前，现有测试、类型检查和网页构建全部通过。

- [ ] **步骤 2：安装桌面开发依赖**

```bash
npm install --save-dev electron electron-builder tsup concurrently wait-on cross-env @testing-library/react @testing-library/user-event jsdom
```

继续使用本机 Chrome，因此 CI 和打包阶段设置 `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1`。

- [ ] **步骤 3：先写桌面通信安全测试**

```ts
expect(isAllowedRendererUrl(
  "http://127.0.0.1:5173/",
  ["http://127.0.0.1:5173"]
)).toBe(true);

expect(isAllowedRendererUrl(
  "https://example.com/",
  ["http://127.0.0.1:5173"]
)).toBe(false);
```

所有能读取本地路径、打开目录或卸载的 IPC 请求都必须校验来源窗口。

- [ ] **步骤 4：定义受限制的桌面接口**

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

React 页面不能直接获得 Node.js、文件系统或 Electron 的完整权限。

- [ ] **步骤 5：实现 Electron 主进程**

启动顺序必须是：

1. 把 `userData` 固定到系统应用数据目录下的 `fanqie-publish-tool`。
2. 使用 `app.requestSingleInstanceLock()`，阻止重复启动。
3. 创建应用数据服务并检测 Chrome。
4. 生成 32 字节随机临时令牌。
5. 在随机本机端口启动 Express。
6. 创建安全的 `BrowserWindow`。
7. 开发模式加载 Vite；打包模式加载内部 Express 页面。
8. 拒绝主窗口跳转到未知网站或创建未知窗口。

窗口必须使用：

```ts
webPreferences: {
  preload: preloadPath,
  nodeIntegration: false,
  contextIsolation: true,
  sandbox: true
}
```

- [ ] **步骤 6：增加桌面构建脚本**

`package.json` 至少包含：

```json
{
  "main": "dist-electron/main.cjs",
  "scripts": {
    "build:web": "vite build",
    "build:desktop": "tsup",
    "build": "npm run build:web && npm run build:desktop",
    "dev:desktop": "npm run build:desktop && concurrently -k \"vite --host 127.0.0.1\" \"cross-env VITE_DEV_SERVER_URL=http://127.0.0.1:5173 wait-on tcp:5173 && electron .\""
  }
}
```

- [ ] **步骤 7：手动验证桌面外壳**

```bash
npm run dev:desktop
```

必须确认：

- 只运行一个桌面应用实例。
- 再次双击时切回已有窗口。
- 系统文件夹选择器能够返回目录。
- Electron 没有 Node integration 或 context isolation 安全警告。
- 空闲时关闭窗口，内部服务也随之结束。

- [ ] **步骤 8：自动验证并提交**

```bash
npm test -- tests/desktop/ipc.test.ts tests/server/app.test.ts
npm run typecheck
npm run build
git add package.json package-lock.json tsconfig.desktop.json tsup.config.ts src/desktop/contracts.ts src/desktop/ipc.ts src/desktop/preload.ts src/desktop/main.ts src/client/desktop.ts tests/desktop/ipc.test.ts
git commit -m "feat: add secure Electron desktop shell"
```

---

## 任务 5：接入桌面 API、系统文件夹选择和最近小说

**目的：** 用户可以点击按钮选择小说文件夹，也可以继续手动输入路径，并快速重新打开最近使用的小说。

**文件：**

- 修改：`src/client/api.ts`
- 修改：`src/client/App.tsx`
- 修改：`src/client/components/ImportPanel.tsx`
- 修改：`src/client/styles.css`
- 测试：`tests/client/desktop-ui.test.tsx`

- [ ] **步骤 1：先写界面失败测试**

测试点击“选择小说文件夹”后，模拟桌面接口返回 `/books/测试书`，并确认页面更新路径。再测试手动输入路径仍然有效。

```tsx
await user.click(screen.getByRole("button", {
  name: "选择小说文件夹"
}));
expect(onFolderPathChange).toHaveBeenCalledWith("/books/测试书");
```

- [ ] **步骤 2：让 API 自动识别桌面模式**

桌面模式请求地址为 `${apiOrigin}/api/...`，并携带：

```ts
headers: {
  "content-type": "application/json",
  "x-fanqie-token": runtime.apiToken
}
```

网页模式没有 `window.fanqieDesktop` 时，继续使用现在的相对地址 `/api/...`。

- [ ] **步骤 3：修改导入区域**

增加：

- “选择小说文件夹”按钮。
- 最近使用文件夹菜单。
- 路径输入框继续可编辑。
- 成功导入后才写入最近记录。
- 最多显示 10 条最近记录。

- [ ] **步骤 4：验证小窗口不重叠**

把桌面窗口缩到 760px 宽，路径输入框、选择按钮、导入按钮和最近记录不得重叠或溢出。

- [ ] **步骤 5：测试并提交**

```bash
npm test -- tests/client/desktop-ui.test.tsx
npm run typecheck
npm run build
git add src/client/api.ts src/client/App.tsx src/client/components/ImportPanel.tsx src/client/styles.css tests/client/desktop-ui.test.tsx
git commit -m "feat: add native novel folder selection"
```

---

## 任务 6：增加设置页并显示所有数据地址

**目的：** 用户能在客户端看到应用数据、Chrome 登录资料和日志的完整保存地址，并能直接打开对应目录。

**文件：**

- 新建：`src/client/components/SettingsPanel.tsx`
- 修改：`src/client/App.tsx`
- 修改：`src/client/styles.css`
- 修改：`src/desktop/contracts.ts`
- 修改：`src/desktop/ipc.ts`
- 修改：`src/desktop/main.ts`
- 修改：`src/desktop/app-data.ts`
- 测试：`tests/client/desktop-ui.test.tsx`
- 测试：`tests/desktop/app-data.test.ts`

- [ ] **步骤 1：先写设置页失败测试**

测试必须看到：

- 当前版本，例如 `0.2.0`。
- Chrome 状态“已找到 Chrome”或“未找到 Chrome”。
- 应用数据完整地址。
- Chrome 登录资料完整地址。
- 日志完整地址。
- “打开文件夹”按钮打开的是对应行的准确地址。

- [ ] **步骤 2：测试数据占用统计**

统计并分别返回：

```ts
usage: {
  applicationBytes: number;
  profileBytes: number;
  logsBytes: number;
  generatedBytes: number;
}
```

统计小说文件夹生成文件时，只读取文件大小，不能读取或打包 Markdown 正文。

- [ ] **步骤 3：实现桌面信息结构**

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
  usage: StorageUsage;
  recentFolders: string[];
  generatedFiles: string[];
  interruptedTask?: InterruptedTask;
}
```

- [ ] **步骤 4：实现设置界面**

设置页分为：

1. 运行环境。
2. 数据与存储。
3. 日志与诊断。
4. 版本更新。
5. 数据清理与卸载。

路径必须是可选择、可复制的完整文本。每个目录使用文件夹图标按钮并提供悬停说明，不能只显示难以理解的图标。

- [ ] **步骤 5：验证并提交**

```bash
npm test -- tests/client/desktop-ui.test.tsx tests/desktop/app-data.test.ts
npm run typecheck
npm run build
git add src/client/components/SettingsPanel.tsx src/client/App.tsx src/client/styles.css src/desktop/contracts.ts src/desktop/ipc.ts src/desktop/main.ts src/desktop/app-data.ts tests/client/desktop-ui.test.tsx tests/desktop/app-data.test.ts
git commit -m "feat: show desktop storage and environment settings"
```

---

## 任务 7：增加本地日志、脱敏诊断包和异常任务提醒

**目的：** 桌面应用出错时能够定位问题，但诊断文件不能包含正文、Cookie 或密码。

**文件：**

- 新建：`src/desktop/log-store.ts`
- 新建：`src/desktop/lifecycle.ts`
- 修改：`src/desktop/app-data.ts`
- 修改：`src/desktop/main.ts`
- 修改：`src/desktop/ipc.ts`
- 修改：`src/client/App.tsx`
- 修改：`src/client/components/SettingsPanel.tsx`
- 测试：`tests/desktop/log-store.test.ts`
- 测试：`tests/desktop/lifecycle.test.ts`

- [ ] **步骤 1：先写日志和脱敏失败测试**

测试内容中故意放入：

```text
body
cookie
password
authorization
```

导出的诊断文件必须把值替换为 `[REDACTED]`，不能出现原始敏感值。

- [ ] **步骤 2：实现日志轮转**

```ts
createLogStore({
  logsDir,
  maxBytes: 5_000_000,
  retentionDays: 14
})
```

单个日志超过 5MB 时轮转，自动删除 14 天以前的日志。

- [ ] **步骤 3：实现诊断包**

导出一个本地 JSON 文件，包含：

- 应用版本。
- 操作系统。
- 脱敏配置。
- Chrome 是否安装。
- 最近运行日志。

不得遍历 Chrome 账号资料目录，不得读取小说正文。

- [ ] **步骤 4：记录异常中断任务**

开始发布前写入 `interrupted-task.json`；全部成功或用户主动停止后删除。文件只保存书名、文件夹地址、当前章节、开始时间和最后状态。

应用下次启动时显示：上次任务异常结束，请先检查番茄后台。不能自动重发。

- [ ] **步骤 5：实现发布中关闭提醒**

以下状态视为任务仍在运行：

```ts
"running"
"paused"
"waiting-login"
```

关闭应用时默认按钮必须是“取消退出”。只有用户确认停止后，才关闭专用 Chrome、内部服务和应用。

- [ ] **步骤 6：验证并提交**

```bash
npm test -- tests/desktop/log-store.test.ts tests/desktop/lifecycle.test.ts tests/server/publisher.test.ts
npm run typecheck
git add src/desktop/log-store.ts src/desktop/lifecycle.ts src/desktop/app-data.ts src/desktop/main.ts src/desktop/ipc.ts src/client/App.tsx src/client/components/SettingsPanel.tsx tests/desktop/log-store.test.ts tests/desktop/lifecycle.test.ts
git commit -m "feat: add desktop diagnostics and interrupted task recovery"
```

---

## 任务 8：实现数据清理预览和卸载

**目的：** 卸载时必须删除应用自己的数据，并让用户选择是否删除小说文件夹里的发布记录；默认选择删除。

**文件：**

- 新建：`src/desktop/cleanup.ts`
- 新建：`src/client/components/UninstallDialog.tsx`
- 修改：`src/desktop/ipc.ts`
- 修改：`src/desktop/main.ts`
- 修改：`src/client/components/SettingsPanel.tsx`
- 修改：`src/client/styles.css`
- 测试：`tests/desktop/cleanup.test.ts`
- 测试：`tests/client/desktop-ui.test.tsx`

- [ ] **步骤 1：先写清理失败测试**

覆盖：

- 应用数据始终删除。
- 用户选择保留时，`.fanqie-publish.json` 不删除。
- 用户选择删除时，已登记的 `.fanqie-publish.json` 删除。
- 文件不存在显示“未找到”。
- 权限不足显示失败原因。
- 有任何失败项时，不能显示“已全部清理”。

```ts
type CleanupStatus =
  | "pending"
  | "deleted"
  | "kept"
  | "missing"
  | "failed";
```

- [ ] **步骤 2：先写卸载弹窗测试**

“同时删除小说文件夹中的发布记录”默认勾选，并显示：

```text
删除发布记录后，以后可能无法识别已经提交过的章节。
```

- [ ] **步骤 3：实现安全清理规则**

应用只能：

- 删除准确配置的应用数据根目录。
- 删除生成文件清单中记录的具体文件。
- 不能递归删除小说文件夹。
- 不能删除未登记的任意用户文件。

- [ ] **步骤 4：实现两步卸载**

第一步展示待删除完整地址并执行数据清理；第二步才卸载应用。清理失败时保留应用并展示失败路径，方便用户处理。

- [ ] **步骤 5：分别实现系统行为**

- Windows：启动 NSIS 卸载程序，成功启动后桌面应用退出。
- macOS：停止发布和日志，清理应用数据，把 `.app` 移入废纸篓后退出。
- 开发模式：禁止删除源码，只提示“安装版才支持卸载”。

- [ ] **步骤 6：验证并提交**

```bash
npm test -- tests/desktop/cleanup.test.ts tests/client/desktop-ui.test.tsx
npm run typecheck
git add src/desktop/cleanup.ts src/client/components/UninstallDialog.tsx src/desktop/ipc.ts src/desktop/main.ts src/client/components/SettingsPanel.tsx src/client/styles.css tests/desktop/cleanup.test.ts tests/client/desktop-ui.test.tsx
git commit -m "feat: add explicit data cleanup and uninstall flow"
```

---

## 任务 9：生成 Windows 和 macOS 安装包

**目的：** Windows 生成 `Setup.exe`，macOS 生成 `.dmg`，用户不需要安装 Node.js。

**文件：**

- 修改：`package.json`
- 修改：`package-lock.json`
- 新建：`electron-builder.yml`
- 新建：`build/installer.nsh`
- 新建：`build/icon.png`
- 新建：`build/icon.ico`
- 新建：`build/icon.icns`
- 修改：`README.md`

- [ ] **步骤 1：制作原创应用图标**

图标表达“章节定时发布”，不能复制番茄官方标志。检查 16、32、128、256 和 1024 像素下是否清楚，避免小字。

- [ ] **步骤 2：配置 electron-builder**

关键配置：

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
mac:
  icon: build/icon.icns
  identity: null
  target:
    - target: dmg
      arch: [universal]
```

- [ ] **步骤 3：实现 Windows 系统卸载清理**

NSIS 卸载时先询问是否删除小说发布记录，默认选择“是”；然后无论用户如何选择，都必须删除：

```text
%APPDATA%\fanqie-publish-tool
```

读取 `generated-files.txt` 时只逐个删除登记文件，不删除父级小说目录。

- [ ] **步骤 4：增加版本和打包命令**

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

- [ ] **步骤 5：构建当前系统安装包**

macOS：

```bash
PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm run dist:mac
```

Windows：

```powershell
$env:PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD="1"
npm run dist:win
```

必须在没有全局 Node.js 服务运行的情况下安装和启动。

- [ ] **步骤 6：补充未签名安装说明**

README 明确写出：

- Windows 如何从“更多信息”选择继续运行。
- macOS 如何从“隐私与安全性”选择仍要打开。
- 当前未签名版本只适合第一阶段自用，不适合作为正式商业版。
- 覆盖安装不会删除本地数据。
- 应用内卸载如何选择保留或删除发布记录。

- [ ] **步骤 7：提交**

```bash
git add package.json package-lock.json electron-builder.yml build/installer.nsh build/icon.png build/icon.ico build/icon.icns README.md
git commit -m "build: package Windows and macOS desktop apps"
```

---

## 任务 10：使用本地模拟番茄页面测试完整发布流程

**目的：** 不修改真实番茄账号，也能测试创建章节、填内容、检测和定时设置的完整选择器流程。

**文件：**

- 修改：`src/server/automation/publisher.ts`
- 新建：`tests/e2e/fanqie-mock-server.ts`
- 新建：`tests/e2e/desktop-publish-flow.test.ts`

- [ ] **步骤 1：让 Playwright 启动器可以用于测试**

```ts
export interface PlaywrightLauncherOptions {
  channel?: "chrome";
  executablePath?: string;
  headless?: boolean;
  viewport?: { width: number; height: number };
}
```

真实使用默认打开可见 Chrome；自动测试使用无界面模式。番茄作者后台地址允许测试传入本地地址，默认仍然是真实番茄地址。

- [ ] **步骤 2：建立本地模拟页面**

模拟页面必须包含现有选择器实际使用的元素：

1. 书籍列表中的“测试书”和“章节管理”。
2. 章节管理页中的“新建章节”，并打开新标签页。
3. 章节号、标题和正文输入区域。
4. “下一步”。
5. 错别字分支中的“提交”。
6. “全面检测”。
7. 发布设置中的 AI“否”、定时开关、日期、时间和“确认发布”。

- [ ] **步骤 3：先写完整失败测试**

使用临时小说文件夹准备一章超过 1000 字的内容，运行真实 Playwright 选择器，然后检查模拟服务器收到：

```ts
expect(mockServer.submissions).toEqual([{
  chapterNumber: "1",
  title: "第001章 开局",
  body: expect.stringContaining("测试正文"),
  plannedDate: "2026-08-01",
  plannedTime: "09:30",
  aiUsed: false
}]);
```

同时检查 `.fanqie-publish.json` 中状态为 `scheduled`。

- [ ] **步骤 4：覆盖两个检测分支**

- 有错别字提示：点击“提交”后进入内容检测。
- 无错别字提示：直接进入内容检测。

两个分支都必须选择“全面检测”，不能选择基础检测。

- [ ] **步骤 5：禁止访问真实番茄域名**

```bash
npm test -- tests/e2e/desktop-publish-flow.test.ts
```

测试通过时不得请求 `fanqienovel.com`。如果模拟页面缺少某个真实控件，修复模拟页面，不能为了让测试通过而给生产代码增加只在模拟页面存在的选择器。

- [ ] **步骤 6：提交**

```bash
git add src/server/automation/publisher.ts tests/e2e/fanqie-mock-server.ts tests/e2e/desktop-publish-flow.test.ts
git commit -m "test: cover scheduled publish flow with local mock"
```

---

## 任务 11：GitHub 自动构建 Windows 和 macOS 安装包

**目的：** 创建版本标签后，GitHub 自动测试并生成两个系统的安装包。

**文件：**

- 新建：`.github/workflows/release.yml`
- 新建：`docs/desktop-release-checklist.zh.md`

- [ ] **步骤 1：增加双平台构建任务**

工作流触发条件：

```yaml
on:
  push:
    tags:
      - "v*"
```

矩阵必须包含：

```yaml
- os: windows-latest
  command: npm run dist:win
- os: macos-latest
  command: npm run dist:mac
```

每个平台依次运行：

```text
npm ci
npm test
npm run typecheck
对应系统打包命令
```

构建结果使用 `actions/upload-artifact@v4` 上传，两个平台成功后再创建 GitHub Release。

- [ ] **步骤 2：增加验收清单**

清单必须包含：

- Windows 安装、启动、文件夹选择、Chrome、覆盖更新和卸载。
- macOS 安装、启动、文件夹选择、Chrome、覆盖更新和卸载。
- 未签名系统提示说明。
- 本地模拟发布测试。
- 真实单章发布授权和验证。
- 未完成真实验收时必须使用的准确表述。

- [ ] **步骤 3：验证并提交**

```bash
npm test
npm run typecheck
npm run build
git add .github/workflows/release.yml docs/desktop-release-checklist.zh.md
git commit -m "ci: build desktop installers on version tags"
```

第一阶段使用 GitHub 自带令牌即可上传未签名安装包，不配置商业签名证书。

---

## 任务 12：安装包验收和经过授权的真实发布测试

**目的：** 只有两个系统的安装包和真实单章定时发布都经过检查，才允许说桌面版完成。

**文件：**

- 修改：`docs/desktop-release-checklist.zh.md`
- 修改：`README.md`

- [ ] **步骤 1：运行完整本地验证**

```bash
npm ci
npm test
npm run typecheck
npm run build
```

预期：全部通过。

- [ ] **步骤 2：请求创建候选版本的授权**

先向用户展示准确版本号和提交编号。只有用户明确同意后，才运行：

```bash
git tag v0.2.0-rc.1
git push origin v0.2.0-rc.1
```

- [ ] **步骤 3：Windows 安装包验收**

必须实际检查：

1. 不运行 Node.js 也能安装和启动。
2. 数据保存完整地址可以看到并打开。
3. 系统文件夹选择和手动路径都能导入小说。
4. 能检测本机 Chrome 并打开独立浏览器。
5. 覆盖安装后配置和登录状态仍在。
6. 卸载选择保留时，`.fanqie-publish.json` 仍在。
7. 卸载选择删除时，发布记录被删除。
8. `%APPDATA%\fanqie-publish-tool` 被删除。

- [ ] **步骤 4：macOS 安装包验收**

必须实际检查：

1. DMG 能安装到 Applications。
2. 未签名首次打开说明有效。
3. 数据地址、文件夹选择、Chrome 和独立浏览器正常。
4. 覆盖安装后数据仍在。
5. 两种卸载选择结果正确。
6. 应用数据删除，应用移入废纸篓。

- [ ] **步骤 5：请求真实单章发布授权**

准备一个番茄后台尚不存在的新章节，在开始前向用户展示：

- 书名。
- 章节号和标题。
- 发布日期。
- 发布时间。

没有用户明确授权，不能点击真实番茄页面的“确认发布”。

- [ ] **步骤 6：验证真实结果**

授权后只发布一章，并检查：

1. 番茄章节列表显示“待发布”。
2. 番茄日期和时间与本地计划完全一致。
3. `.fanqie-publish.json` 写入 `scheduled`。
4. 记录包含计划日期、计划时间和提交时间。
5. 验收证据不得包含 Cookie、登录资料或小说完整正文。

- [ ] **步骤 7：准确说明完成状态**

只要 Windows、macOS 或真实发布任意一项没有实际验证，就必须说明：

```text
构建通过，尚未完成真实发布验收。
```

全部项目真实通过后，才可以说明“桌面版完成”。

```bash
git add docs/desktop-release-checklist.zh.md README.md
git commit -m "docs: record desktop release verification"
```

---

## 三、最终交付内容

实施结束后应当得到：

- Windows x64 安装程序 `Setup.exe`。
- macOS 通用架构安装镜像 `.dmg`。
- 一个双击即可打开的桌面主窗口。
- 一个由工具控制的独立 Chrome 发布窗口。
- 原有网页开发模式。
- 可见且可打开的应用数据地址。
- 单一 `default` 番茄账号登录资料。
- 最近使用的小说列表。
- 本地日志和脱敏诊断包。
- 可选择是否删除小说发布记录的卸载流程。
- GitHub 自动构建工作流。
- Windows、macOS 和真实单章发布验收记录。

## 四、明确不包含在第一阶段的内容

- 多番茄账号界面。
- 小说与账号绑定。
- 应用内自动更新。
- 内置专用浏览器。
- Windows 和 macOS 商业代码签名。
- 云端同步。
- 商业授权、付费和用户系统。

这些功能已经在结构上留出扩展位置，但本次实施不提前加入。

## 五、官方参考资料

- Electron 安全规范：https://www.electronjs.org/docs/latest/tutorial/security
- Electron 应用数据目录和单实例：https://www.electronjs.org/docs/latest/api/app
- Electron 系统文件夹选择器：https://www.electronjs.org/docs/latest/api/dialog
- electron-builder 配置：https://www.electron.build/docs/configuration/
- Windows NSIS 安装程序：https://www.electron.build/docs/nsis/
- macOS DMG：https://www.electron.build/docs/dmg/
- GitHub Actions 构建参考：https://www.electron.build/docs/features/github-actions/
