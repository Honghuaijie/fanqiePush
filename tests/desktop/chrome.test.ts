import path from "node:path";
import { describe, expect, it } from "vitest";
import { detectChrome } from "../../src/desktop/chrome";

describe("system Chrome detection", () => {
  it("finds Chrome in the macOS system Applications directory", async () => {
    const expected = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

    const result = await detectChrome({
      platform: "darwin",
      env: { HOME: "/Users/tester" },
      exists: async (candidate) => candidate === expected
    });

    expect(result).toEqual({ installed: true, executablePath: expected });
  });

  it("falls back to the current user's macOS Applications directory", async () => {
    const expected = "/Users/tester/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

    const result = await detectChrome({
      platform: "darwin",
      env: { HOME: "/Users/tester" },
      exists: async (candidate) => candidate === expected
    });

    expect(result).toEqual({ installed: true, executablePath: expected });
  });

  it.each([
    ["PROGRAMFILES", "C:\\Program Files"],
    ["PROGRAMFILES(X86)", "C:\\Program Files (x86)"],
    ["LOCALAPPDATA", "C:\\Users\\tester\\AppData\\Local"]
  ])("finds Windows Chrome under %s", async (variable, root) => {
    const expected = path.win32.join(root, "Google", "Chrome", "Application", "chrome.exe");

    const result = await detectChrome({
      platform: "win32",
      env: { [variable]: root },
      exists: async (candidate) => candidate === expected
    });

    expect(result).toEqual({ installed: true, executablePath: expected });
  });

  it("returns an unavailable state when no candidate exists", async () => {
    const result = await detectChrome({
      platform: "linux",
      env: {},
      exists: async () => false
    });

    expect(result).toEqual({ installed: false });
  });
});
