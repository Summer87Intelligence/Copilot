import type { Page, Response } from "@playwright/test";

export type NetworkMonitor = {
  serverErrors: Array<{ url: string; status: number }>;
  attach: (page: Page) => void;
  assertNoServerErrors: () => void;
};

export function createNetworkMonitor(): NetworkMonitor {
  const serverErrors: Array<{ url: string; status: number }> = [];

  return {
    serverErrors,
    attach(page) {
      page.on("response", (response: Response) => {
        const status = response.status();
        if (status < 500) return;
        const url = response.url();
        if (!/\/api\/copilot\//.test(url)) return;
        serverErrors.push({ url, status });
      });
    },
    assertNoServerErrors() {
      if (serverErrors.length === 0) return;
      const joined = serverErrors.map((e) => `${e.status} ${e.url}`).join("\n");
      throw new Error(`Respuestas 5xx en APIs Copilot:\n${joined}`);
    },
  };
}
