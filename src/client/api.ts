import type { Chapter, PublishPlanItem } from "../shared/types";

export interface ImportBookResponse {
  bookName: string;
  folderPath: string;
  totalMarkdownFiles: number;
  recognizedChapters: number;
  autoNumberedChapters: number;
  warnings: string[];
  hasPublishLog: boolean;
  chapters: Chapter[];
}

export interface GeneratePlanResponse {
  bookName: string;
  items: PublishPlanItem[];
  previewItems: PublishPlanItem[];
}

export async function importBook(folderPath: string, chapterFileNamePattern?: string): Promise<ImportBookResponse> {
  return postJson("/api/import", { folderPath, chapterFileNamePattern });
}

export async function generatePlan(input: {
  folderPath: string;
  startChapter: number;
  endChapter: number;
  startDate: string;
  dailyTimes: string[];
}): Promise<GeneratePlanResponse> {
  return postJson("/api/plan", input);
}

export interface PublishRunState {
  status: "idle" | "running" | "paused" | "waiting-login" | "stopped";
  currentChapter?: number;
  message?: string;
  logs?: PublishRunLogEntry[];
}

export interface PublishRunLogEntry {
  time: string;
  level: "info" | "success" | "warning" | "error";
  message: string;
}

export class ApiRequestError extends Error {
  state?: PublishRunState;

  constructor(message: string, state?: PublishRunState) {
    super(message);
    this.name = "ApiRequestError";
    this.state = state;
  }
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

export async function continuePublish(): Promise<PublishRunState> {
  return postJson("/api/publish/continue", {});
}

export async function saveCurrentDraft(): Promise<PublishRunState> {
  return postJson("/api/publish/save-current-draft", {});
}

export async function scheduleCurrentChapter(): Promise<PublishRunState> {
  return postJson("/api/publish/schedule-current", {});
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new ApiRequestError(payload.error ?? "请求失败", payload.state);
  }
  return payload as T;
}
