import path from "node:path";
import { chromium, type BrowserContext } from "playwright";
import type { PublishPlanItem } from "../../shared/types";
import { importBookFolder, writePublishLog } from "../file-system";
import { updateChapterStatus } from "../publish-log";

type Element = any;
type HTMLElement = any;
type HTMLInputElement = any;
type HTMLTextAreaElement = any;

declare const window: any;
declare const document: {
  body: any;
  title: string;
  createElement(tagName: string): any;
  querySelectorAll(selector: string): any[];
};
declare const HTMLElement: any;
declare const HTMLInputElement: any;
declare const InputEvent: any;
declare const KeyboardEvent: any;

export const FANQIE_WRITER_BOOK_MANAGE_URL = "https://fanqienovel.com/main/writer/book-manage";

export type PublishRunStatus = "idle" | "running" | "paused" | "waiting-login" | "stopped";
export type PublishLogLevel = "info" | "success" | "warning" | "error";

export interface PublishRunLogEntry {
  time: string;
  level: PublishLogLevel;
  message: string;
}

export interface PublishRunState {
  status: PublishRunStatus;
  currentChapter?: number;
  message?: string;
  logs?: PublishRunLogEntry[];
}

export interface BrowserPageSnapshot {
  url: string;
  title: string;
  visibleText: string[];
  buttons: string[];
  links: string[];
  interactiveElements?: Array<{
    tag: string;
    text: string;
    value?: string;
    href?: string;
    role?: string;
    className?: string;
  }>;
}

export interface StartPublishInput {
  bookName: string;
  folderPath: string;
  items: PublishPlanItem[];
}

export interface DraftChapterInput {
  chapterNumber: number;
  title: string;
  body: string;
}

export interface BrowserSession {
  goto(url: string): Promise<void>;
  inspect(): Promise<BrowserPageSnapshot>;
  openChapterManager(bookName: string): Promise<void>;
  openNewChapterEditor(): Promise<void>;
  saveDraftChapter(chapter: DraftChapterInput, log?: (message: string, level?: PublishLogLevel) => void): Promise<void>;
  scheduleChapter?(chapter: DraftChapterInput, plannedDate: string, plannedTime: string, log?: (message: string, level?: PublishLogLevel) => void): Promise<void>;
  close(): Promise<void>;
}

export interface BrowserLauncher {
  openBrowser(profileDir: string): Promise<BrowserSession>;
}

export interface PublishController {
  getState(): PublishRunState;
  start(input: StartPublishInput): Promise<PublishRunState>;
  inspect(): Promise<BrowserPageSnapshot>;
  openChapterManager(): Promise<PublishRunState>;
  openNewChapterEditor(): Promise<PublishRunState>;
  continueAfterLogin(): Promise<PublishRunState>;
  saveDraftChapter(chapter: DraftChapterInput): Promise<PublishRunState>;
  saveCurrentDraft(): Promise<PublishRunState>;
  scheduleCurrentChapter(): Promise<PublishRunState>;
  stop(): Promise<PublishRunState>;
}

function isBrowserProfileInUseError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("正在现有的浏览器会话中打开")
    || message.includes("Target page, context or browser has been closed");
}

function isLoginSnapshot(snapshot: BrowserPageSnapshot): boolean {
  const visibleText = snapshot.visibleText.join(" ");
  const buttons = snapshot.buttons.join(" ");
  return snapshot.url.includes("/login")
    || visibleText.includes("验证码登录")
    || visibleText.includes("扫码登录")
    || visibleText.includes("登录/注册")
    || buttons.includes("登录/注册");
}

