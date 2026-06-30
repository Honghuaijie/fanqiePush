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
