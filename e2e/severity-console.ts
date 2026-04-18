import type { Page } from "@playwright/test";

/**
 * Filtra ruido habitual de devtools / assets que no indica rotura del smoke.
 */
export function isBenignConsoleMessage(text: string): boolean {
  const t = text.trim();
  if (/Download the React DevTools/i.test(t)) return true;
  if (/^\[Fast Refresh\]/i.test(t)) return true;
  if (/^\s*Warning:/.test(t)) return true;
  if (/favicon\.ico/i.test(t)) return true;
  if (/ResizeObserver loop/i.test(t)) return true;
  if (/\/_next\/webpack-hmr/i.test(t)) return true;
  if (/WebSocket connection to ['"]?ws:\/\/.*\/_next\/webpack-hmr/i.test(t))
    return true;
  return false;
}

export type SevereCollector = {
  messages: string[];
  attach: (page: Page) => void;
  assertClean: () => void;
};

export function createSevereCollector(): SevereCollector {
  const messages: string[] = [];

  return {
    messages,
    attach(page) {
      page.on("pageerror", (err) => {
        messages.push(`[pageerror] ${err.message}`);
      });
      page.on("console", (msg) => {
        if (msg.type() !== "error") return;
        const text = msg.text();
        if (isBenignConsoleMessage(text)) return;
        messages.push(`[console.error] ${text}`);
      });
    },
    assertClean() {
      if (messages.length === 0) return;
      const joined = messages.join("\n---\n");
      throw new Error(
        `Señales severas de consola/runtime durante el smoke:\n${joined}`
      );
    },
  };
}
