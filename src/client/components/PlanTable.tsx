import type { PublishPlanItem } from "../../shared/types";

interface PlanTableProps {
  items: PublishPlanItem[];
  onChange: (items: PublishPlanItem[]) => void;
}

export function PlanTable({ items, onChange }: PlanTableProps) {
  function updateItem(index: number, patch: Partial<PublishPlanItem>) {
    onChange(items.map((item, currentIndex) => (currentIndex === index ? { ...item, ...patch } : item)));
  }

  return (
    <section className="panel">
      <h2>发布计划</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>章节</th>
              <th>标题</th>
              <th>字数</th>
              <th>日期</th>
              <th>时间</th>
              <th>状态</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => (
              <tr key={item.fileName}>
                <td>第{item.chapterNumber}章</td>
                <td>{item.title}</td>
                <td>{item.characterCount}</td>
                <td>
                  <input type="date" value={item.plannedDate} onChange={(event) => updateItem(index, { plannedDate: event.target.value })} />
                </td>
                <td>
                  <input type="time" value={item.plannedTime} onChange={(event) => updateItem(index, { plannedTime: event.target.value })} />
                </td>
                <td>{item.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
