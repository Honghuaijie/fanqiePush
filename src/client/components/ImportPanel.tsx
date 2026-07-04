import type { ImportBookResponse } from "../api";

interface ImportPanelProps {
  folderPath: string;
  chapterFileNamePattern: string;
  importedBook: ImportBookResponse | null;
  onFolderPathChange: (value: string) => void;
  onChapterFileNamePatternChange: (value: string) => void;
  onImport: () => void;
  error: string | null;
}

export function ImportPanel(props: ImportPanelProps) {
  return (
    <section className="panel">
      <h2>导入小说</h2>
      <div className="inline-form">
        <input
          value={props.folderPath}
          onChange={(event) => props.onFolderPathChange(event.target.value)}
          placeholder="输入小说文件夹路径"
        />
        <button onClick={props.onImport}>导入</button>
      </div>
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
