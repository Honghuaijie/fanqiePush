# 番茄章节发布工具 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建第一版本地网页工具：导入一本小说的 Markdown 章节，生成可确认的定时发布计划，并用独立 Playwright 浏览器逐章提交到番茄作者后台。

**Architecture:** 使用 Node.js + TypeScript 做本地后端，提供文件导入、排期、记录存储和自动化控制 API；使用 React + Vite 做本地前端仪表盘；使用 Playwright 持久化浏览器 profile 执行番茄后台自动化。核心解析、排期、记录逻辑放在纯函数模块里，先用单元测试锁住行为，再接 UI 和浏览器自动化。

**Tech Stack:** TypeScript, Node.js, Express, React, Vite, Vitest, Playwright, Zod.

---

## 文件结构

第一版创建这些文件：

- `package.json`：项目脚本和依赖。
- `tsconfig.json`：TypeScript 通用配置。
- `tsconfig.node.json`：后端和测试 TypeScript 配置。
- `vite.config.ts`：前端 Vite 配置。
- `index.html`：本地网页入口。
- `src/shared/types.ts`：前后端共享类型。
- `src/shared/constants.ts`：默认发布时间、记录文件名、状态常量。
- `src/server/index.ts`：Express 服务入口。
- `src/server/file-system.ts`：本地文件夹读取、Markdown 文件读取、记录文件读写。
- `src/server/chapter-parser.ts`：章节文件名和正文解析。
- `src/server/schedule.ts`：章节范围过滤和排期生成。
- `src/server/publish-log.ts`：`.fanqie-publish.json` 的合并、跳过、状态更新。
- `src/server/automation/publisher.ts`：发布自动化编排接口。
- `src/server/automation/fanqie-page.ts`：番茄页面操作封装。
- `src/server/routes.ts`：后端 API 路由。
- `src/client/main.tsx`：React 入口。
- `src/client/App.tsx`：页面状态编排。
- `src/client/api.ts`：前端 API 客户端。
- `src/client/components/ImportPanel.tsx`：导入区。
- `src/client/components/RangePanel.tsx`：章节范围和开始日期。
- `src/client/components/PlanTable.tsx`：发布计划表格。
- `src/client/components/FinalPreview.tsx`：最终确认预览。
- `src/client/components/PublishControls.tsx`：发布控制区。
- `src/client/styles.css`：界面样式。
- `tests/fixtures/novel/第001章 开局.md`：测试章节。
- `tests/fixtures/novel/第002章 夜雨.md`：测试章节。
- `tests/server/chapter-parser.test.ts`：章节解析测试。
- `tests/server/schedule.test.ts`：排期测试。
- `tests/server/publish-log.test.ts`：记录文件测试。
- `tests/server/routes.test.ts`：API 测试。

---

### Task 1: 项目骨架和基础脚本

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `tsconfig.node.json`
- Create: `vite.config.ts`
- Create: `index.html`
- Create: `src/client/main.tsx`
- Create: `src/client/App.tsx`
- Create: `src/client/styles.css`
- Create: `src/server/index.ts`

- [ ] **Step 1: 创建项目配置**

写入 `package.json`：

```json
{
  "name": "fanqie-publish-tool",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx src/server/index.ts",
    "dev:web": "vite --host 127.0.0.1",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc -p tsconfig.node.json --noEmit && tsc --noEmit",
    "build": "vite build"
  },
  "dependencies": {
    "@vitejs/plugin-react": "^4.3.4",
    "cors": "^2.8.5",
    "express": "^4.21.2",
    "playwright": "^1.49.1",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "zod": "^3.24.1"
  },
  "devDependencies": {
    "@types/cors": "^2.8.17",
    "@types/express": "^5.0.0",
    "@types/node": "^22.10.2",
    "@types/react": "^18.3.18",
    "@types/react-dom": "^18.3.5",
    "tsx": "^4.19.2",
    "typescript": "^5.7.2",
    "vite": "^6.0.6",
    "vitest": "^2.1.8"
  }
}
```

写入 `tsconfig.json`：

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "allowJs": false,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "strict": true,
    "forceConsistentCasingInFileNames": true,
    "module": "ESNext",
    "moduleResolution": "Node",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx"
  },
  "include": ["src/client", "src/shared", "vite.config.ts"]
}
```

写入 `tsconfig.node.json`：

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "types": ["node", "vitest/globals"]
  },
  "include": ["src/server", "src/shared", "tests"]
}
```

写入 `vite.config.ts`：

```ts
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    proxy: {
      "/api": "http://127.0.0.1:3456"
    }
  }
});
```

- [ ] **Step 2: 创建最小前端**

写入 `index.html`：

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>番茄章节发布工具</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/client/main.tsx"></script>
  </body>
</html>
```

写入 `src/client/main.tsx`：

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

写入 `src/client/App.tsx`：

```tsx
export function App() {
  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <h1>番茄章节发布工具</h1>
          <p>导入 Markdown 章节，生成排期，并提交到番茄定时发布。</p>
        </div>
      </header>
    </main>
  );
}
```

写入 `src/client/styles.css`：

```css
* {
  box-sizing: border-box;
}

