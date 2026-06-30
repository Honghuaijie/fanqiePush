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

const DEFAULT_DAILY_TIMES = ["09:30", "12:00", "19:00", "19:05"];

export function App() {
  const [folderPath, setFolderPath] = useState("");
  const [book, setBook] = useState<ImportBookResponse | null>(null);
  const [startChapter, setStartChapter] = useState("");
  const [endChapter, setEndChapter] = useState("");
  const [startDate, setStartDate] = useState(today());
  const [dailyTimes, setDailyTimes] = useState(DEFAULT_DAILY_TIMES);
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
        startDate,
        dailyTimes
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
          dailyTimes={dailyTimes}
          onStartChapterChange={setStartChapter}
          onEndChapterChange={setEndChapter}
          onStartDateChange={setStartDate}
          onDailyTimesChange={setDailyTimes}
          onGenerate={handleGeneratePlan}
        />
        <PlanTable items={planItems} onChange={setPlanItems} />
        <PublishControls canStart={canStart} onOpenPreview={() => setPreviewOpen(true)} />
      </div>
      <FinalPreview items={planItems} visible={previewOpen} onCancel={() => setPreviewOpen(false)} onConfirm={handleConfirmPreview} />
    </main>
  );
}
