interface PublishFlowGuideProps {
  visible: boolean;
  onClose: () => void;
}

const flowSteps = [
  "打开独立 Chrome，进入番茄作者后台。",
  "找到与本地文件夹同名的小说，并进入章节管理页。",
  "打开新建章节编辑器，填写章节号、标题和正文。",
  "点击右上角“下一步”。",
  "如果出现错别字提示，直接点击“提交”。",
  "出现内容检测方式弹窗后，点击“全面检测”。",
  "等待检测通过并出现“发布设置”弹窗。",
  "选择“是否使用 AI：否”，开启“定时发布”。",
  "填写计划中的日期和时间。",
  "点击“确认发布”。",
  "回到章节管理页，确认章节状态为“待发布”。",
  "本地记录该章节状态为 scheduled。"
];

export function PublishFlowGuide({ visible, onClose }: PublishFlowGuideProps) {
  if (!visible) return null;

  return (
    <div className="modal-backdrop">
      <section className="modal flow-modal">
        <div className="modal-heading">
          <div>
            <h2>番茄发布流程</h2>
            <p>第一版按单章定时发布闭环验证，稳定后再扩展批量发布。</p>
          </div>
          <button className="secondary icon-button" onClick={onClose} aria-label="关闭发布流程">×</button>
        </div>

        <ol className="flow-list">
          {flowSteps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>

        <div className="flow-note">
          <h3>关键分支</h3>
          <p>错别字提示出现时直接提交，不自动修改错别字。内容检测必须选择“全面检测”。任何检测失败、弹窗未出现或确认发布失败，工具都应暂停并提醒处理。</p>
        </div>

        <div className="flow-note">
          <h3>完成标准</h3>
          <p>只有番茄章节列表显示“待发布”，发布时间与计划一致，并且本地记录写入 scheduled，才算当前章节发布完成。</p>
        </div>

        <div className="modal-actions">
          <button onClick={onClose}>知道了</button>
        </div>
      </section>
    </div>
  );
}
