import { DEFAULT_DAILY_TIMES } from "../shared/constants";
import type { Chapter, PublishPlanItem } from "../shared/types";
import { shouldSkipChapter } from "./publish-log";

export interface GeneratePublishPlanInput {
  chapters: Chapter[];
  startChapter: number;
  endChapter: number;
  startDate: string;
  dailyTimes?: string[];
}

export function generatePublishPlan(input: GeneratePublishPlanInput): PublishPlanItem[] {
  const selected = input.chapters
    .filter((chapter) => chapter.chapterNumber >= input.startChapter)
    .filter((chapter) => chapter.chapterNumber <= input.endChapter)
    .filter((chapter) => !shouldSkipChapter(chapter.status))
    .sort((a, b) => a.chapterNumber - b.chapterNumber);

  const dailyTimes = input.dailyTimes?.length ? input.dailyTimes : [...DEFAULT_DAILY_TIMES];

  return selected.map((chapter, index) => {
    const dayOffset = Math.floor(index / dailyTimes.length);
    const time = dailyTimes[index % dailyTimes.length];

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
  const [year, month, day] = date.split("-").map(Number);
  const value = new Date(Date.UTC(year, month - 1, day + offset));
  const nextYear = value.getUTCFullYear();
  const nextMonth = String(value.getUTCMonth() + 1).padStart(2, "0");
  const nextDay = String(value.getUTCDate()).padStart(2, "0");
  return `${nextYear}-${nextMonth}-${nextDay}`;
}
