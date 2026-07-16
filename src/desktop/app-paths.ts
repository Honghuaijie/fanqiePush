import path from "node:path";

export interface DesktopPaths {
  root: string;
  settingsFile: string;
  generatedFilesText: string;
  logsDir: string;
  diagnosticsDir: string;
  defaultAccountProfile: string;
  interruptedTaskFile: string;
}

export function createDesktopPaths(root: string): DesktopPaths {
  return {
    root,
    settingsFile: path.join(root, "settings.json"),
    generatedFilesText: path.join(root, "generated-files.txt"),
    logsDir: path.join(root, "logs"),
    diagnosticsDir: path.join(root, "diagnostics"),
    defaultAccountProfile: path.join(root, "accounts", "default", "chrome-profile"),
    interruptedTaskFile: path.join(root, "active-publish-task.json")
  };
}
