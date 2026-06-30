interface RangePanelProps {
  startChapter: string;
  endChapter: string;
  startDate: string;
  dailyTimes: string[];
  onStartChapterChange: (value: string) => void;
  onEndChapterChange: (value: string) => void;
  onStartDateChange: (value: string) => void;
  onDailyTimesChange: (value: string[]) => void;
  onGenerate: () => void;
}

export function RangePanel(props: RangePanelProps) {
  function updateTime(index: number, value: string) {
    props.onDailyTimesChange(props.dailyTimes.map((time, currentIndex) => (currentIndex === index ? value : time)));
  }

  function addTime() {
    props.onDailyTimesChange([...props.dailyTimes, "21:00"]);
  }

  function removeTime(index: number) {
    if (props.dailyTimes.length <= 1) return;
    props.onDailyTimesChange(props.dailyTimes.filter((_time, currentIndex) => currentIndex !== index));
  }

  return (
    <section className="panel">
      <h2>章节范围和开始日期</h2>
      <div className="grid-form">
        <label>
          起始章节
          <input value={props.startChapter} onChange={(event) => props.onStartChapterChange(event.target.value)} />
        </label>
        <label>
          结束章节
          <input value={props.endChapter} onChange={(event) => props.onEndChapterChange(event.target.value)} />
        </label>
        <label>
          开始日期
          <input type="date" value={props.startDate} onChange={(event) => props.onStartDateChange(event.target.value)} />
        </label>
      </div>
      <div className="schedule-config">
        <div className="section-heading-row">
          <div>
            <h3>每日发布时间</h3>
            <p>这里有几个时间点，工具就按每天几章生成排期。</p>
          </div>
          <button type="button" onClick={addTime}>新增时间</button>
        </div>
        <div className="time-list">
          {props.dailyTimes.map((time, index) => (
            <div className="time-row" key={`${index}-${time}`}>
              <span>第 {index + 1} 章</span>
              <input type="time" value={time} onChange={(event) => updateTime(index, event.target.value)} />
              <button type="button" className="secondary" disabled={props.dailyTimes.length <= 1} onClick={() => removeTime(index)}>
                删除
              </button>
            </div>
          ))}
        </div>
      </div>
      <button onClick={props.onGenerate}>生成计划</button>
    </section>
  );
}
