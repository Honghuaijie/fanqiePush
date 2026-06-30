import { z } from "zod";
import { importBookFolder, type ImportedBook } from "./file-system";
import { generatePublishPlan, sortPlanForPreview } from "./schedule";
import type { PublishPlanItem } from "../shared/types";

const importSchema = z.object({
  folderPath: z.string().min(1)
});

const planSchema = z.object({
  folderPath: z.string().min(1),
  startChapter: z.number().int().positive(),
  endChapter: z.number().int().positive(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dailyTimes: z.array(z.string().regex(/^\d{2}:\d{2}$/)).min(1).optional()
});

export interface GeneratePlanResponse {
  bookName: string;
  items: PublishPlanItem[];
  previewItems: PublishPlanItem[];
}

export async function handleImportBook(input: unknown): Promise<ImportedBook> {
  const parsed = importSchema.parse(input);
  return importBookFolder(parsed.folderPath);
}

export async function handleGeneratePlan(input: unknown): Promise<GeneratePlanResponse> {
  const parsed = planSchema.parse(input);
  const imported = await importBookFolder(parsed.folderPath);
  const items = generatePublishPlan({
    chapters: imported.chapters,
    startChapter: parsed.startChapter,
    endChapter: parsed.endChapter,
    startDate: parsed.startDate,
    dailyTimes: parsed.dailyTimes
  });

  return {
    bookName: imported.bookName,
    items,
    previewItems: sortPlanForPreview(items)
  };
}
