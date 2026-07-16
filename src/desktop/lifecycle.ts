import type { PublishRunState } from "../server/automation/publisher";

type PublishStatus = PublishRunState["status"];

interface MessageBoxOptions {
  type: "warning";
  title: string;
  message: string;
  detail: string;
  buttons: string[];
  defaultId: number;
  cancelId: number;
  noLink: boolean;
}

export function isActivePublishStatus(status: PublishStatus): boolean {
  return status === "running" || status === "paused" || status === "waiting-login";
}

export async function confirmCloseIfPublishing(options: {
  status: PublishStatus;
  showMessageBox: (options: MessageBoxOptions) => Promise<{ response: number }>;
  stop: () => Promise<unknown> | unknown;
}): Promise<boolean> {
  if (!isActivePublishStatus(options.status)) return true;

  const result = await options.showMessageBox({
    type: "warning",
    title: "发布任务仍在进行",
    message: "确定要退出番茄章节发布工具吗？",
    detail: "退出会停止当前发布任务。已提交到番茄的章节不会被撤回。",
    buttons: ["取消退出", "停止任务并退出"],
    defaultId: 0,
    cancelId: 0,
    noLink: true
  });
  if (result.response !== 1) return false;

  await options.stop();
  return true;
}
