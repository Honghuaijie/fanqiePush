interface PublishControlsProps {
  canStart: boolean;
  onOpenPreview: () => void;
}

export function PublishControls({ canStart, onOpenPreview }: PublishControlsProps) {
  return (
    <section className="panel controls">
      <h2>发布控制</h2>
      <button disabled={!canStart} onClick={onOpenPreview}>开始发布</button>
      <button disabled>暂停</button>
      <button disabled>继续</button>
      <button disabled>停止</button>
    </section>
  );
}
