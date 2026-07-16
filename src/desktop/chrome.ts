import { access } from "node:fs/promises";
import path from "node:path";

export interface ChromeDetectionResult {
  installed: boolean;
  executablePath?: string;
}

export interface ChromeDetectionOptions {
  platform: NodeJS.Platform;
  env: NodeJS.ProcessEnv;
  exists: (candidate: string) => Promise<boolean>;
}

async function fileExists(candidate: string): Promise<boolean> {
  try {
    await access(candidate);
    return true;
  } catch {
    return false;
  }
}

function getChromeCandidates(platform: NodeJS.Platform, env: NodeJS.ProcessEnv): string[] {
  if (platform === "darwin") {
    const executable = path.join("Google Chrome.app", "Contents", "MacOS", "Google Chrome");
    return [
      path.join("/Applications", executable),
      ...(env.HOME ? [path.join(env.HOME, "Applications", executable)] : [])
    ];
  }

  if (platform === "win32") {
    return [env.PROGRAMFILES, env["PROGRAMFILES(X86)"], env.LOCALAPPDATA]
      .filter((root): root is string => Boolean(root))
      .map((root) => path.win32.join(root, "Google", "Chrome", "Application", "chrome.exe"));
  }

  return [];
}

export async function detectChrome(options: Partial<ChromeDetectionOptions> = {}): Promise<ChromeDetectionResult> {
  const platform = options.platform ?? process.platform;
  const env = options.env ?? process.env;
  const exists = options.exists ?? fileExists;

  for (const candidate of getChromeCandidates(platform, env)) {
    if (await exists(candidate)) {
      return { installed: true, executablePath: candidate };
    }
  }

  return { installed: false };
}
