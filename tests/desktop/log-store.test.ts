import { access, mkdtemp, readFile, readdir, rm, utimes, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createLogStore } from "../../src/desktop/log-store";

let tempDir: string | null = null;

afterEach(async () => {
  if (tempDir) await rm(tempDir, { recursive: true, force: true });
  tempDir = null;
});

async function createStore(overrides: { maxBytes?: number; retentionDays?: number } = {}) {
  tempDir = await mkdtemp(path.join(os.tmpdir(), "fanqie-logs-"));
  const logsDir = path.join(tempDir, "logs");
  const diagnosticsDir = path.join(tempDir, "diagnostics");
  return {
    logsDir,
    diagnosticsDir,
    store: createLogStore({
      logsDir,
      diagnosticsDir,
      maxBytes: overrides.maxBytes ?? 5_000_000,
      retentionDays: overrides.retentionDays ?? 14
    })
  };
}

describe("desktop log store", () => {
  it("redacts manuscript and authentication values from diagnostics", async () => {
    const { store } = await createStore();
    await store.append("error", "请求失败 password=plain-password authorization=Bearer-secret", {
      body: "完整小说正文",
      cookie: "session-cookie",
      password: "plain-password",
      authorization: "Bearer secret",
      safeField: "可以保留"
    });

    const diagnosticPath = await store.exportDiagnostics({
      appVersion: "0.2.0",
      platform: "darwin",
      chromeInstalled: true,
      settings: { apiToken: "desktop-secret", theme: "light" }
    });
    const content = await readFile(diagnosticPath, "utf8");

    expect(content).toContain("[REDACTED]");
    expect(content).toContain("可以保留");
    expect(content).not.toContain("完整小说正文");
    expect(content).not.toContain("session-cookie");
    expect(content).not.toContain("plain-password");
    expect(content).not.toContain("Bearer-secret");
    expect(content).not.toContain("desktop-secret");
  });

  it("rotates the current log before it exceeds the configured size", async () => {
    const { logsDir, store } = await createStore({ maxBytes: 180 });

    await store.append("info", "a".repeat(120));
    await store.append("info", "b".repeat(120));

    const files = await readdir(logsDir);
    expect(files).toContain("desktop.log");
    expect(files.some((file) => file.startsWith("desktop-") && file.endsWith(".log"))).toBe(true);
  });

  it("removes log files older than the retention period", async () => {
    const { logsDir, store } = await createStore({ retentionDays: 14 });
    await store.append("info", "today");
    const oldLog = path.join(logsDir, "desktop-old.log");
    await writeFile(oldLog, "old", "utf8");
    const oldDate = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000);
    await utimes(oldLog, oldDate, oldDate);

    await store.pruneExpired();

    await expect(access(oldLog)).rejects.toThrow();
    await expect(access(path.join(logsDir, "desktop.log"))).resolves.toBeUndefined();
  });
});