body {
  margin: 0;
  background: #f6f7f9;
  color: #1f2328;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

.app-shell {
  min-height: 100vh;
  padding: 24px;
}

.app-header {
  max-width: 1180px;
  margin: 0 auto 20px;
}

.app-header h1 {
  margin: 0 0 8px;
  font-size: 28px;
}

.app-header p {
  margin: 0;
  color: #687076;
}
```

- [ ] **Step 3: 创建最小后端**

写入 `src/server/index.ts`：

```ts
import cors from "cors";
import express from "express";

const app = express();
const port = Number(process.env.PORT ?? 3456);

app.use(cors({ origin: "http://127.0.0.1:5173" }));
app.use(express.json({ limit: "10mb" }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.listen(port, "127.0.0.1", () => {
  console.log(`Fanqie publish tool API listening on http://127.0.0.1:${port}`);
});
```

- [ ] **Step 4: 安装依赖**

Run: `npm install`

Expected: dependencies install successfully and `package-lock.json` is created.

- [ ] **Step 5: 验证类型和测试脚本**

Run: `npm run typecheck`

Expected: TypeScript exits successfully.

Run: `npm test`

Expected: Vitest exits successfully with no tests or pass summary.

---

### Task 2: 共享类型和章节解析

**Files:**
- Create: `src/shared/types.ts`
- Create: `src/shared/constants.ts`
- Create: `src/server/chapter-parser.ts`
- Create: `tests/fixtures/novel/第001章 开局.md`
- Create: `tests/fixtures/novel/第002章 夜雨.md`
- Create: `tests/server/chapter-parser.test.ts`

- [ ] **Step 1: 写章节解析失败测试**

写入 `tests/fixtures/novel/第001章 开局.md`：

```md
# 第001章 开局

这是第一章正文。

第二段。
```

写入 `tests/fixtures/novel/第002章 夜雨.md`：

```md
# 第002章 夜雨

夜雨落在长街上。
```

写入 `tests/server/chapter-parser.test.ts`：

```ts
import { describe, expect, it } from "vitest";
import { parseChapterFileName, parseMarkdownBody } from "../../src/server/chapter-parser";

describe("chapter parser", () => {
  it("parses supported chapter file names", () => {
    expect(parseChapterFileName("第001章 开局.md")).toEqual({
      chapterNumber: 1,
      displayNumber: "001",
      title: "第001章 开局"
    });
  });

  it("rejects unsupported file names", () => {
    expect(parseChapterFileName("001.md")).toBeNull();
    expect(parseChapterFileName("第1章 开局.txt")).toBeNull();
  });

  it("removes the first markdown heading from body content", () => {
    const markdown = "# 第001章 开局\n\n这是第一章正文。\n\n第二段。";
    expect(parseMarkdownBody(markdown)).toEqual({
      body: "这是第一章正文。\n\n第二段。",
      characterCount: 10
    });
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- tests/server/chapter-parser.test.ts`

Expected: FAIL because `src/server/chapter-parser.ts` does not exist.

- [ ] **Step 3: 实现共享类型和解析器**

写入 `src/shared/constants.ts`：

```ts
export const PUBLISH_LOG_FILE = ".fanqie-publish.json";

export const DEFAULT_DAILY_TIMES = ["09:30", "12:00", "19:00", "19:05"] as const;

export const CHAPTER_STATUSES = ["pending", "scheduled", "failed", "skipped"] as const;
```

写入 `src/shared/types.ts`：

```ts
import type { CHAPTER_STATUSES } from "./constants";

export type ChapterStatus = (typeof CHAPTER_STATUSES)[number];

export interface Chapter {
  chapterNumber: number;
  displayNumber: string;
  title: string;
  fileName: string;
  filePath: string;
  body: string;
  characterCount: number;
  status: ChapterStatus;
}

export interface PublishPlanItem {
  chapterNumber: number;
  title: string;
  fileName: string;
  characterCount: number;
  plannedDate: string;
  plannedTime: string;
  status: ChapterStatus;
  failureReason?: string;
}

export interface PublishLogChapter {
  chapterNumber: number;
  title: string;
  fileName: string;
  characterCount: number;
  plannedDate?: string;
  plannedTime?: string;
  submittedAt?: string;
  status: ChapterStatus;
  failureReason?: string;
}

export interface PublishLog {
  bookName: string;
  updatedAt: string;
  chapters: PublishLogChapter[];
}
```

写入 `src/server/chapter-parser.ts`：

```ts
const FILE_NAME_PATTERN = /^第(\d{3})章\s+(.+)\.md$/u;

export interface ParsedChapterName {
  chapterNumber: number;
  displayNumber: string;
  title: string;
}

export interface ParsedMarkdownBody {
  body: string;
  characterCount: number;
}

export function parseChapterFileName(fileName: string): ParsedChapterName | null {
  const match = fileName.match(FILE_NAME_PATTERN);
  if (!match) return null;

  const displayNumber = match[1];
  const chapterName = match[2].trim();

  return {
    chapterNumber: Number(displayNumber),
    displayNumber,
    title: `第${displayNumber}章 ${chapterName}`
  };
}

export function parseMarkdownBody(markdown: string): ParsedMarkdownBody {
  const normalized = markdown.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");
  const bodyLines = lines[0]?.startsWith("# ") ? lines.slice(1) : lines;
  const body = bodyLines.join("\n").trim();

  return {
    body,
    characterCount: countChinesePublishingCharacters(body)
  };
}

function countChinesePublishingCharacters(text: string): number {
  return Array.from(text).filter((char) => !/\s/u.test(char)).length;
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test -- tests/server/chapter-parser.test.ts`

Expected: PASS.

---

### Task 3: 文件夹扫描和发布记录读写

**Files:**
- Create: `src/server/file-system.ts`
- Create: `src/server/publish-log.ts`
- Create: `tests/server/publish-log.test.ts`

- [ ] **Step 1: 写发布记录测试**

写入 `tests/server/publish-log.test.ts`：

```ts
import { describe, expect, it } from "vitest";
import { mergeChaptersWithLog, updateChapterStatus } from "../../src/server/publish-log";
import type { Chapter, PublishLog } from "../../src/shared/types";

const chapters: Chapter[] = [
  {
    chapterNumber: 1,
    displayNumber: "001",
    title: "第001章 开局",
    fileName: "第001章 开局.md",
    filePath: "/book/第001章 开局.md",
    body: "正文",
    characterCount: 2,
    status: "pending"
  },
  {
    chapterNumber: 2,
    displayNumber: "002",
    title: "第002章 夜雨",
    fileName: "第002章 夜雨.md",
    filePath: "/book/第002章 夜雨.md",
    body: "正文",
    characterCount: 2,
    status: "pending"
  }
];

describe("publish log", () => {
  it("marks scheduled chapters from existing log", () => {
    const log: PublishLog = {
      bookName: "测试书",
      updatedAt: "2026-06-30T00:00:00.000Z",
      chapters: [
        {
          chapterNumber: 1,
          title: "第001章 开局",
          fileName: "第001章 开局.md",
          characterCount: 2,
          plannedDate: "2026-06-30",
          plannedTime: "09:30",
          status: "scheduled"
        }
      ]
    };

    const result = mergeChaptersWithLog(chapters, log);

    expect(result[0].status).toBe("scheduled");
    expect(result[1].status).toBe("pending");
  });

  it("updates one chapter status without dropping other records", () => {
    const log: PublishLog = {
      bookName: "测试书",
      updatedAt: "2026-06-30T00:00:00.000Z",
      chapters: []
    };

    const result = updateChapterStatus(log, {
      chapterNumber: 2,
      title: "第002章 夜雨",
      fileName: "第002章 夜雨.md",
      characterCount: 2,
      plannedDate: "2026-07-01",
      plannedTime: "12:00",
      submittedAt: "2026-06-30T01:00:00.000Z",
      status: "scheduled"
    });

    expect(result.chapters).toHaveLength(1);
    expect(result.chapters[0].status).toBe("scheduled");
    expect(result.updatedAt).not.toBe(log.updatedAt);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- tests/server/publish-log.test.ts`

Expected: FAIL because `publish-log.ts` does not exist.

- [ ] **Step 3: 实现记录合并和更新**

写入 `src/server/publish-log.ts`：

```ts
import type { Chapter, PublishLog, PublishLogChapter } from "../shared/types";

export function createEmptyPublishLog(bookName: string): PublishLog {
  return {
    bookName,
    updatedAt: new Date().toISOString(),
    chapters: []
  };
}

export function mergeChaptersWithLog(chapters: Chapter[], log: PublishLog | null): Chapter[] {
  if (!log) return chapters;

  const byFileName = new Map(log.chapters.map((chapter) => [chapter.fileName, chapter]));

  return chapters.map((chapter) => {
    const existing = byFileName.get(chapter.fileName);
    if (!existing) return chapter;

    return {
      ...chapter,
      status: existing.status
    };
  });
}

export function updateChapterStatus(log: PublishLog, chapter: PublishLogChapter): PublishLog {
  const chapters = log.chapters.filter((item) => item.fileName !== chapter.fileName);
  chapters.push(chapter);
  chapters.sort((a, b) => a.chapterNumber - b.chapterNumber);

  return {
    ...log,
    updatedAt: new Date().toISOString(),
    chapters
  };
}

export function shouldSkipChapter(status: string): boolean {
  return status === "scheduled";
}
```

- [ ] **Step 4: 实现文件系统读取**

写入 `src/server/file-system.ts`：

```ts
import { promises as fs } from "node:fs";
import path from "node:path";
import { PUBLISH_LOG_FILE } from "../shared/constants";
import type { Chapter, PublishLog } from "../shared/types";
import { parseChapterFileName, parseMarkdownBody } from "./chapter-parser";
import { createEmptyPublishLog, mergeChaptersWithLog } from "./publish-log";

export interface ImportedBook {
  bookName: string;
  folderPath: string;
  totalMarkdownFiles: number;
  recognizedChapters: number;
  hasPublishLog: boolean;
  chapters: Chapter[];
  publishLog: PublishLog;
}

export async function importBookFolder(folderPath: string): Promise<ImportedBook> {
  const entries = await fs.readdir(folderPath, { withFileTypes: true });
  const bookName = path.basename(folderPath);
  const markdownFiles = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => entry.name);

  const publishLog = await readPublishLog(folderPath, bookName);
  const chapters: Chapter[] = [];

  for (const fileName of markdownFiles) {
    const parsedName = parseChapterFileName(fileName);
    if (!parsedName) continue;

    const filePath = path.join(folderPath, fileName);
    const markdown = await fs.readFile(filePath, "utf8");
    const parsedBody = parseMarkdownBody(markdown);

    chapters.push({
      ...parsedName,
      fileName,
      filePath,
      body: parsedBody.body,
      characterCount: parsedBody.characterCount,
      status: "pending"
    });
  }

  chapters.sort((a, b) => a.chapterNumber - b.chapterNumber);
  const mergedChapters = mergeChaptersWithLog(chapters, publishLog.log);

  return {
    bookName,
    folderPath,
    totalMarkdownFiles: markdownFiles.length,
    recognizedChapters: mergedChapters.length,
    hasPublishLog: publishLog.exists,
    chapters: mergedChapters,
    publishLog: publishLog.log ?? createEmptyPublishLog(bookName)
  };
}

export async function readPublishLog(
  folderPath: string,
  bookName: string
): Promise<{ exists: boolean; log: PublishLog | null }> {
  const logPath = path.join(folderPath, PUBLISH_LOG_FILE);

  try {
    const content = await fs.readFile(logPath, "utf8");
    return { exists: true, log: JSON.parse(content) as PublishLog };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { exists: false, log: createEmptyPublishLog(bookName) };
    }
    throw error;
  }
}

export async function writePublishLog(folderPath: string, log: PublishLog): Promise<void> {
  const logPath = path.join(folderPath, PUBLISH_LOG_FILE);
  await fs.writeFile(logPath, `${JSON.stringify(log, null, 2)}\n`, "utf8");
}
```

- [ ] **Step 5: 运行记录测试和类型检查**

Run: `npm test -- tests/server/publish-log.test.ts`

Expected: PASS.

Run: `npm run typecheck`

Expected: PASS.

---

### Task 4: 排期生成和最终预览数据

**Files:**
- Create: `src/server/schedule.ts`
- Create: `tests/server/schedule.test.ts`
- Modify: `src/shared/types.ts`

- [ ] **Step 1: 写排期失败测试**

写入 `tests/server/schedule.test.ts`：

```ts
import { describe, expect, it } from "vitest";
import { generatePublishPlan } from "../../src/server/schedule";
import type { Chapter } from "../../src/shared/types";

function chapter(number: number, status: Chapter["status"] = "pending"): Chapter {
  const displayNumber = String(number).padStart(3, "0");
  return {
    chapterNumber: number,
    displayNumber,
    title: `第${displayNumber}章 测试${number}`,
    fileName: `第${displayNumber}章 测试${number}.md`,
    filePath: `/book/第${displayNumber}章 测试${number}.md`,
    body: "正文",
    characterCount: 2,
    status
  };
}

describe("schedule", () => {
  it("generates four daily publish slots from selected range", () => {
    const plan = generatePublishPlan({
      chapters: [chapter(5), chapter(6), chapter(7), chapter(8), chapter(9)],
      startChapter: 5,
      endChapter: 9,
      startDate: "2026-06-30"
    });

    expect(plan.map((item) => `${item.chapterNumber}:${item.plannedDate} ${item.plannedTime}`)).toEqual([
      "5:2026-06-30 09:30",
      "6:2026-06-30 12:00",
      "7:2026-06-30 19:00",
      "8:2026-06-30 19:05",
      "9:2026-07-01 09:30"
    ]);
  });

  it("skips already scheduled chapters", () => {
    const plan = generatePublishPlan({
      chapters: [chapter(1, "scheduled"), chapter(2), chapter(3)],
      startChapter: 1,
      endChapter: 3,
      startDate: "2026-06-30"
    });

    expect(plan.map((item) => item.chapterNumber)).toEqual([2, 3]);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- tests/server/schedule.test.ts`

Expected: FAIL because `schedule.ts` does not exist.

- [ ] **Step 3: 实现排期生成**

写入 `src/server/schedule.ts`：

```ts
import { DEFAULT_DAILY_TIMES } from "../shared/constants";
import type { Chapter, PublishPlanItem } from "../shared/types";
import { shouldSkipChapter } from "./publish-log";

export interface GeneratePublishPlanInput {
  chapters: Chapter[];
  startChapter: number;
  endChapter: number;
  startDate: string;
}

export function generatePublishPlan(input: GeneratePublishPlanInput): PublishPlanItem[] {
  const selected = input.chapters
    .filter((chapter) => chapter.chapterNumber >= input.startChapter)
    .filter((chapter) => chapter.chapterNumber <= input.endChapter)
    .filter((chapter) => !shouldSkipChapter(chapter.status))
    .sort((a, b) => a.chapterNumber - b.chapterNumber);

  return selected.map((chapter, index) => {
    const dayOffset = Math.floor(index / DEFAULT_DAILY_TIMES.length);
    const time = DEFAULT_DAILY_TIMES[index % DEFAULT_DAILY_TIMES.length];

    return {
      chapterNumber: chapter.chapterNumber,
      title: chapter.title,
      fileName: chapter.fileName,
      characterCount: chapter.characterCount,
      plannedDate: addDays(input.startDate, dayOffset),
      plannedTime: time,
      status: "pending"
    };
  });
}

export function sortPlanForPreview(plan: PublishPlanItem[]): PublishPlanItem[] {
  return [...plan].sort((a, b) => {
    const left = `${a.plannedDate} ${a.plannedTime}`;
    const right = `${b.plannedDate} ${b.plannedTime}`;
    return left.localeCompare(right, "zh-CN");
  });
}

function addDays(date: string, offset: number): string {
  const value = new Date(`${date}T00:00:00.000+08:00`);
  value.setDate(value.getDate() + offset);
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
```

- [ ] **Step 4: 运行排期测试**

Run: `npm test -- tests/server/schedule.test.ts`

Expected: PASS.

---

### Task 5: 后端 API

**Files:**
- Create: `src/server/routes.ts`
- Modify: `src/server/index.ts`
- Create: `tests/server/routes.test.ts`

- [ ] **Step 1: 写 API 测试**

写入 `tests/server/routes.test.ts`：

```ts
import express from "express";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createRoutes } from "../../src/server/routes";

let tempDir: string | null = null;

afterEach(async () => {
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
    tempDir = null;
  }
});

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use("/api", createRoutes());
  return app;
}

async function postJson(app: express.Express, url: string, body: unknown) {
  return new Promise<{ status: number; json: unknown }>((resolve) => {
    const req = {
      method: "POST",
      url,
      headers: { "content-type": "application/json" }
    };
    const res = {
      statusCode: 200,
      headers: {} as Record<string, string>,
      setHeader(key: string, value: string) {
        this.headers[key] = value;
      },
      end(payload: string) {
        resolve({ status: this.statusCode, json: JSON.parse(payload) });
      }
    };
    const stream = app as unknown as (req: unknown, res: unknown) => void;
    const { Readable } = require("node:stream") as typeof import("node:stream");
    const request = Object.assign(Readable.from([JSON.stringify(body)]), req);
    stream(request, res);
  });
}

describe("routes", () => {
  it("imports a folder and generates a plan", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "fanqie-book-"));
    const bookDir = path.join(tempDir, "测试书");
    await import("node:fs/promises").then((fs) => fs.mkdir(bookDir));
    await writeFile(path.join(bookDir, "第001章 开局.md"), "# 第001章 开局\n\n正文一", "utf8");
    await writeFile(path.join(bookDir, "第002章 夜雨.md"), "# 第002章 夜雨\n\n正文二", "utf8");

    const app = makeApp();
    const imported = await postJson(app, "/api/import", { folderPath: bookDir });

    expect(imported.status).toBe(200);
    expect((imported.json as { bookName: string }).bookName).toBe("测试书");

    const plan = await postJson(app, "/api/plan", {
      folderPath: bookDir,
      startChapter: 1,
      endChapter: 2,
      startDate: "2026-06-30"
    });

    expect(plan.status).toBe(200);
    expect((plan.json as { items: unknown[] }).items).toHaveLength(2);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- tests/server/routes.test.ts`

Expected: FAIL because routes do not exist.

- [ ] **Step 3: 实现路由**

写入 `src/server/routes.ts`：

```ts
import { Router } from "express";
import { z } from "zod";
import { importBookFolder } from "./file-system";
import { generatePublishPlan, sortPlanForPreview } from "./schedule";

const importSchema = z.object({
  folderPath: z.string().min(1)
});

const planSchema = z.object({
  folderPath: z.string().min(1),
  startChapter: z.number().int().positive(),
  endChapter: z.number().int().positive(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
});

export function createRoutes(): Router {
  const router = Router();

  router.post("/import", async (req, res, next) => {
    try {
      const input = importSchema.parse(req.body);
      const imported = await importBookFolder(input.folderPath);
      res.json(imported);
    } catch (error) {
      next(error);
    }
  });

  router.post("/plan", async (req, res, next) => {
    try {
      const input = planSchema.parse(req.body);
      const imported = await importBookFolder(input.folderPath);
      const items = generatePublishPlan({
        chapters: imported.chapters,
        startChapter: input.startChapter,
        endChapter: input.endChapter,
        startDate: input.startDate
      });
      res.json({ bookName: imported.bookName, items, previewItems: sortPlanForPreview(items) });
    } catch (error) {
      next(error);
    }
  });

  router.use((error: unknown, _req, res, _next) => {
    const message = error instanceof Error ? error.message : "未知错误";
    res.status(400).json({ error: message });
  });

  return router;
}
```

修改 `src/server/index.ts`：

```ts
import cors from "cors";
import express from "express";
import { createRoutes } from "./routes";

const app = express();
const port = Number(process.env.PORT ?? 3456);

app.use(cors({ origin: "http://127.0.0.1:5173" }));
app.use(express.json({ limit: "10mb" }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.use("/api", createRoutes());

app.listen(port, "127.0.0.1", () => {
  console.log(`Fanqie publish tool API listening on http://127.0.0.1:${port}`);
});
```

- [ ] **Step 4: 运行 API 测试**

Run: `npm test -- tests/server/routes.test.ts`

Expected: PASS.

---

### Task 6: 前端导入、排期、最终确认预览

**Files:**
- Create: `src/client/api.ts`
- Create: `src/client/components/ImportPanel.tsx`
- Create: `src/client/components/RangePanel.tsx`
- Create: `src/client/components/PlanTable.tsx`
- Create: `src/client/components/FinalPreview.tsx`
- Create: `src/client/components/PublishControls.tsx`
- Modify: `src/client/App.tsx`
- Modify: `src/client/styles.css`

- [ ] **Step 1: 创建 API 客户端**

写入 `src/client/api.ts`：

```ts
import type { Chapter, PublishPlanItem } from "../shared/types";

export interface ImportBookResponse {
  bookName: string;
  folderPath: string;
  totalMarkdownFiles: number;
  recognizedChapters: number;
  hasPublishLog: boolean;
  chapters: Chapter[];
}

export interface GeneratePlanResponse {
  bookName: string;
  items: PublishPlanItem[];
  previewItems: PublishPlanItem[];
}

export async function importBook(folderPath: string): Promise<ImportBookResponse> {
  return postJson("/api/import", { folderPath });
}

export async function generatePlan(input: {
  folderPath: string;
  startChapter: number;
  endChapter: number;
  startDate: string;
}): Promise<GeneratePlanResponse> {
  return postJson("/api/plan", input);
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error ?? "请求失败");
  }
  return payload as T;
}
```

- [ ] **Step 2: 创建界面组件**

写入 `src/client/components/ImportPanel.tsx`：

```tsx
import type { ImportBookResponse } from "../api";

interface ImportPanelProps {
  folderPath: string;
  importedBook: ImportBookResponse | null;
  onFolderPathChange: (value: string) => void;
  onImport: () => void;
  error: string | null;
}

export function ImportPanel(props: ImportPanelProps) {
  return (
    <section className="panel">
      <h2>导入小说</h2>
      <div className="inline-form">
        <input
          value={props.folderPath}
          onChange={(event) => props.onFolderPathChange(event.target.value)}
          placeholder="输入小说文件夹路径"
        />
        <button onClick={props.onImport}>导入</button>
      </div>
      {props.error ? <p className="error-text">{props.error}</p> : null}
      {props.importedBook ? (
        <dl className="summary-grid">
          <div><dt>书名</dt><dd>{props.importedBook.bookName}</dd></div>
          <div><dt>Markdown 文件</dt><dd>{props.importedBook.totalMarkdownFiles}</dd></div>
          <div><dt>识别章节</dt><dd>{props.importedBook.recognizedChapters}</dd></div>
          <div><dt>发布记录</dt><dd>{props.importedBook.hasPublishLog ? "已读取" : "未创建"}</dd></div>
        </dl>
      ) : null}
    </section>
  );
}
```

写入 `src/client/components/RangePanel.tsx`：

```tsx
interface RangePanelProps {
  startChapter: string;
  endChapter: string;
  startDate: string;
  onStartChapterChange: (value: string) => void;
  onEndChapterChange: (value: string) => void;
  onStartDateChange: (value: string) => void;
  onGenerate: () => void;
}

export function RangePanel(props: RangePanelProps) {
  return (
    <section className="panel">
      <h2>章节范围和开始日期</h2>
      <div className="grid-form">
        <label>
          起始章节
          <input value={props.startChapter} onChange={(event) => props.onStartChapterChange(event.target.value)} />
        </label>
        <label>
          结束章节
          <input value={props.endChapter} onChange={(event) => props.onEndChapterChange(event.target.value)} />
        </label>
        <label>
          开始日期
          <input type="date" value={props.startDate} onChange={(event) => props.onStartDateChange(event.target.value)} />
        </label>
      </div>
      <button onClick={props.onGenerate}>生成计划</button>
    </section>
  );
}
```

写入 `src/client/components/PlanTable.tsx`：

```tsx
import type { PublishPlanItem } from "../../shared/types";

interface PlanTableProps {
  items: PublishPlanItem[];
  onChange: (items: PublishPlanItem[]) => void;
}

export function PlanTable({ items, onChange }: PlanTableProps) {
  function updateItem(index: number, patch: Partial<PublishPlanItem>) {
    onChange(items.map((item, currentIndex) => (currentIndex === index ? { ...item, ...patch } : item)));
  }

  return (
    <section className="panel">
      <h2>发布计划</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>章节</th>
              <th>标题</th>
              <th>字数</th>
              <th>日期</th>
              <th>时间</th>
              <th>状态</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => (
              <tr key={item.fileName}>
                <td>第{item.chapterNumber}章</td>
                <td>{item.title}</td>
                <td>{item.characterCount}</td>
                <td>
                  <input type="date" value={item.plannedDate} onChange={(event) => updateItem(index, { plannedDate: event.target.value })} />
                </td>
                <td>
                  <input type="time" value={item.plannedTime} onChange={(event) => updateItem(index, { plannedTime: event.target.value })} />
                </td>
                <td>{item.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
```

写入 `src/client/components/FinalPreview.tsx`：

```tsx
import type { PublishPlanItem } from "../../shared/types";

interface FinalPreviewProps {
  items: PublishPlanItem[];
  visible: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function FinalPreview({ items, visible, onConfirm, onCancel }: FinalPreviewProps) {
  if (!visible) return null;

  const sorted = [...items].sort((a, b) => `${a.plannedDate} ${a.plannedTime}`.localeCompare(`${b.plannedDate} ${b.plannedTime}`));

  return (
    <div className="modal-backdrop">
      <section className="modal">
        <h2>确认发布计划</h2>
        <p>请确认每一章的发布日期和时间。确认后工具才会开始自动提交。</p>
        <div className="table-wrap preview-table">
          <table>
            <thead>
              <tr>
                <th>章节</th>
                <th>标题</th>
                <th>发布时间</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((item) => (
                <tr key={item.fileName}>
                  <td>第{item.chapterNumber}章</td>
                  <td>{item.title}</td>
                  <td>{item.plannedDate} {item.plannedTime}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="modal-actions">
          <button className="secondary" onClick={onCancel}>返回修改</button>
          <button onClick={onConfirm}>确认并开始</button>
        </div>
      </section>
    </div>
  );
}
```

写入 `src/client/components/PublishControls.tsx`：

```tsx
interface PublishControlsProps {
  canStart: boolean;
  onOpenPreview: () => void;
}

export function PublishControls({ canStart, onOpenPreview }: PublishControlsProps) {
  return (
    <section className="panel controls">
      <h2>发布控制</h2>
      <button disabled={!canStart} onClick={onOpenPreview}>开始发布</button>
      <button disabled>暂停</button>
      <button disabled>继续</button>
      <button disabled>停止</button>
    </section>
  );
}
```

- [ ] **Step 3: 编排 App 状态**

修改 `src/client/App.tsx`：

```tsx
import { useMemo, useState } from "react";
import type { PublishPlanItem } from "../shared/types";
import { generatePlan, importBook, type ImportBookResponse } from "./api";
import { FinalPreview } from "./components/FinalPreview";
import { ImportPanel } from "./components/ImportPanel";
import { PlanTable } from "./components/PlanTable";
import { PublishControls } from "./components/PublishControls";
import { RangePanel } from "./components/RangePanel";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function App() {
  const [folderPath, setFolderPath] = useState("");
  const [book, setBook] = useState<ImportBookResponse | null>(null);
  const [startChapter, setStartChapter] = useState("");
  const [endChapter, setEndChapter] = useState("");
  const [startDate, setStartDate] = useState(today());
  const [planItems, setPlanItems] = useState<PublishPlanItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  const canStart = useMemo(() => planItems.length > 0, [planItems.length]);

  async function handleImport() {
    setError(null);
    try {
      const imported = await importBook(folderPath);
      setBook(imported);
      setStartChapter(imported.chapters[0]?.chapterNumber.toString() ?? "");
      setEndChapter(imported.chapters.at(-1)?.chapterNumber.toString() ?? "");
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : "导入失败");
    }
  }

  async function handleGeneratePlan() {
    if (!book) return;
    setError(null);
    try {
      const result = await generatePlan({
        folderPath: book.folderPath,
        startChapter: Number(startChapter),
        endChapter: Number(endChapter),
        startDate
      });
      setPlanItems(result.items);
    } catch (planError) {
      setError(planError instanceof Error ? planError.message : "生成计划失败");
    }
  }

  function handleConfirmPreview() {
    setPreviewOpen(false);
    setError("自动发布将在后续任务接入。当前已经完成最终预览确认流程。");
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <h1>番茄章节发布工具</h1>
          <p>导入 Markdown 章节，生成排期，并提交到番茄定时发布。</p>
        </div>
      </header>
      <div className="content-grid">
        <ImportPanel folderPath={folderPath} importedBook={book} onFolderPathChange={setFolderPath} onImport={handleImport} error={error} />
        <RangePanel
          startChapter={startChapter}
          endChapter={endChapter}
          startDate={startDate}
          onStartChapterChange={setStartChapter}
          onEndChapterChange={setEndChapter}
          onStartDateChange={setStartDate}
          onGenerate={handleGeneratePlan}
        />
        <PlanTable items={planItems} onChange={setPlanItems} />
        <PublishControls canStart={canStart} onOpenPreview={() => setPreviewOpen(true)} />
      </div>
      <FinalPreview items={planItems} visible={previewOpen} onCancel={() => setPreviewOpen(false)} onConfirm={handleConfirmPreview} />
    </main>
  );
}
```

- [ ] **Step 4: 完成样式**

追加到 `src/client/styles.css`：

```css
.content-grid {
  display: grid;
  gap: 16px;
  max-width: 1180px;
  margin: 0 auto;
}

.panel {
  background: white;
  border: 1px solid #d8dee4;
  border-radius: 8px;
  padding: 18px;
}

.panel h2 {
  margin: 0 0 14px;
  font-size: 18px;
}

.inline-form,
.grid-form {
  display: grid;
  gap: 12px;
}

.inline-form {
  grid-template-columns: 1fr auto;
}

.grid-form {
  grid-template-columns: repeat(3, minmax(0, 1fr));
  margin-bottom: 12px;
}

label {
  display: grid;
  gap: 6px;
  color: #57606a;
  font-size: 13px;
}

input {
  width: 100%;
  border: 1px solid #d0d7de;
  border-radius: 6px;
  padding: 9px 10px;
  font: inherit;
}

button {
  border: 0;
  border-radius: 6px;
  background: #fb6a2a;
  color: white;
  cursor: pointer;
  font: inherit;
  padding: 9px 14px;
}

button:disabled {
  background: #c9d1d9;
  cursor: not-allowed;
}

button.secondary {
  background: #f0f2f4;
  color: #24292f;
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
  margin: 14px 0 0;
}

.summary-grid div {
  border: 1px solid #d8dee4;
  border-radius: 6px;
  padding: 10px;
}

.summary-grid dt {
  color: #57606a;
  font-size: 12px;
}

.summary-grid dd {
  margin: 4px 0 0;
  font-weight: 600;
}

.table-wrap {
  overflow: auto;
}

table {
  width: 100%;
  border-collapse: collapse;
}

th,
td {
  border-bottom: 1px solid #d8dee4;
  padding: 10px;
  text-align: left;
  vertical-align: middle;
}

th {
  color: #57606a;
  font-size: 13px;
  font-weight: 600;
}

.controls {
  display: flex;
  align-items: center;
  gap: 10px;
}

.controls h2 {
  margin-right: auto;
  margin-bottom: 0;
}

.error-text {
  color: #cf222e;
}

.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(31, 35, 40, 0.45);
  display: grid;
  place-items: center;
  padding: 20px;
}

.modal {
  width: min(920px, 100%);
  max-height: 86vh;
  overflow: auto;
  background: white;
  border-radius: 8px;
  padding: 20px;
}

.preview-table {
  max-height: 55vh;
  border: 1px solid #d8dee4;
  border-radius: 6px;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 16px;
}
```

- [ ] **Step 5: 验证前端类型**

Run: `npm run typecheck`

Expected: PASS.

---

### Task 7: 自动化发布骨架和暂停状态

**Files:**
- Create: `src/server/automation/publisher.ts`
- Create: `src/server/automation/fanqie-page.ts`
- Modify: `src/server/routes.ts`
- Modify: `src/client/api.ts`
- Modify: `src/client/App.tsx`
- Modify: `src/client/components/PublishControls.tsx`

- [ ] **Step 1: 实现自动化接口骨架**

写入 `src/server/automation/fanqie-page.ts`：

```ts
import type { Page } from "playwright";

export interface FanqieChapterSubmission {
  bookName: string;
  title: string;
  body: string;
  plannedDate: string;
  plannedTime: string;
}

export class FanqiePage {
  constructor(private readonly page: Page) {}

  async submitTimedChapter(_submission: FanqieChapterSubmission): Promise<void> {
    throw new Error("番茄页面自动化尚未接入真实选择器。请先完成登录和页面结构验证。");
  }
}
```

写入 `src/server/automation/publisher.ts`：

```ts
import path from "node:path";
import { chromium, type BrowserContext } from "playwright";
import type { PublishPlanItem } from "../../shared/types";

export type PublishRunStatus = "idle" | "running" | "paused" | "stopped";

export interface PublishRunState {
  status: PublishRunStatus;
  currentChapter?: number;
  message?: string;
}

export interface StartPublishInput {
  bookName: string;
  folderPath: string;
  items: PublishPlanItem[];
}

let state: PublishRunState = { status: "idle" };
let context: BrowserContext | null = null;

export function getPublishState(): PublishRunState {
  return state;
}

export async function startPublishRun(input: StartPublishInput): Promise<PublishRunState> {
  if (state.status === "running") {
    return state;
  }

  state = {
    status: "paused",
    currentChapter: input.items[0]?.chapterNumber,
    message: "自动化骨架已启动。下一步需要接入番茄真实页面选择器。"
  };

  const profileDir = path.join(input.folderPath, ".fanqie-browser-profile");
  context = await chromium.launchPersistentContext(profileDir, {
    headless: false,
    viewport: { width: 1400, height: 900 }
  });
  const page = context.pages()[0] ?? (await context.newPage());
  await page.goto("https://fanqienovel.com/main/writer/book-manage", { waitUntil: "domcontentloaded" });

  return state;
}

export async function stopPublishRun(): Promise<PublishRunState> {
  await context?.close();
  context = null;
  state = { status: "stopped", message: "已停止发布任务。" };
  return state;
}
```

- [ ] **Step 2: 增加发布 API**

修改 `src/server/routes.ts`，增加 import：

```ts
import { getPublishState, startPublishRun, stopPublishRun } from "./automation/publisher";
```

在 `createRoutes()` 里增加路由，放在 error handler 之前：

```ts
  router.get("/publish/state", (_req, res) => {
    res.json(getPublishState());
  });

  router.post("/publish/start", async (req, res, next) => {
    try {
      const input = z.object({
        bookName: z.string().min(1),
        folderPath: z.string().min(1),
        items: z.array(z.object({
          chapterNumber: z.number(),
          title: z.string(),
          fileName: z.string(),
          characterCount: z.number(),
          plannedDate: z.string(),
          plannedTime: z.string(),
          status: z.enum(["pending", "scheduled", "failed", "skipped"]),
          failureReason: z.string().optional()
        }))
      }).parse(req.body);

      res.json(await startPublishRun(input));
    } catch (error) {
      next(error);
    }
  });

  router.post("/publish/stop", async (_req, res, next) => {
    try {
      res.json(await stopPublishRun());
    } catch (error) {
      next(error);
    }
  });
```

- [ ] **Step 3: 前端接入发布启动**

修改 `src/client/api.ts`，追加：

```ts
export interface PublishRunState {
  status: "idle" | "running" | "paused" | "stopped";
  currentChapter?: number;
  message?: string;
}

export async function startPublish(input: {
  bookName: string;
  folderPath: string;
  items: PublishPlanItem[];
}): Promise<PublishRunState> {
  return postJson("/api/publish/start", input);
}

export async function stopPublish(): Promise<PublishRunState> {
  return postJson("/api/publish/stop", {});
}
```

修改 `src/client/components/PublishControls.tsx`：

```tsx
interface PublishControlsProps {
  canStart: boolean;
  statusText: string;
  onOpenPreview: () => void;
  onStop: () => void;
}

export function PublishControls({ canStart, statusText, onOpenPreview, onStop }: PublishControlsProps) {
  return (
    <section className="panel controls">
      <h2>发布控制</h2>
      <span className="status-pill">{statusText}</span>
      <button disabled={!canStart} onClick={onOpenPreview}>开始发布</button>
      <button disabled>暂停</button>
      <button disabled>继续</button>
      <button onClick={onStop}>停止</button>
    </section>
  );
}
```

修改 `src/client/App.tsx`：

```tsx
import { useMemo, useState } from "react";
import type { PublishPlanItem } from "../shared/types";
import { generatePlan, importBook, startPublish, stopPublish, type ImportBookResponse, type PublishRunState } from "./api";
import { FinalPreview } from "./components/FinalPreview";
import { ImportPanel } from "./components/ImportPanel";
import { PlanTable } from "./components/PlanTable";
import { PublishControls } from "./components/PublishControls";
import { RangePanel } from "./components/RangePanel";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function App() {
  const [folderPath, setFolderPath] = useState("");
  const [book, setBook] = useState<ImportBookResponse | null>(null);
  const [startChapter, setStartChapter] = useState("");
  const [endChapter, setEndChapter] = useState("");
  const [startDate, setStartDate] = useState(today());
  const [planItems, setPlanItems] = useState<PublishPlanItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [publishState, setPublishState] = useState<PublishRunState>({ status: "idle" });

  const canStart = useMemo(() => Boolean(book && planItems.length > 0), [book, planItems.length]);

  async function handleImport() {
    setError(null);
    try {
      const imported = await importBook(folderPath);
      setBook(imported);
      setStartChapter(imported.chapters[0]?.chapterNumber.toString() ?? "");
      setEndChapter(imported.chapters.at(-1)?.chapterNumber.toString() ?? "");
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : "导入失败");
    }
  }

  async function handleGeneratePlan() {
    if (!book) return;
    setError(null);
    try {
      const result = await generatePlan({
        folderPath: book.folderPath,
        startChapter: Number(startChapter),
        endChapter: Number(endChapter),
        startDate
      });
      setPlanItems(result.items);
    } catch (planError) {
      setError(planError instanceof Error ? planError.message : "生成计划失败");
    }
  }

  async function handleConfirmPreview() {
    if (!book) return;
    setPreviewOpen(false);
    const state = await startPublish({ bookName: book.bookName, folderPath: book.folderPath, items: planItems });
    setPublishState(state);
    setError(state.message ?? null);
  }

  async function handleStop() {
    const state = await stopPublish();
    setPublishState(state);
    setError(state.message ?? null);
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <h1>番茄章节发布工具</h1>
          <p>导入 Markdown 章节，生成排期，并提交到番茄定时发布。</p>
        </div>
      </header>
      <div className="content-grid">
        <ImportPanel folderPath={folderPath} importedBook={book} onFolderPathChange={setFolderPath} onImport={handleImport} error={error} />
        <RangePanel
          startChapter={startChapter}
          endChapter={endChapter}
          startDate={startDate}
          onStartChapterChange={setStartChapter}
          onEndChapterChange={setEndChapter}
          onStartDateChange={setStartDate}
          onGenerate={handleGeneratePlan}
        />
        <PlanTable items={planItems} onChange={setPlanItems} />
        <PublishControls canStart={canStart} statusText={publishState.status} onOpenPreview={() => setPreviewOpen(true)} onStop={handleStop} />
      </div>
      <FinalPreview items={planItems} visible={previewOpen} onCancel={() => setPreviewOpen(false)} onConfirm={handleConfirmPreview} />
    </main>
  );
}
```

追加到 `src/client/styles.css`：

```css
.status-pill {
  border: 1px solid #d8dee4;
  border-radius: 999px;
  color: #57606a;
  padding: 6px 10px;
}
```

- [ ] **Step 4: 运行类型检查**

Run: `npm run typecheck`

Expected: PASS.

---

### Task 8: 真实番茄页面适配和端到端试运行

**Files:**
- Modify: `src/server/automation/fanqie-page.ts`
- Modify: `src/server/automation/publisher.ts`
- Modify: `src/server/file-system.ts`
- Modify: `src/server/publish-log.ts`

- [ ] **Step 1: 手动探索番茄后台页面**

Run: `npm run dev`

Open a second terminal and run: `npm run dev:web`

在工具里使用一本测试小说文件夹生成 1 章计划。点击“开始发布”，登录番茄作者后台。人工观察以下元素的稳定定位方式：

```text
书籍列表入口
目标书名
新增章节入口
章节标题输入框
正文编辑器
下一步按钮
是否使用 AI 选项
定时发布开关
日期输入控件
时间输入控件
确认发布按钮
成功提示
失败提示
```

Expected: 记录每个元素可用的 `data-*`、文本、role、placeholder 或 CSS 定位策略。

- [ ] **Step 2: 实现 FanqiePage 页面动作**

用真实定位策略替换 `src/server/automation/fanqie-page.ts`。实现形状必须保持：

```ts
import type { Page } from "playwright";

export interface FanqieChapterSubmission {
  bookName: string;
  title: string;
  body: string;
  plannedDate: string;
  plannedTime: string;
}

export class FanqiePage {
  constructor(private readonly page: Page) {}

  async submitTimedChapter(submission: FanqieChapterSubmission): Promise<void> {
    await this.openAuthorCenter();
    await this.openBook(submission.bookName);
    await this.openNewChapterPage();
    await this.fillTitle(submission.title);
    await this.fillBody(submission.body);
    await this.goNext();
    await this.configureTimedPublish(submission.plannedDate, submission.plannedTime);
    await this.confirmPublish();
    await this.waitForSuccess();
  }

  private async openAuthorCenter(): Promise<void> {
    await this.page.goto("https://fanqienovel.com/main/writer/book-manage", { waitUntil: "domcontentloaded" });
  }

  private async openBook(bookName: string): Promise<void> {
    await this.page.getByText(bookName, { exact: true }).click();
  }

  private async openNewChapterPage(): Promise<void> {
    await this.page.getByText("新建章节", { exact: false }).click();
  }

  private async fillTitle(title: string): Promise<void> {
    await this.page.getByPlaceholder("请输入章节标题", { exact: false }).fill(title);
  }

  private async fillBody(body: string): Promise<void> {
    const editor = this.page.locator("[contenteditable='true']");
    await editor.click();
    await editor.fill(body);
  }

  private async goNext(): Promise<void> {
    await this.page.getByText("下一步", { exact: true }).click();
  }

  private async configureTimedPublish(date: string, time: string): Promise<void> {
    await this.page.getByText("定时发布", { exact: false }).click();
    await this.page.getByPlaceholder("日期", { exact: false }).fill(date);
    await this.page.getByPlaceholder("时间", { exact: false }).fill(time);
  }

  private async confirmPublish(): Promise<void> {
    await this.page.getByText("确认发布", { exact: true }).click();
  }

  private async waitForSuccess(): Promise<void> {
    await this.page.getByText("成功", { exact: false }).waitFor({ state: "visible", timeout: 15000 });
  }
}
```

调整说明：上面代码是占位形状，执行时必须用 Step 1 观察到的真实定位替换。每个动作失败时抛出包含当前动作名称的错误，例如 `throw new Error("找不到章节标题输入框")`。

- [ ] **Step 3: 串接逐章发布和记录写入**

修改 `src/server/automation/publisher.ts`，核心逻辑变成：

```ts
import path from "node:path";
import { chromium, type BrowserContext } from "playwright";
import type { PublishPlanItem } from "../../shared/types";
import { importBookFolder, writePublishLog } from "../file-system";
import { updateChapterStatus } from "../publish-log";
import { FanqiePage } from "./fanqie-page";

export type PublishRunStatus = "idle" | "running" | "paused" | "stopped";

export interface PublishRunState {
  status: PublishRunStatus;
  currentChapter?: number;
  message?: string;
}

export interface StartPublishInput {
  bookName: string;
  folderPath: string;
  items: PublishPlanItem[];
}

let state: PublishRunState = { status: "idle" };
let context: BrowserContext | null = null;

export function getPublishState(): PublishRunState {
  return state;
}

export async function startPublishRun(input: StartPublishInput): Promise<PublishRunState> {
  if (state.status === "running") return state;

  const profileDir = path.join(input.folderPath, ".fanqie-browser-profile");
  context = await chromium.launchPersistentContext(profileDir, {
    headless: false,
    viewport: { width: 1400, height: 900 }
  });
  const page = context.pages()[0] ?? (await context.newPage());
  const fanqie = new FanqiePage(page);

  state = { status: "running", message: "正在发布。" };

  for (const item of input.items) {
    state = { status: "running", currentChapter: item.chapterNumber, message: `正在提交 ${item.title}` };
    const imported = await importBookFolder(input.folderPath);
    const chapter = imported.chapters.find((value) => value.fileName === item.fileName);
    if (!chapter) {
      state = { status: "paused", currentChapter: item.chapterNumber, message: `找不到章节文件：${item.fileName}` };
      return state;
    }

    try {
      await fanqie.submitTimedChapter({
        bookName: input.bookName,
        title: chapter.title,
        body: chapter.body,
        plannedDate: item.plannedDate,
        plannedTime: item.plannedTime
      });

      const nextLog = updateChapterStatus(imported.publishLog, {
        chapterNumber: chapter.chapterNumber,
        title: chapter.title,
        fileName: chapter.fileName,
        characterCount: chapter.characterCount,
        plannedDate: item.plannedDate,
        plannedTime: item.plannedTime,
        submittedAt: new Date().toISOString(),
        status: "scheduled"
      });
      await writePublishLog(input.folderPath, nextLog);
    } catch (error) {
      const message = error instanceof Error ? error.message : "发布失败";
      const failedLog = updateChapterStatus(imported.publishLog, {
        chapterNumber: chapter.chapterNumber,
        title: chapter.title,
        fileName: chapter.fileName,
        characterCount: chapter.characterCount,
        plannedDate: item.plannedDate,
        plannedTime: item.plannedTime,
        status: "failed",
        failureReason: message
      });
      await writePublishLog(input.folderPath, failedLog);
      state = { status: "paused", currentChapter: item.chapterNumber, message };
      return state;
    }
  }

  state = { status: "idle", message: "发布计划已提交完成。" };
  return state;
}

export async function stopPublishRun(): Promise<PublishRunState> {
  await context?.close();
  context = null;
  state = { status: "stopped", message: "已停止发布任务。" };
  return state;
}
```

- [ ] **Step 4: 小范围真实试运行**

准备一本测试书，只选 1 章，开始日期选今天，时间改到未来可接受时间。

Run: `npm run dev`

Run in another terminal: `npm run dev:web`

操作：

```text
1. 导入测试小说文件夹。
2. 起始章节和结束章节都填同一章。
3. 生成计划。
4. 打开最终确认预览。
5. 确认章节、日期、时间无误。
6. 点击确认并开始。
7. 等待工具打开独立浏览器并提交。
8. 检查 `.fanqie-publish.json`。
```

Expected:

```json
{
  "status": "scheduled",
  "plannedDate": "用户选择的日期",
  "plannedTime": "用户选择的时间"
}
```

- [ ] **Step 5: 失败恢复试运行**

人工制造一个失败：发布前把目标书名改成不存在的名字，或临时断开登录状态。

Expected:

```text
工具暂停。
当前章写入 failed。
failureReason 有可读原因。
后续章节没有继续提交。
```

---

## 自查结果

- 规格覆盖：本计划覆盖导入 Markdown、文件夹名作为书名、章节范围、默认排期、手动改时间、最终确认预览、发布记录、跳过已定时章节、独立浏览器、异常暂停和第一版范围边界。
- 范围控制：真实番茄页面选择器放在最后一个任务中接入，前面先完成可测试的本地工具闭环。
- 主要风险：`routes.test.ts` 用轻量 Express 调用方式，若运行环境不兼容，应替换为 `supertest` 并更新 `package.json`。番茄真实页面选择器必须在登录后的页面上确认，不能靠猜。
