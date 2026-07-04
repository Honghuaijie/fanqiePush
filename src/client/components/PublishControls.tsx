import type { PublishRunLogEntry } from "../api";

interface PublishControlsProps {
  canStart: boolean;
  statusText: string;
  currentChapter?: number;
  message?: string;
  logs: PublishRunLogEntry[];
  onOpenPreview: () => void;
  onContinue: () => void;
  onStop: () => void;
}

export function PublishControls({ canStart, statusText, currentChapter, message, logs, onOpenPreview, onContinue, onStop }: PublishControlsProps) {
  const canContinue = statusText === "waiting-login";
  const visibleLogs = logs.slice(-100);

  return (
    <section className="panel controls">
      <div className="controls-row">
        <h2>发布控制</h2>
        <span className="status-pill">{statusText}</span>
        {currentChapter ? <span className="status-note">当前第 {currentChapter} 章</span> : null}
        {message ? <span className="status-note">{message}</span> : null}
        <button disabled={!canStart} onClick={onOpenPreview}>开始发布</button>
        <button disabled>暂停</button>
        <button disabled={!canContinue} onClick={onContinue}>继续</button>
        <button onClick={onStop}>停止</button>
      </div>
      <div className="run-console">
        <div className="console-heading">
          <h3>运行日志</h3>
          <span>{visibleLogs.length} 条</span>
        </div>
        {visibleLogs.length > 0 ? (
          <ol className="console-list">
            {visibleLogs.map((entry, index) => (
              <li className={`console-line ${entry.level}`} key={`${entry.time}-${index}`}>
                <time>{new Date(entry.time).toLocaleTimeString("zh-CN", { hour12: false })}</time>
                <span>{entry.message}</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="console-empty">暂无运行日志</p>
        )}
      </div>
    </section>
  );
}
