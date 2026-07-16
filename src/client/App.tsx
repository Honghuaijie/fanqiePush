import { useEffect, useMemo, useState } from "react";
import type { PublishPlanItem } from "../shared/types";
import { ApiRequestError, continuePublish, generatePlan, importBook, scheduleCurrentChapter, startPublish, stopPublish, type ImportBookResponse, type PublishRunState } from "./api";
import { FinalPreview } from "./components/FinalPreview";
import { ImportPanel } from "./components/ImportPanel";
import { PlanTable } from "./components/PlanTable";
import { PublishFlowGuide } from "./components/PublishFlowGuide";
import { PublishControls } from "./components/PublishControls";
import { RangePanel } from "./components/RangePanel";
import { getDesktopBridge } from "./desktop";
import { SettingsPanel } from "./components/SettingsPanel";
import { UninstallDialog } from "./components/UninstallDialog";
import type { DesktopInfo } from "../desktop/contracts";

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
  const [recentFolders, setRecentFolders] = useState<string[]>([]);
  const [desktopInfo, setDesktopInfo] = useState<DesktopInfo | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [showInterruptedWarning, setShowInterruptedWarning] = useState(false);
  const [uninstallOpen, setUninstallOpen] = useState(false);

  const canStart = useMemo(() => planItems.length > 0, [planItems.length]);

  useEffect(() => {
    const desktop = getDesktopBridge();
    if (!desktop) return;
    void desktop.getDesktopInfo()
      .then((info) => {
        setDesktopInfo(info);
        setRecentFolders(info.recentFolders.slice(0, 10));
        setShowInterruptedWarning(Boolean(info.interruptedTask));
      })
      .catch(() => undefined);
  }, []);

  async function handleImport() {
    setError(null);
    try {
      const imported = await importBook(folderPath, chapterFileNamePattern.trim() || undefined);
      setBook(imported);
      setStartChapter(imported.chapters[0]?.chapterNumber.toString() ?? "");
      setEndChapter(imported.chapters.at(-1)?.chapterNumber.toString() ?? "");
      const desktop = getDesktopBridge();
      if (desktop) {
        await desktop.rememberRecentFolder(imported.folderPath);
        setRecentFolders((current) => [
          imported.folderPath,
          ...current.filter((folder) => folder !== imported.folderPath)
        ].slice(0, 10));
      }
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
      const errorState = publishError instanceof ApiRequestError ? publishError.state : undefined;
      setPublishState({ ...(errorState ?? {}), status: "stopped", message });
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
      const errorState = continueError instanceof ApiRequestError ? continueError.state : undefined;
      setPublishState({ ...(errorState ?? {}), status: "stopped", message });
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

  async function handleOpenPath(targetPath: string) {
    const result = await getDesktopBridge()?.openPath(targetPath);
    if (result && !result.ok) setError(result.error ?? "无法打开文件夹");
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <h1>番茄章节发布工具</h1>
          <p>导入 Markdown 章节，生成排期，并提交到番茄定时发布。</p>
        </div>
        <div className="header-actions">
          {desktopInfo ? <button className="secondary" onClick={() => setSettingsOpen(true)}>设置</button> : null}
          <button className="secondary" onClick={() => setFlowGuideOpen(true)}>查看发布流程</button>
        </div>
      </header>
      {showInterruptedWarning && desktopInfo?.interruptedTask ? (
        <section className="interrupted-task-warning" role="alert">
          <div>
            <strong>上次任务异常结束，请先检查番茄后台。</strong>
            <p>小说：《{desktopInfo.interruptedTask.bookName}》。工具不会自动继续，避免重复提交章节。</p>
          </div>
          <button className="secondary" type="button" onClick={() => setShowInterruptedWarning(false)}>我已检查</button>
        </section>
      ) : null}
      <div className="content-grid">
        <ImportPanel
          folderPath={folderPath}
          chapterFileNamePattern={chapterFileNamePattern}
          importedBook={book}
          recentFolders={recentFolders}
          onFolderPathChange={setFolderPath}
          onChapterFileNamePatternChange={setChapterFileNamePattern}
          onRecentFolderSelect={setFolderPath}
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
          logs={publishState.logs ?? []}
          onOpenPreview={() => setPreviewOpen(true)}
          onContinue={handleContinuePublish}
          onStop={handleStopPublish}
        />
      </div>
      <FinalPreview items={planItems} visible={previewOpen} onCancel={() => setPreviewOpen(false)} onConfirm={handleConfirmPreview} />
      <PublishFlowGuide visible={flowGuideOpen} onClose={() => setFlowGuideOpen(false)} />
      {desktopInfo ? (
        <SettingsPanel
          visible={settingsOpen}
          info={desktopInfo}
          onClose={() => setSettingsOpen(false)}
          onOpenPath={handleOpenPath}
          onOpenReleasePage={() => getDesktopBridge()?.openReleasePage()}
          onExportDiagnostics={() => getDesktopBridge()?.exportDiagnostics() ?? Promise.resolve(null)}
          onUninstall={() => {
            setSettingsOpen(false);
            setUninstallOpen(true);
          }}
        />
      ) : null}
      {desktopInfo ? (
        <UninstallDialog
          visible={uninstallOpen}
          onClose={() => setUninstallOpen(false)}
          onPreview={(includeNovelRecords) => getDesktopBridge()!.previewCleanup(includeNovelRecords)}
          onConfirm={(includeNovelRecords) => getDesktopBridge()!.beginUninstall(includeNovelRecords)}
        />
      ) : null}
    </main>
  );
}
