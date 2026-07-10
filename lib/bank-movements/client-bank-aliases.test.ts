import { describe, expect, it } from "vitest";

import {
  buildClientBankAliasInsert,
  buildClientBankAliasPatch,
  clientBankAliasCreateSchema,
} from "@/lib/bank-movements/client-bank-aliases";
import {
  buildClientBillingConceptInsert,
  clientBillingConceptCreateSchema,
} from "@/lib/bank-movements/client-billing-concepts";

const WS = "11111111-1111-1111-1111-111111111111";
const CLIENT = "22222222-2222-2222-2222-222222222222";
const USER = "33333333-3333-3333-3333-333333333333";

describe("client bank alias schema + builders", () => {
  it("rechaza alias demasiado corto", () => {
    expect(clientBankAliasCreateSchema.safeParse({ alias_text: "ab" }).success).toBe(false);
  });

  it("insert calcula normalized_alias y default type manual", () => {
    const row = buildClientBankAliasInsert(
      { alias_text: "JP SOLUCIONES S.A.S." },
      { workspaceId: WS, clientId: CLIENT, userId: USER }
    );
    expect(row.normalized_alias).toBe("jp soluciones");
    expect(row.alias_type).toBe("manual");
    expect(row.workspace_id).toBe(WS);
    expect(row.client_id).toBe(CLIENT);
  });

  it("patch archived setea archived_at", () => {
    const now = new Date("2026-07-10T00:00:00Z");
    const patch = buildClientBankAliasPatch({ archived: true }, { now });
    expect(patch.archived_at).toBe(now.toISOString());
    const unarchive = buildClientBankAliasPatch({ archived: false }, { now });
    expect(unarchive.archived_at).toBeNull();
  });
});

describe("client billing concept schema + builders", () => {
  it("acepta un concepto válido", () => {
    const r = clientBillingConceptCreateSchema.safeParse({
      label: "Pauta y redes",
      currency: "USD",
      expected_amount: 183,
      billing_type: "recurring",
      frequency: "monthly",
    });
    expect(r.success).toBe(true);
  });

  it("rechaza moneda inválida", () => {
    expect(
      clientBillingConceptCreateSchema.safeParse({ label: "x", currency: "EUR" }).success
    ).toBe(false);
  });

  it("insert aplica defaults", () => {
    const row = buildClientBillingConceptInsert(
      { label: "Hosting", currency: "USD" },
      { workspaceId: WS, clientId: CLIENT, userId: USER }
    );
    expect(row.billing_type).toBe("recurring");
    expect(row.active).toBe(true);
    expect(row.expected_amount).toBeNull();
  });
});
