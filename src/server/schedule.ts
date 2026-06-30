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
  const value = new Date(`${date}T00:00:00.000+08:00`);
  value.setDate(value.getDate() + offset);
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
