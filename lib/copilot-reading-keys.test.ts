import { describe, expect, it } from "vitest";

import {
  getCopilotReadingKeyForPath,
  isCopilotReadingKeySuppressed,
} from "./copilot-reading-keys";

describe("copilot-reading-keys", () => {
  it("suprime Clave de lectura solo en /copilot/hoy", () => {
    expect(isCopilotReadingKeySuppressed("/copilot/hoy")).toBe(true);
    expect(isCopilotReadingKeySuppressed("/copilot/hoy/")).toBe(true);
    expect(isCopilotReadingKeySuppressed("/copilot/cartera")).toBe(false);
    expect(isCopilotReadingKeySuppressed("/copilot/alertas")).toBe(false);
  });

  it("otras rutas siguen teniendo entrada de lectura", () => {
    expect(getCopilotReadingKeyForPath("/copilot/cartera").title).toBe("Clave de lectura");
  });
});
