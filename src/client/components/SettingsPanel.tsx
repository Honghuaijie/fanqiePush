import type { DesktopInfo } from "../../desktop/contracts";

interface SettingsPanelProps {
  visible: boolean;
  info: DesktopInfo;
  onClose: () => void;
  onOpenPath: (targetPath: string) => void | Promise<void>;
  onOpenReleasePage: () => void | Promise<void>;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

function PathRow(props: {
  label: string;
  path: string;
  usage: number;
  onOpenPath: (targetPath: string) => void | Promise<void>;
}) {
  return (
    <div className="storage-row">
      <div>
        <strong>{props.label}</strong>
        <code className="storage-path">{props.path}</code>
      </div>
      <span className="storage-size">{formatBytes(props.usage)}</span>
      <button
        className="secondary"
        type="button"
        aria-label={`打开 ${props.label}文件夹`}
        onClick={() => props.onOpenPath(props.path)}
      >
        打开{props.label}文件夹
      </button>
    </div>
  );
}

export function SettingsPanel(props: SettingsPanelProps) {
  if (!props.visible) return null;

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <div className="modal-heading">
          <div>
            <h2 id="settings-title">设置与数据</h2>
            <p>版本 {props.info.version}</p>
          </div>
          <button className="secondary icon-button" type="button" aria-label="关闭设置" onClick={props.onClose}>×</button>
        </div>

        <section className="settings-section">
          <h3>运行环境</h3>
          <dl className="settings-summary">
            <div><dt>当前版本</dt><dd>{props.info.version}</dd></div>
            <div><dt>Chrome</dt><dd>{props.info.chrome.installed ? "已找到 Chrome" : "未找到 Chrome"}</dd></div>
          </dl>
          {props.info.chrome.executablePath ? (
            <code className="storage-path">{props.info.chrome.executablePath}</code>
          ) : null}
        </section>

        <section className="settings-section">
          <h3>数据与存储</h3>
          <div className="storage-list">
            <PathRow
              label="应用数据"
              path={props.info.paths.applicationData}
              usage={props.info.usage.applicationBytes}
              onOpenPath={props.onOpenPath}
            />
            <PathRow
              label="Chrome 登录资料"
              path={props.info.paths.chromeProfile}
              usage={props.info.usage.profileBytes}
              onOpenPath={props.onOpenPath}
            />
            <PathRow
              label="日志"
              path={props.info.paths.logs}
              usage={props.info.usage.logsBytes}
              onOpenPath={props.onOpenPath}
            />
          </div>
        </section>

        <section className="settings-section">
          <div className="section-heading-row">
            <div>
              <h3>工具生成文件</h3>
              <p>{formatBytes(props.info.usage.generatedBytes)}</p>
            </div>
          </div>
          {props.info.generatedFiles.length > 0 ? (
            <ul className="generated-file-list">
              {props.info.generatedFiles.map((filePath) => <li key={filePath}><code>{filePath}</code></li>)}
            </ul>
          ) : <p className="helper-text">暂无工具生成文件。</p>}
        </section>

        <section className="settings-section settings-version-row">
          <div>
            <h3>版本更新</h3>
            <p className="helper-text">当前版本：{props.info.version}</p>
          </div>
          <button type="button" onClick={props.onOpenReleasePage}>查看新版本</button>
        </section>
      </section>
    </div>
  );
}