export function createPublishController(launcher: BrowserLauncher): PublishController {
  let state: PublishRunState = { status: "idle" };
  let session: BrowserSession | null = null;
  let currentBookName: string | null = null;
  let currentFolderPath: string | null = null;
  let currentItems: PublishPlanItem[] = [];
  let logs: PublishRunLogEntry[] = [];

  function withLogs(nextState: PublishRunState): PublishRunState {
    state = { ...nextState, logs: [...logs] };
    return state;
  }

  function appendLog(message: string, level: PublishLogLevel = "info") {
    logs = [...logs, { time: new Date().toISOString(), level, message }].slice(-100);
    state = { ...state, logs: [...logs] };
  }

  async function openCurrentChapterEditor(): Promise<PublishRunState> {
    if (!session || !currentBookName) {
      throw new Error("独立浏览器尚未启动，请先点击开始发布。");
    }

    appendLog("正在打开番茄作者后台。");
    await session.goto(FANQIE_WRITER_BOOK_MANAGE_URL);
    const snapshot = await session.inspect();
    if (isLoginSnapshot(snapshot)) {
      appendLog("检测到未登录，等待手动登录。", "warning");
      return withLogs({
        status: "waiting-login",
        currentChapter: state.currentChapter ?? currentItems[0]?.chapterNumber,
        message: "请在弹出的 Chrome 窗口中完成番茄登录，登录成功后点击继续。"
      });
    }

    try {
      appendLog(`正在打开《${currentBookName}》的章节管理。`);
      await session.openChapterManager(currentBookName);
      appendLog("正在打开新建章节编辑器。");
      await session.openNewChapterEditor();
    } catch (error) {
      const nextSnapshot = await session.inspect();
      if (isLoginSnapshot(nextSnapshot)) {
        appendLog("检测到未登录，等待手动登录。", "warning");
        return withLogs({
          status: "waiting-login",
          currentChapter: state.currentChapter ?? currentItems[0]?.chapterNumber,
          message: "请在弹出的 Chrome 窗口中完成番茄登录，登录成功后点击继续。"
        });
      }
      throw error;
    }

    appendLog("已打开新建章节编辑器，准备定时发布当前章。", "success");
    return withLogs({
      status: "paused",
      currentChapter: state.currentChapter ?? currentItems[0]?.chapterNumber,
      message: "已打开新建章节编辑器，准备定时发布当前章。"
    });
  }

  async function getCurrentChapterContext() {
    if (!currentFolderPath || !currentBookName) {
      throw new Error("当前发布任务缺少本地小说信息，请重新导入后开始发布。");
    }

    const currentChapterNumber = state.currentChapter ?? currentItems[0]?.chapterNumber;
    const currentPlanItem = currentItems.find((item) => item.chapterNumber === currentChapterNumber);
    if (!currentPlanItem) {
      throw new Error("没有找到当前要处理的章节，请先生成发布计划。");
    }

    const imported = await importBookFolder(currentFolderPath);
    const chapter = imported.chapters.find((item) => item.fileName === currentPlanItem.fileName);
    if (!chapter) {
      throw new Error(`没有在本地文件夹中找到 ${currentPlanItem.fileName}。`);
    }

    return { chapter, currentPlanItem, imported };
  }

  return {
    getState() {
      return { ...state, logs: [...logs] };
    },

    async start(input) {
      if (session) {
        currentBookName = currentBookName ?? input.bookName;
        currentFolderPath = currentFolderPath ?? input.folderPath;
        currentItems = input.items.length > 0 ? input.items : currentItems;
        state = { ...state, currentChapter: state.currentChapter ?? input.items[0]?.chapterNumber, logs: [...logs] };
        return openCurrentChapterEditor();
      }

      const profileDir = path.join(input.folderPath, ".fanqie-browser-profile");
      try {
        logs = [];
        session = await launcher.openBrowser(profileDir);
        currentBookName = input.bookName;
        currentFolderPath = input.folderPath;
        currentItems = input.items;
        withLogs({
          status: "running",
          currentChapter: input.items[0]?.chapterNumber,
          message: "正在打开番茄作者后台。"
        });
        return await openCurrentChapterEditor();
      } catch (error) {
        session = null;
        currentBookName = null;
        currentFolderPath = null;
        currentItems = [];
        appendLog(error instanceof Error ? error.message : "启动发布失败。", "error");
        if (isBrowserProfileInUseError(error)) {
          throw new Error("发布专用浏览器已经在运行。请先关闭工具打开的那个独立 Chrome 窗口，或者在工具里点“停止发布”后再重新开始。");
        }
        throw error;
      }
    },

    async inspect() {
      if (!session) {
        throw new Error("独立浏览器尚未启动，请先点击开始发布。");
      }

      return session.inspect();
    },

    async openChapterManager() {
      if (!session || !currentBookName) {
        throw new Error("独立浏览器尚未启动，请先点击开始发布。");
      }

      appendLog(`正在打开《${currentBookName}》的章节管理。`);
      await session.openChapterManager(currentBookName);
      appendLog("已进入章节管理页面。", "success");
      return withLogs({
        ...state,
        message: "已进入章节管理页面，等待下一步适配。"
      });
    },

    async openNewChapterEditor() {
      if (!session) {
        throw new Error("独立浏览器尚未启动，请先点击开始发布。");
      }

      appendLog("正在打开新建章节编辑器。");
      await session.openNewChapterEditor();
      appendLog("已打开新建章节编辑器。", "success");
      return withLogs({
        ...state,
        message: "已打开新建章节编辑器，仅用于草稿适配，未提交发布。"
      });
    },

    async continueAfterLogin() {
      if (!session || !currentBookName) {
        throw new Error("独立浏览器尚未启动，请先点击开始发布。");
      }

      appendLog("正在确认登录状态并继续发布。");
      return openCurrentChapterEditor();
    },

    async saveDraftChapter(chapter) {
      if (!session) {
        throw new Error("独立浏览器尚未启动，请先点击开始发布。");
      }

      appendLog(`正在保存第${chapter.chapterNumber}章草稿。`);
      try {
        await session.saveDraftChapter(chapter, appendLog);
      } catch (error) {
        appendLog(error instanceof Error ? error.message : "保存草稿失败。", "error");
        throw error;
      }
      appendLog(`第${chapter.chapterNumber}章已保存为草稿。`, "success");
      return withLogs({
        ...state,
        currentChapter: chapter.chapterNumber,
        message: `第${chapter.chapterNumber}章已保存为草稿，未进入发布设置。`
      });
    },

    async saveCurrentDraft() {
      if (!session) {
        throw new Error("独立浏览器尚未启动，请先点击开始发布。");
      }

      const folderPath = currentFolderPath;
      if (!folderPath) {
        throw new Error("当前发布任务缺少本地小说信息，请重新导入后开始发布。");
      }
      const { chapter, currentPlanItem, imported } = await getCurrentChapterContext();

      appendLog(`正在保存第${chapter.chapterNumber}章草稿。`);
      try {
        await session.saveDraftChapter({
          chapterNumber: chapter.chapterNumber,
          title: chapter.title,
          body: chapter.body
        }, appendLog);
      } catch (error) {
        appendLog(error instanceof Error ? error.message : "保存草稿失败。", "error");
        throw error;
      }

      const nextLog = updateChapterStatus(imported.publishLog, {
        chapterNumber: chapter.chapterNumber,
        title: chapter.title,
        fileName: chapter.fileName,
        characterCount: chapter.characterCount,
        plannedDate: currentPlanItem.plannedDate,
        plannedTime: currentPlanItem.plannedTime,
        submittedAt: new Date().toISOString(),
        status: "drafted"
      });
      await writePublishLog(folderPath, nextLog);

      appendLog(`第${chapter.chapterNumber}章已保存为草稿。`, "success");
      return withLogs({
        ...state,
        currentChapter: chapter.chapterNumber,
        message: `第${chapter.chapterNumber}章已保存为草稿，未进入发布设置。`
      });
    },

    async scheduleCurrentChapter() {
      if (!session) {
        throw new Error("独立浏览器尚未启动，请先点击开始发布。");
      }
      if (!session.scheduleChapter) {
        throw new Error("当前浏览器会话不支持定时发布。");
      }

      const folderPath = currentFolderPath;
      if (!folderPath) {
        throw new Error("当前发布任务缺少本地小说信息，请重新导入后开始发布。");
      }
      const { chapter, currentPlanItem, imported } = await getCurrentChapterContext();
      if (chapter.characterCount < 1000) {
        throw new Error(`第${chapter.chapterNumber}章正文不足 1000 字，无法进入番茄定时发布流程。`);
      }

      appendLog(`正在提交第${chapter.chapterNumber}章定时发布。`);
      try {
        await session.scheduleChapter({
          chapterNumber: chapter.chapterNumber,
          title: chapter.title,
          body: chapter.body
        }, currentPlanItem.plannedDate, currentPlanItem.plannedTime, appendLog);
      } catch (error) {
        appendLog(error instanceof Error ? error.message : "定时发布失败。", "error");
        throw error;
      }

      const nextLog = updateChapterStatus(imported.publishLog, {
        chapterNumber: chapter.chapterNumber,
        title: chapter.title,
        fileName: chapter.fileName,
        characterCount: chapter.characterCount,
        plannedDate: currentPlanItem.plannedDate,
        plannedTime: currentPlanItem.plannedTime,
        submittedAt: new Date().toISOString(),
        status: "scheduled"
      });
      await writePublishLog(folderPath, nextLog);

      appendLog(`第${chapter.chapterNumber}章已定时发布：${currentPlanItem.plannedDate} ${currentPlanItem.plannedTime}。`, "success");
      return withLogs({
        ...state,
        currentChapter: chapter.chapterNumber,
        message: `第${chapter.chapterNumber}章已定时发布：${currentPlanItem.plannedDate} ${currentPlanItem.plannedTime}。`
      });
    },

    async stop() {
      await session?.close();
      session = null;
      currentBookName = null;
      currentFolderPath = null;
      currentItems = [];
      appendLog("已停止发布任务。", "warning");
      return withLogs({ status: "stopped", message: "已停止发布任务。" });
    }
  };
}

