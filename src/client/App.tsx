import { useMemo, useState } from "react";
import type { PublishPlanItem } from "../shared/types";
import { continuePublish, generatePlan, importBook, scheduleCurrentChapter, startPublish, stopPublish, type ImportBookResponse, type PublishRunState } from "./api";
import { FinalPreview } from "./components/FinalPreview";
import { ImportPanel } from "./components/ImportPanel";
import { PlanTable } from "./components/PlanTable";
import { PublishFlowGuide } from "./components/PublishFlowGuide";
import { PublishControls } from "./components/PublishControls";
import { RangePanel } from "./components/RangePanel";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

const DEFAULT_DAILY_TIMES = ["09:30", "12:00", "19:00", "19:05"];

export function App() {
  const [folderPath, setFolderPath] = useState("");
  const [chapterFileNamePattern, setChapterFileNamePattern] = useState("");
  const [book, setBook] = useState<ImportBookResponse | null>(null);
  const [startChapter, setStartChapter] = useState("");
  const [endChapter, setEndChapter] = useState("");
  const [startDate, setStartDate] = useState(today());
  const [dailyTimes, setDailyTimes] = useState(DEFAULT_DAILY_TIMES);
  const [planItems, setPlanItems] = useState<PublishPlanItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [flowGuideOpen, setFlowGuideOpen] = useState(false);
  const [publishState, setPublishState] = useState<PublishRunState>({ status: "idle" });

  const canStart = useMemo(() => planItems.length > 0, [planItems.length]);

  async function handleImport() {
    setError(null);
    try {
      const imported = await importBook(folderPath, chapterFileNamePattern.trim() || undefined);
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

  async function handleConfirmPreview() {
    if (!book) return;
    setPreviewOpen(false);
    setError(null);
    setPublishState({ status: "running", currentChapter: planItems[0]?.chapterNumber, message: "正在打开番茄章节编辑器..." });
    try {
      const openedState = await startPublish({ bookName: book.bookName, folderPath: book.folderPath, items: planItems });
      if (openedState.status === "waiting-login") {
        setPublishState(openedState);
        setError(null);
        return;
      }

      setPublishState({
        ...openedState,
        status: "running",
        message: "已打开章节编辑器，正在提交当前章定时发布..."
      });
      const scheduledState = await scheduleCurrentChapter();
      setPublishState(scheduledState);
      setError(scheduledState.message ?? null);
    } catch (publishError) {
      const message = publishError instanceof Error ? publishError.message : "启动发布失败";
      setPublishState({ status: "stopped", message });
      setError(message);
    }
  }

  async function handleContinuePublish() {
    setError(null);
    setPublishState((current) => ({ ...current, status: "running", message: "正在确认登录状态并继续发布..." }));
    try {
      const continuedState = await continuePublish();
      if (continuedState.status === "waiting-login") {
        setPublishState(continuedState);
        return;
      }

      setPublishState({
        ...continuedState,
        status: "running",
        message: "已打开章节编辑器，正在提交当前章定时发布..."
      });
      const scheduledState = await scheduleCurrentChapter();
      setPublishState(scheduledState);
      setError(scheduledState.message ?? null);
    } catch (continueError) {
      const message = continueError instanceof Error ? continueError.message : "继续发布失败";
      setPublishState({ status: "stopped", message });
      setError(message);
    }
  }

  async function handleStopPublish() {
    try {
      const state = await stopPublish();
      setPublishState(state);
      setError(state.message ?? null);
    } catch (stopError) {
      setError(stopError instanceof Error ? stopError.message : "停止发布失败");
    }
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <h1>番茄章节发布工具</h1>
          <p>导入 Markdown 章节，生成排期，并提交到番茄定时发布。</p>
        </div>
        <button className="secondary" onClick={() => setFlowGuideOpen(true)}>查看发布流程</button>
      </header>
      <div className="content-grid">
        <ImportPanel
          folderPath={folderPath}
          chapterFileNamePattern={chapterFileNamePattern}
          importedBook={book}
          onFolderPathChange={setFolderPath}
          onChapterFileNamePatternChange={setChapterFileNamePattern}
          onImport={handleImport}
          error={error}
        />
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
        <PublishControls
          canStart={canStart}
          statusText={publishState.status}
          currentChapter={publishState.currentChapter}
          message={publishState.message}
          onOpenPreview={() => setPreviewOpen(true)}
          onContinue={handleContinuePublish}
          onStop={handleStopPublish}
        />
      </div>
      <FinalPreview items={planItems} visible={previewOpen} onCancel={() => setPreviewOpen(false)} onConfirm={handleConfirmPreview} />
      <PublishFlowGuide visible={flowGuideOpen} onClose={() => setFlowGuideOpen(false)} />
    </main>
  );
}
