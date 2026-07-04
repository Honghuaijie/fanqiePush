import { access, mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createPublishController } from "../../src/server/automation/publisher";
import type { PublishPlanItem } from "../../src/shared/types";

const planItem: PublishPlanItem = {
  chapterNumber: 1,
  title: "第001章 开局",
  fileName: "第001章 开局.md",
  characterCount: 12,
  plannedDate: "2026-07-01",
  plannedTime: "09:30",
  status: "pending"
};

let tempDir: string | null = null;

afterEach(async () => {
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
    tempDir = null;
  }
});

describe("publisher controller", () => {
  it("starts a browser session and exposes paused skeleton state", async () => {
    const opened: string[] = [];
    const controller = createPublishController({
      openBrowser: async (profileDir) => {
        opened.push(profileDir);
        return {
          goto: async (url) => {
            opened.push(url);
          },
          inspect: async () => ({
            url: "https://fanqienovel.com/main/writer/book-manage",
            title: "作者专区",
            visibleText: ["小说", "查看全部", "创建章节"],
            buttons: ["立即体验", "创建章节"],
            links: ["查看全部"]
          }),
          openChapterManager: async (bookName) => {
            opened.push(`chapter-manager:${bookName}`);
          },
          openNewChapterEditor: async () => {
            opened.push("new-chapter-editor");
          },
          saveDraftChapter: async () => undefined,
          close: async () => {
            opened.push("closed");
          }
        };
      }
    });

    const state = await controller.start({
      bookName: "测试书",
      folderPath: "/books/测试书",
      items: [planItem]
    });

    expect(state).toMatchObject({
      status: "paused",
      currentChapter: 1,
      message: "已打开新建章节编辑器，准备定时发布当前章。"
    });
    expect(opened).toEqual([
      path.join("/books/测试书", ".fanqie-browser-profile"),
      "https://fanqienovel.com/main/writer/book-manage",
      "chapter-manager:测试书",
      "new-chapter-editor"
    ]);
  });

  it("returns step logs while opening the chapter editor", async () => {
    const controller = createPublishController({
      openBrowser: async () => ({
        goto: async () => undefined,
        inspect: async () => ({
          url: "https://fanqienovel.com/main/writer/book-manage",
          title: "作者专区",
          visibleText: [],
          buttons: [],
          links: []
        }),
        openChapterManager: async () => undefined,
        openNewChapterEditor: async () => undefined,
        saveDraftChapter: async () => undefined,
        close: async () => undefined
      })
    });

    const state = await controller.start({
      bookName: "测试书",
      folderPath: "/books/测试书",
      items: [planItem]
    });

    expect(state.logs?.map((log) => log.message)).toEqual([
      "正在打开番茄作者后台。",
      "正在打开《测试书》的章节管理。",
      "正在打开新建章节编辑器。",
      "已打开新建章节编辑器，准备定时发布当前章。"
    ]);
  });

  it("does not open another browser when a session is already active", async () => {
    const events: string[] = [];
    const controller = createPublishController({
      openBrowser: async () => {
        events.push("open");
        return {
          goto: async () => undefined,
          inspect: async () => ({
            url: "https://fanqienovel.com/main/writer/book-manage",
            title: "作者专区",
            visibleText: [],
            buttons: [],
            links: []
          }),
          openChapterManager: async (bookName) => {
            events.push(`chapter-manager:${bookName}`);
          },
          openNewChapterEditor: async () => {
            events.push("new-chapter-editor");
          },
          saveDraftChapter: async () => undefined,
          close: async () => undefined
        };
      }
    });

    await controller.start({
      bookName: "测试书",
      folderPath: "/books/测试书",
      items: [planItem]
    });
    const secondState = await controller.start({
      bookName: "测试书",
      folderPath: "/books/测试书",
      items: [planItem]
    });

    expect(events).toEqual([
      "open",
      "chapter-manager:测试书",
      "new-chapter-editor",
      "chapter-manager:测试书",
      "new-chapter-editor"
    ]);
    expect(secondState.message).toBe("已打开新建章节编辑器，准备定时发布当前章。");
  });

  it("shows a readable error when the browser profile is already in use", async () => {
    const controller = createPublishController({
      openBrowser: async () => {
        throw new Error("browserType.launchPersistentContext: Target page, context or browser has been closed\n[pid=61095][out] 正在现有的浏览器会话中打开。");
      }
    });

    await expect(controller.start({
      bookName: "测试书",
      folderPath: "/books/测试书",
      items: [planItem]
    })).rejects.toThrow("发布专用浏览器已经在运行");
  });

  it("waits for manual login when Fanqie redirects to the login page", async () => {
    const events: string[] = [];
    const controller = createPublishController({
      openBrowser: async () => ({
        goto: async (url) => {
          events.push(`goto:${url}`);
        },
        inspect: async () => ({
          url: "https://fanqienovel.com/main/writer/login",
          title: "作者专区-番茄小说网",
          visibleText: ["验证码登录", "扫码登录", "登录/注册"],
          buttons: ["登录/注册"],
          links: []
        }),
        openChapterManager: async () => {
          events.push("chapter-manager");
        },
        openNewChapterEditor: async () => {
          events.push("new-chapter-editor");
        },
        saveDraftChapter: async () => undefined,
        close: async () => undefined
      })
    });

    const state = await controller.start({
      bookName: "测试书",
      folderPath: "/books/测试书",
      items: [planItem]
    });

    expect(state).toMatchObject({
      status: "waiting-login",
      currentChapter: 1,
      message: "请在弹出的 Chrome 窗口中完成番茄登录，登录成功后点击继续。"
    });
    expect(events).toEqual([
      `goto:https://fanqienovel.com/main/writer/book-manage`
    ]);
  });

  it("continues after manual login and opens the new chapter editor", async () => {
    let loggedIn = false;
    const events: string[] = [];
    const controller = createPublishController({
      openBrowser: async () => ({
        goto: async (url) => {
          events.push(`goto:${url}`);
        },
        inspect: async () => loggedIn
          ? {
              url: "https://fanqienovel.com/main/writer/book-manage",
              title: "作者专区",
              visibleText: ["测试书", "章节管理"],
              buttons: [],
              links: []
            }
          : {
              url: "https://fanqienovel.com/main/writer/login",
              title: "作者专区-番茄小说网",
              visibleText: ["验证码登录", "扫码登录", "登录/注册"],
              buttons: ["登录/注册"],
              links: []
            },
        openChapterManager: async (bookName) => {
          events.push(`chapter-manager:${bookName}`);
        },
        openNewChapterEditor: async () => {
          events.push("new-chapter-editor");
        },
        saveDraftChapter: async () => undefined,
        close: async () => undefined
      })
    });

    await controller.start({
      bookName: "测试书",
      folderPath: "/books/测试书",
      items: [planItem]
    });
    loggedIn = true;
    const state = await controller.continueAfterLogin();

    expect(state).toMatchObject({
      status: "paused",
      currentChapter: 1,
      message: "已打开新建章节编辑器，准备定时发布当前章。"
    });
    expect(events).toEqual([
      `goto:https://fanqienovel.com/main/writer/book-manage`,
      `goto:https://fanqienovel.com/main/writer/book-manage`,
      "chapter-manager:测试书",
      "new-chapter-editor"
    ]);
  });

  it("waits for manual login when login redirect is detected after chapter manager lookup fails", async () => {
    let inspectCount = 0;
    const controller = createPublishController({
      openBrowser: async () => ({
        goto: async () => undefined,
        inspect: async () => {
          inspectCount += 1;
          return inspectCount === 1
            ? {
                url: "https://fanqienovel.com/main/writer/book-manage",
                title: "作者专区",
                visibleText: ["加载中"],
                buttons: [],
                links: []
              }
            : {
                url: "https://fanqienovel.com/main/writer/login",
                title: "作者专区-番茄小说网",
                visibleText: ["验证码登录", "扫码登录", "登录/注册"],
                buttons: ["登录/注册"],
                links: []
              };
        },
        openChapterManager: async () => {
          throw new Error("没有找到《测试书》的章节管理入口。");
        },
        openNewChapterEditor: async () => undefined,
        saveDraftChapter: async () => undefined,
        close: async () => undefined
      })
    });

    const state = await controller.start({
      bookName: "测试书",
      folderPath: "/books/测试书",
      items: [planItem]
    });

    expect(state).toMatchObject({
      status: "waiting-login",
      currentChapter: 1,
      message: "请在弹出的 Chrome 窗口中完成番茄登录，登录成功后点击继续。"
    });
  });

  it("stops an active browser session", async () => {
    const events: string[] = [];
    const controller = createPublishController({
      openBrowser: async () => ({
        goto: async () => undefined,
        inspect: async () => ({
          url: "https://fanqienovel.com/main/writer/book-manage",
          title: "作者专区",
          visibleText: [],
          buttons: [],
          links: []
        }),
        openChapterManager: async () => undefined,
        openNewChapterEditor: async () => {
          events.push("new-chapter-editor");
        },
        saveDraftChapter: async () => undefined,
        close: async () => {
          events.push("closed");
        }
      })
    });

    await controller.start({
      bookName: "测试书",
      folderPath: "/books/测试书",
      items: [planItem]
    });
    const state = await controller.stop();

    expect(state.status).toBe("stopped");
    expect(state.message).toBe("已停止发布任务。");
    expect(events).toEqual(["new-chapter-editor", "closed"]);
  });

  it("inspects the current browser page for Fanqie adaptation", async () => {
    const controller = createPublishController({
      openBrowser: async () => ({
        goto: async () => undefined,
        inspect: async () => ({
          url: "https://fanqienovel.com/main/writer/",
          title: "作者专区-番茄小说网",
          visibleText: ["番茄原创平台全新上线", "查看全部", "创建章节"],
          buttons: ["立即体验", "创建章节"],
          links: ["查看全部"]
        }),
        openChapterManager: async () => undefined,
        openNewChapterEditor: async () => undefined,
        saveDraftChapter: async () => undefined,
        close: async () => undefined
      })
    });

    await controller.start({
      bookName: "测试书",
      folderPath: "/books/测试书",
      items: [planItem]
    });

    await expect(controller.inspect()).resolves.toEqual({
      url: "https://fanqienovel.com/main/writer/",
      title: "作者专区-番茄小说网",
      visibleText: ["番茄原创平台全新上线", "查看全部", "创建章节"],
      buttons: ["立即体验", "创建章节"],
      links: ["查看全部"]
    });
  });

  it("opens the chapter manager for the selected book", async () => {
    const events: string[] = [];
    const controller = createPublishController({
      openBrowser: async () => ({
        goto: async () => undefined,
        inspect: async () => ({
          url: "https://fanqienovel.com/main/writer/book-manage",
          title: "作者专区",
          visibleText: [],
          buttons: [],
          links: []
        }),
        openChapterManager: async (bookName) => {
          events.push(bookName);
        },
        openNewChapterEditor: async () => undefined,
        saveDraftChapter: async () => undefined,
        close: async () => undefined
      })
    });

    await controller.start({
      bookName: "镇武令出，满城宗师跪了",
      folderPath: "/books/镇武令出，满城宗师跪了",
      items: [planItem]
    });

    const state = await controller.openChapterManager();

    expect(events).toEqual(["镇武令出，满城宗师跪了", "镇武令出，满城宗师跪了"]);
    expect(state.message).toBe("已进入章节管理页面，等待下一步适配。");
  });

  it("opens the new chapter editor without publishing", async () => {
    const events: string[] = [];
    const controller = createPublishController({
      openBrowser: async () => ({
        goto: async () => undefined,
        inspect: async () => ({
          url: "https://fanqienovel.com/main/writer/chapter-manage",
          title: "章节管理",
          visibleText: [],
          buttons: ["新建章节"],
          links: ["新建章节"]
        }),
        openChapterManager: async () => undefined,
        openNewChapterEditor: async () => {
          events.push("opened");
        },
        saveDraftChapter: async () => undefined,
        close: async () => undefined
      })
    });

    await controller.start({
      bookName: "镇武令出，满城宗师跪了",
      folderPath: "/books/镇武令出，满城宗师跪了",
      items: [planItem]
    });

    const state = await controller.openNewChapterEditor();

    expect(events).toEqual(["opened", "opened"]);
    expect(state.message).toBe("已打开新建章节编辑器，仅用于草稿适配，未提交发布。");
  });

  it("saves one chapter as draft without going to publish settings", async () => {
    const drafts: Array<{ chapterNumber: number; title: string; body: string }> = [];
    const controller = createPublishController({
      openBrowser: async () => ({
        goto: async () => undefined,
        inspect: async () => ({
          url: "https://fanqienovel.com/main/writer/publish",
          title: "章节编辑",
          visibleText: [],
          buttons: ["存草稿", "下一步"],
          links: []
        }),
        openChapterManager: async () => undefined,
        openNewChapterEditor: async () => undefined,
        saveDraftChapter: async (chapter) => {
          drafts.push(chapter);
        },
        close: async () => undefined
      })
    });

    await controller.start({
      bookName: "镇武令出，满城宗师跪了",
      folderPath: "/books/镇武令出，满城宗师跪了",
      items: [planItem]
    });

    const state = await controller.saveDraftChapter({
      chapterNumber: 21,
      title: "第021章 测试草稿",
      body: "这是一段只保存到草稿箱的测试正文。"
    });

    expect(drafts).toEqual([{
      chapterNumber: 21,
      title: "第021章 测试草稿",
      body: "这是一段只保存到草稿箱的测试正文。"
    }]);
    expect(state.message).toBe("第21章已保存为草稿，未进入发布设置。");
  });

  it("saves the current planned chapter as draft and records it locally", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "fanqie-draft-"));
    const bookDir = path.join(tempDir, "测试书");
    await mkdir(bookDir);
    await writeFile(path.join(bookDir, "第001章 开局.md"), "# 第001章 开局\n\n这是第一章正文。\n\n第二段。", "utf8");

    const drafts: Array<{ chapterNumber: number; title: string; body: string }> = [];
    const controller = createPublishController({
      openBrowser: async () => ({
        goto: async () => undefined,
        inspect: async () => ({
          url: "https://fanqienovel.com/main/writer/publish",
          title: "章节编辑",
          visibleText: [],
          buttons: ["存草稿", "下一步"],
          links: []
        }),
        openChapterManager: async () => undefined,
        openNewChapterEditor: async () => undefined,
        saveDraftChapter: async (chapter) => {
          drafts.push(chapter);
        },
        close: async () => undefined
      })
    });

    await controller.start({
      bookName: "测试书",
      folderPath: bookDir,
      items: [planItem]
    });

    const state = await controller.saveCurrentDraft();

    expect(drafts).toEqual([{
      chapterNumber: 1,
      title: "第001章 开局",
      body: "这是第一章正文。\n\n第二段。"
    }]);
    expect(state.message).toBe("第1章已保存为草稿，未进入发布设置。");

    const log = JSON.parse(await readFile(path.join(bookDir, ".fanqie-publish.json"), "utf8"));
    expect(log.chapters).toMatchObject([{
      chapterNumber: 1,
      title: "第001章 开局",
      fileName: "第001章 开局.md",
      status: "drafted"
    }]);
  });

  it("schedules the current planned chapter and records it locally", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "fanqie-schedule-"));
    const bookDir = path.join(tempDir, "测试书");
    await mkdir(bookDir);
    await writeFile(path.join(bookDir, "第001章 开局.md"), "# 第001章 开局\n\n这是第一章正文。".repeat(120), "utf8");

    const scheduled: Array<{
      chapterNumber: number;
      title: string;
      body: string;
      plannedDate: string;
      plannedTime: string;
    }> = [];
    const controller = createPublishController({
      openBrowser: async () => ({
        goto: async () => undefined,
        inspect: async () => ({
          url: "https://fanqienovel.com/main/writer/publish",
          title: "章节编辑",
          visibleText: [],
          buttons: ["存草稿", "下一步"],
          links: []
        }),
        openChapterManager: async () => undefined,
        openNewChapterEditor: async () => undefined,
        saveDraftChapter: async () => undefined,
        scheduleChapter: async (chapter, plannedDate, plannedTime) => {
          scheduled.push({
            chapterNumber: chapter.chapterNumber,
            title: chapter.title,
            body: chapter.body,
            plannedDate,
            plannedTime
          });
        },
        close: async () => undefined
      })
    });

    await controller.start({
      bookName: "测试书",
      folderPath: bookDir,
      items: [planItem]
    });

    const state = await controller.scheduleCurrentChapter();

    expect(scheduled).toEqual([{
      chapterNumber: 1,
      title: "第001章 开局",
      body: expect.stringContaining("这是第一章正文。"),
      plannedDate: "2026-07-01",
      plannedTime: "09:30"
    }]);
    expect(state.message).toBe("第1章已定时发布：2026-07-01 09:30。");

    const log = JSON.parse(await readFile(path.join(bookDir, ".fanqie-publish.json"), "utf8"));
    expect(log.chapters).toMatchObject([{
      chapterNumber: 1,
      title: "第001章 开局",
      fileName: "第001章 开局.md",
      plannedDate: "2026-07-01",
      plannedTime: "09:30",
      status: "scheduled"
    }]);
  });

  it("does not mark a chapter scheduled when publish submission fails", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "fanqie-schedule-fail-"));
    const bookDir = path.join(tempDir, "测试书");
    await mkdir(bookDir);
    await writeFile(path.join(bookDir, "第001章 开局.md"), "# 第001章 开局\n\n这是第一章正文。".repeat(120), "utf8");

    const controller = createPublishController({
      openBrowser: async () => ({
        goto: async () => undefined,
        inspect: async () => ({
          url: "https://fanqienovel.com/main/writer/publish",
          title: "章节编辑",
          visibleText: [],
          buttons: ["存草稿", "下一步"],
          links: []
        }),
        openChapterManager: async () => undefined,
        openNewChapterEditor: async () => undefined,
        saveDraftChapter: async () => undefined,
        scheduleChapter: async () => {
          throw new Error("番茄发布失败：更新作品数超出每日上限");
        },
        close: async () => undefined
      })
    });

    await controller.start({
      bookName: "测试书",
      folderPath: bookDir,
      items: [planItem]
    });

    await expect(controller.scheduleCurrentChapter()).rejects.toThrow("更新作品数超出每日上限");

    await expect(access(path.join(bookDir, ".fanqie-publish.json"))).rejects.toThrow();
  });
});

