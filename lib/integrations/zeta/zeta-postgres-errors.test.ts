import { describe, expect, it } from "vitest";

import { isPostgresUniqueViolation } from "@/lib/integrations/zeta/zeta-postgres-errors";

describe("isPostgresUniqueViolation", () => {
  it("detecta SQLSTATE 23505", () => {
    expect(isPostgresUniqueViolation({ code: "23505", message: "duplicate" })).toBe(true);
  });

  it("rechaza otros códigos", () => {
    expect(isPostgresUniqueViolation({ code: "23503" })).toBe(false);
    expect(isPostgresUniqueViolation(null)).toBe(false);
    expect(isPostgresUniqueViolation("23505")).toBe(false);
  });
});