export const publishController = createPublishController({
  async openBrowser(profileDir) {
    const context = await chromium.launchPersistentContext(profileDir, {
      channel: "chrome",
      headless: false,
      viewport: { width: 1400, height: 900 }
    });
    let activePage = context.pages()[0] ?? (await context.newPage());
    await context.addInitScript("window.__name = window.__name || ((target) => target);");
    await activePage.evaluate("window.__name = window.__name || ((target) => target);");
    await activePage.bringToFront();

    async function fillEditor(chapter: DraftChapterInput) {
      await activePage.evaluate((draft) => {
        const normalize = (value: string | null | undefined) => (value ?? "").replace(/\s+/g, " ").trim();
        const visible = (element: Element) => {
          const style = window.getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          return style.visibility !== "hidden" && style.display !== "none" && rect.width > 0 && rect.height > 0;
        };
        const setNativeValue = (element: HTMLInputElement | HTMLTextAreaElement, value: string) => {
          const prototype = Object.getPrototypeOf(element);
          const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
          descriptor?.set?.call(element, value);
          element.dispatchEvent(new Event("input", { bubbles: true }));
          element.dispatchEvent(new Event("change", { bubbles: true }));
        };

        const chapterNumberInput = Array.from(document.querySelectorAll("input"))
          .find((element) => visible(element) && element.className.includes("serial-input") && !element.className.includes("serial-editor-input-hint-area"));
        if (chapterNumberInput instanceof HTMLInputElement) {
          setNativeValue(chapterNumberInput, String(draft.chapterNumber));
        }

        const titleInput = Array.from(document.querySelectorAll("input"))
          .find((element) => visible(element) && (
            normalize(element.getAttribute("placeholder")).includes("请输入标题")
            || element.className.includes("serial-editor-input-hint-area")
          ));
        if (!(titleInput instanceof HTMLInputElement)) {
          throw new Error("没有找到章节标题输入框。");
        }
        const titleWithoutSerial = draft.title.replace(/^第\s*0*\d+\s*章\s*/, "").trim() || draft.title;
        setNativeValue(titleInput, titleWithoutSerial);

        const editor = Array.from(document.querySelectorAll(".ProseMirror"))
          .find((element) => visible(element) && normalize(element.textContent).includes("请输入正文"))
          ?? Array.from(document.querySelectorAll(".ProseMirror")).find(visible);
        if (!(editor instanceof HTMLElement)) {
          throw new Error("没有找到正文编辑器。");
        }
        editor.focus();
        editor.innerHTML = "";
        const paragraphs = draft.body.split(/\n{2,}|\n/).map((line) => line.trim()).filter(Boolean);
        for (const paragraph of paragraphs.length > 0 ? paragraphs : [""]) {
          const node = document.createElement("p");
          node.textContent = paragraph;
          editor.appendChild(node);
        }
        editor.dispatchEvent(new InputEvent("input", {
          bubbles: true,
          inputType: "insertText",
          data: draft.body
        }));
      }, chapter);
    }

    async function clickVisibleButton(text: string, options: { exact?: boolean; timeout?: number } = {}) {
      const timeout = options.timeout ?? 15000;
      const point = await activePage.waitForFunction((args: any) => {
        const [targetText, exact] = args as [string, boolean];
        const normalize = (value: string | null | undefined) => (value ?? "").replace(/\s+/g, " ").trim();
        const visible = (element: Element) => {
          const style = window.getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          return style.visibility !== "hidden" && style.display !== "none" && rect.width > 0 && rect.height > 0
            && !element.hasAttribute("disabled") && element.getAttribute("aria-disabled") !== "true";
        };
        const candidates = Array.from(document.querySelectorAll("button, [role='button']"))
          .filter((element) => visible(element) && (exact ? normalize(element.textContent) === targetText : normalize(element.textContent).includes(targetText)))
          .sort((left, right) => normalize(left.textContent).length - normalize(right.textContent).length);
        const target = candidates[0];
        if (!(target instanceof HTMLElement)) {
          return null;
        }
        target.scrollIntoView({ block: "center", inline: "center" });
        const rect = target.getBoundingClientRect();
        return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      }, [text, options.exact ?? true], { timeout });

      const clickPoint = await point.jsonValue();
      if (!clickPoint) {
        throw new Error(`没有找到可点击按钮：${text}`);
      }
      await activePage.mouse.click(clickPoint.x, clickPoint.y);
    }

    async function clickIfVisible(text: string, options: { exact?: boolean } = {}) {
      return activePage.evaluate((args: any) => {
        const [targetText, exact] = args as [string, boolean];
        const normalize = (value: string | null | undefined) => (value ?? "").replace(/\s+/g, " ").trim();
        const visible = (element: Element) => {
          const style = window.getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          return style.visibility !== "hidden" && style.display !== "none" && rect.width > 0 && rect.height > 0;
        };
        const candidates = Array.from(document.querySelectorAll("button, [role='button']"))
          .filter((element) => visible(element) && (exact ? normalize(element.textContent) === targetText : normalize(element.textContent).includes(targetText)))
          .sort((left, right) => normalize(left.textContent).length - normalize(right.textContent).length);
        const target = candidates[0];
        if (target instanceof HTMLElement) {
          target.click();
          return true;
        }
        return false;
      }, [text, options.exact ?? true]);
    }

    async function waitForVisibleText(text: string, timeout = 30000) {
      await activePage.waitForFunction((targetText) => {
        const normalize = (value: string | null | undefined) => (value ?? "").replace(/\s+/g, " ").trim();
        const visible = (element: Element) => {
          const style = window.getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          return style.visibility !== "hidden" && style.display !== "none" && rect.width > 0 && rect.height > 0;
        };
        return Array.from(document.querySelectorAll("body *"))
          .some((element) => visible(element) && normalize(element.textContent).includes(targetText));
      }, text, { timeout });
    }

    async function getPublishPageState() {
      return activePage.evaluate(() => {
        const normalize = (value: string | null | undefined) => (value ?? "").replace(/\s+/g, " ").trim();
        const visible = (element: Element) => {
          const style = window.getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          return style.visibility !== "hidden" && style.display !== "none" && rect.width > 0 && rect.height > 0;
        };
        const buttonTexts = Array.from(document.querySelectorAll("button, [role='button']"))
          .filter(visible)
          .map((element) => normalize(element.textContent))
          .filter(Boolean);
        const bodyText = normalize(document.body.innerText);
        return {
          url: window.location.href,
          buttons: [...new Set(buttonTexts)].slice(0, 30),
          hasEditor: Array.from(document.querySelectorAll(".ProseMirror, [contenteditable='true']")).some(visible),
          hasSaved: bodyText.includes("已保存"),
          hasNext: buttonTexts.some((text) => text === "下一步"),
          hasSubmit: buttonTexts.some((text) => text === "提交"),
          hasFullCheck: buttonTexts.some((text) => text.includes("全面检测")),
          hasAnyCheck: buttonTexts.some((text) => text.includes("检测")),
          hasPublishSettings: bodyText.includes("发布设置") && bodyText.includes("确认发布"),
          hasConfirmPublish: buttonTexts.some((text) => text.includes("确认发布"))
        };
      });
    }

    async function waitForEditorSaved() {
      try {
        await activePage.waitForFunction(() => document.body.innerText.includes("已保存"), null, { timeout: 20000 });
      } catch {
        const state = await getPublishPageState();
        throw new Error(`章节内容已填写，但没有等到“已保存”状态。当前按钮：${state.buttons.join("、") || "无"}`);
      }
    }

    async function clickNextAndWaitForDetection() {
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        await clickVisibleButton("下一步");
        try {
          await activePage.waitForFunction(() => {
            const normalize = (value: string | null | undefined) => (value ?? "").replace(/\s+/g, " ").trim();
            const visible = (element: Element) => {
              const style = window.getComputedStyle(element);
              const rect = element.getBoundingClientRect();
              return style.visibility !== "hidden" && style.display !== "none" && rect.width > 0 && rect.height > 0;
            };
            const buttonTexts = Array.from(document.querySelectorAll("button, [role='button']"))
              .filter(visible)
              .map((element) => normalize(element.textContent));
            const bodyText = normalize(document.body.innerText);
            return buttonTexts.some((text) => text === "提交" || text.includes("检测") || text.includes("确认发布"))
              || bodyText.includes("发布设置");
          }, null, { timeout: 6000 });
          return;
        } catch {
          const state = await getPublishPageState();
          if (!state.hasNext || state.hasSubmit || state.hasFullCheck || state.hasAnyCheck || state.hasPublishSettings) {
            return;
          }
          if (attempt === 3) {
            throw new Error(`已填写章节内容，但点击“下一步”后页面仍停在编辑器。请确认页面是否已保存、标题是否完整、或番茄页面是否有必填项提示。当前按钮：${state.buttons.join("、") || "无"}`);
          }
        }
      }
    }

    async function openPublishSettingsFromDetection() {
      await activePage.waitForTimeout(800);
      await clickIfVisible("提交");

      for (let attempt = 1; attempt <= 3; attempt += 1) {
        const state = await getPublishPageState();
        if (state.hasPublishSettings) return;
        if (state.hasSubmit) {
          await clickIfVisible("提交");
          await activePage.waitForTimeout(800);
          continue;
        }
        if (state.hasFullCheck) {
          await clickVisibleButton("全面检测", { exact: false, timeout: 10000 });
          await activePage.waitForTimeout(1200);
          continue;
        }
        if (state.hasAnyCheck) {
          await clickVisibleButton("检测", { exact: false, timeout: 10000 });
          await activePage.waitForTimeout(1200);
          continue;
        }

        if (attempt < 3) {
          await activePage.waitForTimeout(1200);
          continue;
        }
        throw new Error(`点击“下一步”后没有找到内容检测或发布设置入口。当前按钮：${state.buttons.join("、") || "无"}`);
      }
    }

    async function enableScheduledPublishIfNeeded() {
      const switchPoint = await activePage.evaluate(() => {
        const normalize = (value: string | null | undefined) => (value ?? "").replace(/\s+/g, " ").trim();
        const visible = (element: Element) => {
          const style = window.getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          return style.visibility !== "hidden" && style.display !== "none" && rect.width > 0 && rect.height > 0;
        };
        const dialog = Array.from(document.querySelectorAll("[role='dialog'], .arco-modal, .semi-modal, body > div"))
          .filter(visible)
          .find((element) => normalize(element.textContent).includes("发布设置") && normalize(element.textContent).includes("确认发布"))
          ?? document.body;
        const visibleInputs = Array.from(dialog.querySelectorAll("input")).filter(visible) as HTMLInputElement[];
        const hasScheduleInputs = visibleInputs.length >= 2
          && visibleInputs.some((input) => /^\d{4}[-/]\d{2}[-/]\d{2}$/.test(input.value) || normalize(input.getAttribute("placeholder")).includes("日期"))
          && visibleInputs.some((input) => /^\d{2}:\d{2}$/.test(input.value) || normalize(input.getAttribute("placeholder")).includes("时间"));
        if (hasScheduleInputs) return null;

        const switches = Array.from(dialog.querySelectorAll("button[role='switch'], [role='switch'], .arco-switch, .semi-switch"))
          .filter(visible) as Element[];
        const target = switches.find((element) => element.getAttribute("aria-checked") !== "true" && !element.className.toString().includes("checked"))
          ?? switches[0];
        if (!(target instanceof HTMLElement)) {
          throw new Error("发布设置里没有找到“定时发布”开关。");
        }

        target.scrollIntoView({ block: "center", inline: "center" });
        const rect = target.getBoundingClientRect();
        return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      });

      if (switchPoint) {
        await activePage.mouse.click(switchPoint.x, switchPoint.y);
      }

      await activePage.waitForFunction(() => {
        const normalize = (value: string | null | undefined) => (value ?? "").replace(/\s+/g, " ").trim();
        const visible = (element: Element) => {
          const style = window.getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          return style.visibility !== "hidden" && style.display !== "none" && rect.width > 0 && rect.height > 0;
        };
        const dialog = Array.from(document.querySelectorAll("[role='dialog'], .arco-modal, .semi-modal, body > div"))
          .filter(visible)
          .find((element) => normalize(element.textContent).includes("发布设置") && normalize(element.textContent).includes("确认发布"))
          ?? document.body;
        const inputs = Array.from(dialog.querySelectorAll("input")).filter(visible) as HTMLInputElement[];
        const hasDateInput = inputs.some((input) => /^\d{4}[-/]\d{2}[-/]\d{2}$/.test(input.value) || normalize(input.getAttribute("placeholder")).includes("日期"));
        const hasTimeInput = inputs.some((input) => /^\d{2}:\d{2}$/.test(input.value) || normalize(input.getAttribute("placeholder")).includes("时间"));
        return hasDateInput && hasTimeInput;
      }, null, { timeout: 15000 });
    }

    async function applyPublishSettings(plannedDate: string, plannedTime: string) {
      await enableScheduledPublishIfNeeded();

      await activePage.evaluate(() => {
        const normalize = (value: string | null | undefined) => (value ?? "").replace(/\s+/g, " ").trim();
        const visible = (element: Element) => {
          const style = window.getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          return style.visibility !== "hidden" && style.display !== "none" && rect.width > 0 && rect.height > 0;
        };

        const dialog = Array.from(document.querySelectorAll("[role='dialog'], .arco-modal, .semi-modal, body > div"))
          .filter(visible)
          .find((element) => normalize(element.textContent).includes("发布设置") && normalize(element.textContent).includes("确认发布"))
          ?? document.body;

        const noAi = (Array.from(dialog.querySelectorAll("label, span, div, [role='radio']")) as any[])
          .filter(visible)
          .filter((element) => normalize(element.textContent) === "否")
          .sort((left, right) => normalize(left.textContent).length - normalize(right.textContent).length)[0];
        if (noAi instanceof HTMLElement) {
          noAi.click();
        }
      });

      const pickerInputs = activePage.locator(".arco-modal input.arco-picker-start-time, [role='dialog'] input.arco-picker-start-time");
      await pickerInputs.first().waitFor({ timeout: 15000 });

      async function fillPickerValues(dateText: string, timeText: string) {
        await pickerInputs.nth(0).scrollIntoViewIfNeeded();
        await pickerInputs.nth(0).fill(dateText);
        await activePage.keyboard.press("Tab");
        await activePage.waitForTimeout(200);
        await pickerInputs.nth(1).fill(timeText);
        await activePage.keyboard.press("Tab");
        await activePage.waitForTimeout(300);
      }

      async function readPickerValues() {
        return activePage.evaluate(() => {
          const visible = (element: Element) => {
            const style = window.getComputedStyle(element);
            const rect = element.getBoundingClientRect();
            return style.visibility !== "hidden" && style.display !== "none" && rect.width > 0 && rect.height > 0;
          };
          const inputs = Array.from(document.querySelectorAll(".arco-modal input.arco-picker-start-time, [role='dialog'] input.arco-picker-start-time"))
            .filter(visible) as HTMLInputElement[];
          return {
            date: inputs[0]?.value ?? "",
            time: inputs[1]?.value ?? ""
          };
        });
      }

      const normalizeDateValue = (value: string) => value.replace(/\//g, "-").trim();
      await fillPickerValues(plannedDate, plannedTime);
      let current = await readPickerValues();
      if (normalizeDateValue(current.date) !== plannedDate || current.time.trim() !== plannedTime) {
        await fillPickerValues(plannedDate.replace(/-/g, "/"), plannedTime);
        current = await readPickerValues();
      }

      await activePage.waitForFunction((args: any) => {
        const [dateValue, timeValue] = args as [string, string];
        const normalizeDate = (value: string) => value.replace(/\//g, "-").trim();
        const visible = (element: Element) => {
          const style = window.getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          return style.visibility !== "hidden" && style.display !== "none" && rect.width > 0 && rect.height > 0;
        };
        const inputs = Array.from(document.querySelectorAll(".arco-modal input.arco-picker-start-time, [role='dialog'] input.arco-picker-start-time"))
          .filter(visible) as HTMLInputElement[];
        return normalizeDate(inputs[0]?.value ?? "") === dateValue && (inputs[1]?.value ?? "").trim() === timeValue;
      }, [plannedDate, plannedTime], { timeout: 5000 }).catch(async () => {
        const current = await activePage.evaluate(() => {
          const visible = (element: Element) => {
            const style = window.getComputedStyle(element);
            const rect = element.getBoundingClientRect();
            return style.visibility !== "hidden" && style.display !== "none" && rect.width > 0 && rect.height > 0;
          };
          const inputs = Array.from(document.querySelectorAll(".arco-modal input.arco-picker-start-time, [role='dialog'] input.arco-picker-start-time"))
            .filter(visible) as HTMLInputElement[];
          return {
            date: inputs[0]?.value ?? "",
            time: inputs[1]?.value ?? ""
          };
        });
        throw new Error(`定时发布时间填写失败：计划为 ${plannedDate} ${plannedTime}，页面实际为 ${current.date || "空"} ${current.time || "空"}。`);
      });

    }

    async function waitForPublishSubmissionResult() {
      const result = await activePage.waitForFunction(() => {
        const normalize = (value: string | null | undefined) => (value ?? "").replace(/\s+/g, " ").trim();
        const visible = (element: Element) => {
          const style = window.getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          return style.visibility !== "hidden" && style.display !== "none" && rect.width > 0 && rect.height > 0;
        };
        const bodyText = normalize(document.body.innerText);
        const dialogOpen = Array.from(document.querySelectorAll("[role='dialog'], .arco-modal, .semi-modal, body > div"))
          .filter(visible)
          .some((element) => normalize(element.textContent).includes("发布设置") && normalize(element.textContent).includes("确认发布"));
        const toastText = Array.from(document.querySelectorAll(".arco-message, .semi-toast, .semi-toast-content, [class*='message'], [class*='toast']"))
          .filter(visible)
          .map((element) => normalize(element.textContent))
          .filter(Boolean)
          .join(" ");
        const combinedText = `${toastText} ${bodyText}`;
        const failureMessages = [
          "更新作品数超出每日上限",
          "超出每日上限",
          "发布失败",
          "提交失败",
          "不能发布",
          "无法发布",
          "请选择定时发布时间",
          "请选择",
          "不能为空"
        ];
        const knownFailureText = failureMessages.find((text) => combinedText.includes(text));
        if (knownFailureText) {
          return {
            status: "failed",
            message: knownFailureText === "超出每日上限" ? "更新作品数超出每日上限" : knownFailureText
          };
        }
        if (bodyText.includes("发布成功") || bodyText.includes("提交成功") || bodyText.includes("定时发布成功")) {
          return { status: "succeeded", message: "发布成功" };
        }
        if (!dialogOpen && !bodyText.includes("发布设置")) {
          return { status: "succeeded", message: "发布设置已关闭" };
        }
        return null;
      }, null, { timeout: 15000 }).catch(async () => {
        const state = await getPublishPageState();
        throw new Error(`点击“确认发布”后没有确认到发布结果，未写入成功记录。当前按钮：${state.buttons.join("、") || "无"}`);
      });

      const publishResult = await result.jsonValue() as { status: "failed" | "succeeded"; message: string };
      if (publishResult.status === "failed") {
        throw new Error(`番茄发布失败：${publishResult.message}`);
      }
    }

    return {
      async goto(url) {
        await activePage.goto(url, { waitUntil: "domcontentloaded" });
        await activePage.bringToFront();
      },
      async inspect() {
        return activePage.evaluate(`(() => {
          const normalize = (value) => (value ?? "").replace(/\\s+/g, " ").trim();
          const uniq = (values) => [...new Set(values.map(normalize).filter(Boolean))].slice(0, 80);
          const visible = (element) => {
            const style = window.getComputedStyle(element);
            const rect = element.getBoundingClientRect();
            return style.visibility !== "hidden" && style.display !== "none" && rect.width > 0 && rect.height > 0;
          };

          const visibleElements = Array.from(document.querySelectorAll("button, a, input, textarea, [role='button'], [contenteditable='true'], h1, h2, h3, p, span, div"))
            .filter(visible);

          return {
            url: window.location.href,
            title: document.title,
            visibleText: uniq(visibleElements.map((element) => element.textContent)),
            buttons: uniq(Array.from(document.querySelectorAll("button, [role='button']")).filter(visible).map((element) => element.textContent)),
            links: uniq(Array.from(document.querySelectorAll("a")).filter(visible).map((element) => element.textContent)),
            interactiveElements: Array.from(document.querySelectorAll("a, button, [role='button'], input, textarea, [contenteditable='true']"))
              .filter(visible)
              .slice(0, 120)
              .map((element) => ({
                tag: element.tagName.toLowerCase(),
                text: normalize(element.textContent || element.getAttribute("placeholder") || element.getAttribute("aria-label")),
                value: element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement ? element.value : undefined,
                href: element instanceof HTMLAnchorElement ? element.href : undefined,
                role: element.getAttribute("role") || undefined,
                className: typeof element.className === "string" ? element.className : undefined
              }))
          };
        })()`);
      },
      async openChapterManager(bookName) {
        const targetBookName = JSON.stringify(bookName);
        const openScript = `(() => {
          const targetBookName = ${targetBookName};
          const normalize = (value) => (value ?? "").replace(/\\s+/g, " ").trim();

          if (window.location.href.includes("/chapter-manage/")) return "already-open";

          const bookInfoMatch = window.location.href.match(/\\/book-info\\/(\\d+)/);
          if (bookInfoMatch) {
            window.location.href = "/main/writer/chapter-manage/" + bookInfoMatch[1] + "&" + encodeURIComponent(targetBookName) + "?type=1";
            return "navigating-from-book-info";
          }

          const visible = (element) => {
            const style = window.getComputedStyle(element);
            const rect = element.getBoundingClientRect();
            return style.visibility !== "hidden" && style.display !== "none" && rect.width > 0 && rect.height > 0;
          };

          const clickByText = (text) => {
            const element = Array.from(document.querySelectorAll("button, [role='button'], .close, [aria-label]"))
              .find((candidate) => visible(candidate) && normalize(candidate.textContent || candidate.getAttribute("aria-label")).includes(text));
            if (element instanceof HTMLElement) element.click();
          };

          clickByText("关闭");

          const clickableSelector = "a, button, [role='button'], [class*='btn'], [class*='Btn'], [class*='button'], [class*='Button'], [class*='arco-btn']";
          const textMatches = Array.from(document.querySelectorAll("body *"))
            .filter((element) => visible(element) && normalize(element.textContent).includes("章节管理"))
            .sort((left, right) => normalize(left.textContent).length - normalize(right.textContent).length);

          const exactMatch = textMatches.find((element) => normalize(element.textContent) === "章节管理");
          const scopedMatch = exactMatch ?? textMatches.find((element) => {
            let current = element;
            for (let depth = 0; current && depth < 10; depth += 1) {
              if (normalize(current.textContent).includes(targetBookName)) return true;
              current = current.parentElement;
            }
            return false;
          }) ?? textMatches[0];

          let target = scopedMatch instanceof HTMLElement ? scopedMatch.closest(clickableSelector) : null;
          if (!target && scopedMatch instanceof HTMLElement && normalize(scopedMatch.textContent) === "章节管理") {
            target = scopedMatch;
          }
          if (!target && scopedMatch instanceof HTMLElement) {
            let current = scopedMatch;
            for (let depth = 0; current && depth < 5; depth += 1) {
              const style = window.getComputedStyle(current);
              if (style.cursor === "pointer") {
                target = current;
                break;
              }
              current = current.parentElement;
            }
          }

          if (!(target instanceof HTMLElement)) {
            throw new Error("没有找到《" + targetBookName + "》的章节管理入口。");
          }

          target.click();
          return "clicked";
        })()`;

        let lastError: unknown;
        for (let attempt = 0; attempt < 10; attempt += 1) {
          try {
            await activePage.evaluate(openScript);
            lastError = null;
            break;
          } catch (error) {
            lastError = error;
            await activePage.waitForTimeout(500);
          }
        }
        if (lastError) throw lastError;
        await activePage.waitForLoadState("domcontentloaded");
        await activePage.bringToFront();
      },
      async openNewChapterEditor() {
        const isEditorOpen = () => activePage.evaluate(`(() => {
          const normalize = (value) => (value ?? "").replace(/\\s+/g, " ").trim();
          const visible = (element) => {
            const style = window.getComputedStyle(element);
            const rect = element.getBoundingClientRect();
            return style.visibility !== "hidden" && style.display !== "none" && rect.width > 0 && rect.height > 0;
          };
          const hasDraftButton = Array.from(document.querySelectorAll("button"))
            .some((element) => visible(element) && normalize(element.textContent) === "存草稿");
          const hasEditor = Array.from(document.querySelectorAll(".ProseMirror, [contenteditable='true']"))
            .some(visible);
          return hasDraftButton && hasEditor;
        })()`);

        const isAlreadyInEditor = await isEditorOpen();
        if (isAlreadyInEditor) return;

        const editorHref = await activePage.evaluate<string | null>(`(() => {
          const chapterManageMatch = window.location.href.match(/\\/main\\/writer\\/chapter-manage\\/(\\d+)/);
          if (chapterManageMatch) {
            return window.location.origin + "/main/writer/" + chapterManageMatch[1] + "/publish/?enter_from=newchapter";
          }

          const normalize = (value) => (value ?? "").replace(/\\s+/g, " ").trim();
          const visible = (element) => {
            const style = window.getComputedStyle(element);
            const rect = element.getBoundingClientRect();
            return style.visibility !== "hidden" && style.display !== "none" && rect.width > 0 && rect.height > 0;
          };
          const candidates = Array.from(document.querySelectorAll("a, button, [role='button']"))
            .filter((element) => visible(element) && normalize(element.textContent).includes("新建章节"));
          const target = candidates
            .map((element) => ({ element, text: normalize(element.textContent) }))
            .sort((left, right) => {
              const leftExact = left.text === "新建章节" ? 0 : 1;
              const rightExact = right.text === "新建章节" ? 0 : 1;
              if (leftExact !== rightExact) return leftExact - rightExact;
              const leftIsLink = left.element instanceof HTMLAnchorElement && left.element.href ? 0 : 1;
              const rightIsLink = right.element instanceof HTMLAnchorElement && right.element.href ? 0 : 1;
              return leftIsLink - rightIsLink;
            })[0];

          if (!target) {
            throw new Error("没有找到新建章节入口。");
          }

          if (target.element instanceof HTMLAnchorElement && target.element.href) {
            return target.element.href;
          }

          const nestedLink = target.element.querySelector("a[href]");
          if (nestedLink instanceof HTMLAnchorElement && nestedLink.href) {
            return nestedLink.href;
          }

          const parentLink = target.element.closest("a[href]");
          if (parentLink instanceof HTMLAnchorElement && parentLink.href) {
            return parentLink.href;
          }

          return null;
        })()`);

        if (!editorHref) {
          throw new Error("找到了新建章节按钮，但没有读到编辑器链接。");
        }

        await activePage.goto(editorHref, { waitUntil: "domcontentloaded" });
        await activePage.bringToFront();
        await activePage.waitForFunction(`(() => {
          const normalize = (value) => (value ?? "").replace(/\\s+/g, " ").trim();
          const visible = (element) => {
            const style = window.getComputedStyle(element);
            const rect = element.getBoundingClientRect();
            return style.visibility !== "hidden" && style.display !== "none" && rect.width > 0 && rect.height > 0;
          };
          const hasDraftButton = Array.from(document.querySelectorAll("button"))
            .some((element) => visible(element) && normalize(element.textContent) === "存草稿");
          const hasEditor = Array.from(document.querySelectorAll(".ProseMirror, [contenteditable='true']"))
            .some(visible);
          return hasDraftButton && hasEditor;
        })()`, { timeout: 15000 });

        if (!(await isEditorOpen())) {
          throw new Error("已经跳转到新建章节链接，但没有检测到章节编辑器。");
        }
      },
      async saveDraftChapter(chapter, log) {
        log?.(`正在填写第${chapter.chapterNumber}章标题和正文。`);
        await fillEditor(chapter);
        log?.("正在点击存草稿。");
        await clickVisibleButton("存草稿");
        await activePage.waitForLoadState("domcontentloaded");
      },
      async scheduleChapter(chapter, plannedDate, plannedTime, log) {
        log?.(`正在填写第${chapter.chapterNumber}章标题和正文。`);
        await fillEditor(chapter);
        log?.("正在等待编辑器自动保存。");
        await waitForEditorSaved();
        log?.("正在点击下一步进入检测流程。");
        await clickNextAndWaitForDetection();
        log?.("正在打开发布设置。");
        await openPublishSettingsFromDetection();

        await waitForVisibleText("发布设置", 90000);
        await waitForVisibleText("确认发布", 90000);
        log?.(`正在开启定时发布并填写 ${plannedDate} ${plannedTime}。`);
        await applyPublishSettings(plannedDate, plannedTime);
        await activePage.waitForTimeout(1000);
        log?.("正在点击确认发布。");
        await clickVisibleButton("确认发布", { timeout: 15000 });
        log?.("正在确认番茄返回的发布结果。");
        await waitForPublishSubmissionResult();
      },
      async close() {
        await context.close();
      }
    };
  }
});
