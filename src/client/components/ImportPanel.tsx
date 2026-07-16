import type { ImportBookResponse } from "../api";
import { getDesktopBridge } from "../desktop";

interface ImportPanelProps {
  folderPath: string;
  chapterFileNamePattern: string;
  importedBook: ImportBookResponse | null;
  recentFolders: string[];
  onFolderPathChange: (value: string) => void;
  onChapterFileNamePatternChange: (value: string) => void;
  onRecentFolderSelect: (value: string) => void;
  onImport: () => void;
  error: string | null;
}

export function ImportPanel(props: ImportPanelProps) {
  const desktop = getDesktopBridge();

  async function handleSelectFolder() {
    const selected = await desktop?.selectNovelFolder();
    if (selected) props.onFolderPathChange(selected);
  }

  return (
    <section className="panel">
      <h2>导入小说</h2>
      <div className="inline-form folder-import-form">
        <input
          aria-label="小说文件夹路径"
          className="folder-path-input"
          value={props.folderPath}
          onChange={(event) => props.onFolderPathChange(event.target.value)}
          placeholder="输入小说文件夹路径"
        />
        {desktop ? (
          <button className="secondary" type="button" onClick={handleSelectFolder}>
            选择小说文件夹
          </button>
        ) : null}
        <button onClick={props.onImport}>导入</button>
      </div>
      {props.recentFolders.length > 0 ? (
        <label className="recent-folder-field">
          最近使用的小说
          <select
            aria-label="最近使用的小说"
            value=""
            onChange={(event) => props.onRecentFolderSelect(event.target.value)}
          >
            <option value="" disabled>选择最近使用的小说文件夹</option>
            {props.recentFolders.slice(0, 10).map((folder) => (
              <option key={folder} value={folder}>{folder}</option>
            ))}
          </select>
        </label>
      ) : null}
      <label className="pattern-field">
        章节命名格式
        <input
          value={props.chapterFileNamePattern}
          onChange={(event) => props.onChapterFileNamePatternChange(event.target.value)}
          placeholder="留空则智能识别，例如：第{章节}章_{章节名}.md"
        />
      </label>
      <p className="helper-text">
        可用占位符：{"{章节}"}、{"{章节名}"}。若您的章节命名是“第001章_这算我弄坏的吗.md”，则填写“第{"{章节}"}章_{"{章节名}"}.md”；若是“001-开局.md”，则填写“{"{章节}"}-{"{章节名}"}.md”。
      </p>
      {props.error ? <p className="error-text">{props.error}</p> : null}
      {props.importedBook ? (
        <dl className="summary-grid">
          <div>
            <dt>书名</dt>
            <dd>{props.importedBook.bookName}</dd>
          </div>
          <div>
            <dt>Markdown 文件</dt>
            <dd>{props.importedBook.totalMarkdownFiles}</dd>
          </div>
          <div>
            <dt>识别章节</dt>
            <dd>{props.importedBook.recognizedChapters}</dd>
          </div>
          <div>
            <dt>自动编号</dt>
            <dd>{props.importedBook.autoNumberedChapters}</dd>
          </div>
          <div>
            <dt>发布记录</dt>
            <dd>{props.importedBook.hasPublishLog ? "已读取" : "未创建"}</dd>
          </div>
        </dl>
      ) : null}
      {props.importedBook?.warnings.length ? (
        <div className="warning-list">
          {props.importedBook.warnings.map((warning) => (
            <p key={warning}>{warning}</p>
          ))}
        </div>
      ) : null}
    </section>
  );
}
