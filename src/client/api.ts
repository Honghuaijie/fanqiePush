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
  dailyTimes: string[];
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
