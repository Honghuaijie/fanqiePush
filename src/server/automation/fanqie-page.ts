export interface FanqieChapterSubmission {
  bookName: string;
  title: string;
  body: string;
  plannedDate: string;
  plannedTime: string;
}

export class FanqiePage {
  async submitTimedChapter(_submission: FanqieChapterSubmission): Promise<void> {
    throw new Error("番茄页面自动化尚未接入真实选择器。");
  }
}
