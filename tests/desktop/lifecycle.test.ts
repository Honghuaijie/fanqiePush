import { describe, expect, it, vi } from "vitest";
import { confirmCloseIfPublishing, isActivePublishStatus } from "../../src/desktop/lifecycle";

describe("desktop lifecycle", () => {
  it.each(["running", "paused", "waiting-login"] as const)("treats %s as an active publish status", (status) => {
    expect(isActivePublishStatus(status)).toBe(true);
  });

  it.each(["idle", "stopped"] as const)("allows immediate close for %s", async (status) => {
    const showMessageBox = vi.fn();
    await expect(confirmCloseIfPublishing({ status, showMessageBox, stop: vi.fn() })).resolves.toBe(true);
    expect(showMessageBox).not.toHaveBeenCalled();
  });

  it("defaults to cancelling exit while a publish task is active", async () => {
    const stop = vi.fn();
    const showMessageBox = vi.fn(async (options) => {
      expect(options.defaultId).toBe(0);
      expect(options.cancelId).toBe(0);
      expect(options.buttons[0]).toBe("取消退出");
      return { response: 0 };
    });

    await expect(confirmCloseIfPublishing({ status: "running", showMessageBox, stop })).resolves.toBe(false);
    expect(stop).not.toHaveBeenCalled();
  });

  it("stops publishing only after the user confirms exit", async () => {
    const stop = vi.fn(async () => undefined);
    const showMessageBox = vi.fn(async () => ({ response: 1 }));

    await expect(confirmCloseIfPublishing({ status: "paused", showMessageBox, stop })).resolves.toBe(true);
    expect(stop).toHaveBeenCalledTimes(1);
  });
});
