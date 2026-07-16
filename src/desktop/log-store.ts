import { mkdir, readFile, readdir, rename, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

export type DesktopLogLevel = "info" | "warning" | "error" | "success";

interface LogStoreOptions {
  logsDir: string;
  diagnosticsDir: string;
  maxBytes?: number;
  retentionDays?: number;
}

interface DiagnosticContext {
  appVersion: string;
  platform: string;
  chromeInstalled: boolean;
  settings: unknown;
}

const SENSITIVE_KEY = /^(?:body|content|manuscript|cookie|password|authorization|apiToken|token)$/i;
const INLINE_SECRET = /\b(password|authorization|cookie|apiToken|token)\s*[=:]\s*[^\s,;]+/gi;

function redact(value: unknown): unknown {
  if (typeof value === "string") {
    return value.replace(INLINE_SECRET, (_match, key: string) => `${key}=[REDACTED]`);
  }
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, nested]) => [
      key,
      SENSITIVE_KEY.test(key) ? "[REDACTED]" : redact(nested)
    ]));
  }
  return value;
}

function timestampForFile(date = new Date()): string {
  return date.toISOString().replace(/[:.]/g, "-");
}

export function createLogStore(options: LogStoreOptions) {
  const maxBytes = options.maxBytes ?? 5_000_000;
  const retentionDays = options.retentionDays ?? 14;
  const currentLog = path.join(options.logsDir, "desktop.log");
  let writeQueue: Promise<void> = Promise.resolve();

  async function ensureDirectories() {
    await Promise.all([
      mkdir(options.logsDir, { recursive: true }),
      mkdir(options.diagnosticsDir, { recursive: true })
    ]);
  }

  async function rotateIfNeeded(additionalBytes: number) {
    try {
      const current = await stat(currentLog);
      if (current.size + additionalBytes <= maxBytes) return;
      await rename(currentLog, path.join(options.logsDir, `desktop-${timestampForFile()}.log`));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }

  async function pruneExpired() {
    await ensureDirectories();
    const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
    const entries = await readdir(options.logsDir, { withFileTypes: true });
    await Promise.all(entries.map(async (entry) => {
      if (!entry.isFile() || !entry.name.endsWith(".log")) return;
      const filePath = path.join(options.logsDir, entry.name);
      const details = await stat(filePath);
      if (details.mtimeMs < cutoff) await unlink(filePath);
    }));
  }

  function append(level: DesktopLogLevel, message: string, details?: unknown) {
    writeQueue = writeQueue.catch(() => undefined).then(async () => {
      await ensureDirectories();
      const entry = {
        timestamp: new Date().toISOString(),
        level,
        message: redact(message),
        ...(details === undefined ? {} : { details: redact(details) })
      };
      const line = `${JSON.stringify(entry)}\n`;
      await rotateIfNeeded(Buffer.byteLength(line));
      await writeFile(currentLog, line, { encoding: "utf8", flag: "a" });
    });
    return writeQueue;
  }

  async function readRecentLogs(): Promise<unknown[]> {
    try {
      const lines = (await readFile(currentLog, "utf8")).trim().split(/\r?\n/).filter(Boolean).slice(-200);
      return lines.map((line) => {
        try {
          return redact(JSON.parse(line));
        } catch {
          return redact(line);
        }
      });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
  }

  return {
    append,
    pruneExpired,
    flush: () => writeQueue,

    async exportDiagnostics(context: DiagnosticContext) {
      await writeQueue;
      await ensureDirectories();
      await pruneExpired();
      const diagnosticPath = path.join(options.diagnosticsDir, `diagnostic-${timestampForFile()}.json`);
      const payload = redact({
        exportedAt: new Date().toISOString(),
        ...context,
        logs: await readRecentLogs()
      });
      await writeFile(diagnosticPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
      return diagnosticPath;
    }
  };
}
