import type { PublishPlanItem } from "../../shared/types";

interface FinalPreviewProps {
  items: PublishPlanItem[];
  visible: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function FinalPreview({ items, visible, onConfirm, onCancel }: FinalPreviewProps) {
  if (!visible) return null;

  const sorted = [...items].sort((a, b) =>
    `${a.plannedDate} ${a.plannedTime}`.localeCompare(`${b.plannedDate} ${b.plannedTime}`)
  );

  return (
    <div className="modal-backdrop">
      <section className="modal">
        <h2>确认发布计划</h2>
        <p>请确认每一章的发布日期和时间。确认后工具才会开始自动提交。</p>
        <div className="table-wrap preview-table">
          <table>
            <thead>
              <tr>
                <th>章节</th>
                <th>标题</th>
                <th>发布时间</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((item) => (
                <tr key={item.fileName}>
                  <td>第{item.chapterNumber}章</td>
                  <td>{item.title}</td>
                  <td>
                    {item.plannedDate} {item.plannedTime}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="modal-actions">
          <button className="secondary" onClick={onCancel}>返回修改</button>
          <button onClick={onConfirm}>确认并开始</button>
        </div>
      </section>
    </div>
  );
}
