import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { startLocalServer, type LocalServerHandle } from "../../src/server/start-server";

let handle: LocalServerHandle | null = null;
let tempDir: string | null = null;

afterEach(async () => {
  await handle?.close();
  handle = null;

  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
    tempDir = null;
  }
});

describe("desktop-ready local server", () => {
  it("listens on a random localhost port and exposes health without a token", async () => {
    handle = await startLocalServer({ port: 0, apiToken: "desktop-secret" });

    expect(handle.origin).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);

    const response = await fetch(`${handle.origin}/api/health`);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
  });

  it("protects business APIs with the desktop token", async () => {
    handle = await startLocalServer({ port: 0, apiToken: "desktop-secret" });

    const missing = await fetch(`${handle.origin}/api/publish/state`);
    expect(missing.status).toBe(401);

    const accepted = await fetch(`${handle.origin}/api/publish/state`, {
      headers: { "x-fanqie-token": "desktop-secret" }
    });
    expect(accepted.status).toBe(200);
    await expect(accepted.json()).resolves.toMatchObject({ status: "idle" });
  });

  it("serves built assets and falls back to index.html for client routes", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "fanqie-static-"));
    await mkdir(path.join(tempDir, "assets"));
    await writeFile(path.join(tempDir, "index.html"), "<main>desktop app</main>", "utf8");
    await writeFile(path.join(tempDir, "assets", "app.js"), "window.ready = true;", "utf8");

    handle = await startLocalServer({ port: 0, staticDir: tempDir });

    const asset = await fetch(`${handle.origin}/assets/app.js`);
    expect(asset.status).toBe(200);
    await expect(asset.text()).resolves.toBe("window.ready = true;");

    const clientRoute = await fetch(`${handle.origin}/settings`);
    expect(clientRoute.status).toBe(200);
    await expect(clientRoute.text()).resolves.toContain("desktop app");
  });

  it("releases the listening port when closed", async () => {
    handle = await startLocalServer({ port: 0 });
    const origin = handle.origin;

    await handle.close();
    handle = null;

    await expect(fetch(`${origin}/api/health`)).rejects.toThrow();
  });
});
