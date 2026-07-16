import type { FanqieDesktopBridge } from "../desktop/contracts";

declare global {
  interface Window {
    fanqieDesktop?: FanqieDesktopBridge;
  }
}

export function getDesktopBridge(): FanqieDesktopBridge | undefined {
  return window.fanqieDesktop;
}

export function isDesktopMode(): boolean {
  return Boolean(getDesktopBridge());
}
