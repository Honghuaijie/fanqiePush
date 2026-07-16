import { useEffect, useState } from "react";
import type { CleanupPreview, CleanupResult } from "../../desktop/contracts";

interface UninstallDialogProps {
  visible: boolean;
  onClose: () => void;
  onPreview: (includeNovelRecords: boolean) => Promise<CleanupPreview>;
  onConfirm: (includeNovelRecords: boolean) => Promise<CleanupResult>;
}

const STATUS_TEXT = {
  pending: "等待清理",
  deleted: "已删除",
  kept: "已保留",
  missing: "未找到",
  failed: "清理失败"
} as const;

export function UninstallDialog(props: UninstallDialogProps) {
  const [includeNovelRecords, setIncludeNovelRecords] = useState(true);
  const [preview, setPreview] = useState<CleanupPreview | null>(null);
  const [result, setResult] = useState<CleanupResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!props.visible) return;
    let cancelled = false;
    setLoading(true);
    setResult(null);
    setError(null);
    void props.onPreview(includeNovelRecords)
      .then((next) => {
        if (!cancelled) setPreview(next);
      })
      .catch((nextError) => {
        if (!cancelled) setError(nextError instanceof Error ? nextError.message : "无法读取待清理路径");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [props.visible, includeNovelRecords]);

  if (!props.visible) return null;

  const previewPaths = [
    ...(preview?.applicationData ?? []),
    ...(preview?.novelRecords ?? [])
  ];

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal uninstall-modal" role="dialog" aria-modal="true" aria-labelledby="uninstall-title">
        <div className="modal-heading">
          <div>
            <h2 id="uninstall-title">卸载番茄章节发布工具</h2>
            <p>先清理工具数据，全部成功后才会启动系统卸载。</p>
          </div>
          <button className="secondary icon-button" type="button" aria-label="关闭卸载窗口" onClick={props.onClose}>×</button>
        </div>

        <label className="cleanup-option">
          <input
            type="checkbox"
            checked={includeNovelRecords}
            onChange={(event) => setIncludeNovelRecords(event.target.checked)}
          />
          同时删除小说文件夹中的发布记录
        </label>
        <p className="cleanup-warning">删除发布记录后，以后可能无法识别已经提交过的章节。</p>

        <section className="settings-section">
          <h3>待处理的完整地址</h3>
          {loading ? <p>正在读取...</p> : null}
          {previewPaths.length > 0 ? (
            <ul className="cleanup-path-list">
              {previewPaths.map((targetPath) => <li key={targetPath}><code>{targetPath}</code></li>)}
            </ul>
          ) : !loading ? <p className="helper-text">没有登记的小说发布记录。</p> : null}
        </section>

        {result ? (
          <section className="settings-section">
            <h3>清理结果</h3>
            {result.message ? <p>{result.message}</p> : null}
            <ul className="cleanup-result-list">
              {result.items.map((item) => (
                <li key={item.path} className={item.status === "failed" ? "cleanup-failed" : ""}>
                  <span>{STATUS_TEXT[item.status]}</span>
                  <code>{item.path}</code>
                  {item.error ? <small>{item.error}</small> : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        {error ? <p className="error-text">{error}</p> : null}

        <div className="modal-actions">
          <button className="secondary" type="button" onClick={props.onClose}>取消</button>
          <button
            type="button"
            disabled={loading}
            onClick={async () => {
              setLoading(true);
              setError(null);
              try {
                setResult(await props.onConfirm(includeNovelRecords));
              } catch (nextError) {
                setError(nextError instanceof Error ? nextError.message : "清理失败");
              } finally {
                setLoading(false);
              }
            }}
          >
            清理数据并卸载
          </button>
        </div>
      </section>
    </div>
  );
}
