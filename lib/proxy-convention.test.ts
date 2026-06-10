import { describe, expect, it } from "vitest";

import { config, proxy } from "../proxy";

describe("proxy convention", () => {
  it("exports proxy handler and preserves edge matcher config", () => {
    expect(typeof proxy).toBe("function");
    expect(config.matcher).toHaveLength(1);
    expect(config.matcher[0]).toContain("_next/static");
    expect(config.matcher[0]).toContain("favicon.ico");
  });
});
