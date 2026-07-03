interface PublishControlsProps {
  canStart: boolean;
  statusText: string;
  currentChapter?: number;
  message?: string;
  onOpenPreview: () => void;
  onStop: () => void;
}

export function PublishControls({ canStart, statusText, currentChapter, message, onOpenPreview, onStop }: PublishControlsProps) {
  return (
    <section className="panel controls">
      <h2>发布控制</h2>
      <span className="status-pill">{statusText}</span>
      {currentChapter ? <span className="status-note">当前第 {currentChapter} 章</span> : null}
      {message ? <span className="status-note">{message}</span> : null}
      <button disabled={!canStart} onClick={onOpenPreview}>开始发布</button>
      <button disabled>暂停</button>
      <button disabled>继续</button>
      <button onClick={onStop}>停止</button>
    </section>
  );
}
