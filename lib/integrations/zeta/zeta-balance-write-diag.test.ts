import { describe, expect, it, vi, afterEach } from "vitest";

import {
  shouldLogZetaBalanceWrite,
  logZetaBalanceWrite,
} from "@/lib/integrations/zeta/zeta-balance-write-diag";

describe("zeta-balance-write-diag", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("loguea facturas en lista de vigilancia sin env", () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    logZetaBalanceWrite({
      source: "vouchers",
      writer_process: "test",
      invoice_id: "id-1",
      invoice_number: "ZETA:CCV1:0:2:A:2926",
      balance_before: 368.26,
      balance_after: 368.26,
      balance_payload_omitted: true,
    });
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("shouldLogZetaBalanceWrite con ZETA_BALANCE_WRITE_DIAG=1", () => {
    vi.stubEnv("ZETA_BALANCE_WRITE_DIAG", "1");
    expect(shouldLogZetaBalanceWrite("ZETA:CCV1:0:99:X:1")).toBe(true);
  });

  it("shouldLogZetaBalanceWrite por nombre de cliente vigilado", () => {
    expect(shouldLogZetaBalanceWrite("ZETA:CCV1:0:1:A:1", "PETROVIC SA")).toBe(true);
    expect(shouldLogZetaBalanceWrite("ZETA:CCV1:0:1:A:1", "Cliente Random")).toBe(false);
  });
});
