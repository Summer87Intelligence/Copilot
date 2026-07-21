import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { listClientPayerHistory, countOtherClientsForPayerIdentity } = await import(
  "@/lib/bank/canonical/payer-identity-repository.server"
);

const WS = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const CLIENT_A = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const CLIENT_B = "dddddddd-dddd-dddd-dddd-dddddddddddd";
const IDENTITY_1 = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee";

type Row = Record<string, unknown>;

function fakeClient(links: Row[]) {
  return {
    from(table: string) {
      expect(table).toBe("client_payer_links");
      const eqFilters: Record<string, unknown> = {};
      const neFilters: Record<string, unknown> = {};
      const notInFilters: unknown[] = [];
      const builder: Record<string, unknown> = {
        select() {
          return builder;
        },
        eq(col: string, val: unknown) {
          eqFilters[col] = val;
          return builder;
        },
        neq(col: string, val: unknown) {
          neFilters[col] = val;
          return builder;
        },
        not(_col: string, _op: string, val: unknown) {
          notInFilters.push(val);
          return builder;
        },
        order() {
          return builder;
        },
        then(resolve: (v: { data: Row[]; error: null }) => void) {
          let out = links;
          for (const [k, v] of Object.entries(eqFilters)) out = out.filter((r) => r[k] === v);
          for (const [k, v] of Object.entries(neFilters)) out = out.filter((r) => r[k] !== v);
          if (notInFilters.length > 0) {
            out = out.filter((r) => r.status !== "rejected" && r.status !== "inactive");
          }
          return resolve({ data: out, error: null });
        },
      };
      return builder;
    },
  };
}

describe("listClientPayerHistory", () => {
  it("devuelve el historial de identidades de un cliente, excluyendo rejected", () => {
    const client = fakeClient([
      {
        id: "link-1",
        workspace_id: WS,
        payer_identity_id: IDENTITY_1,
        client_company_id: CLIENT_A,
        status: "confirmed",
        confidence: 90,
        confirmations: 3,
        rejections: 0,
        reconciled_count: 3,
        total_by_currency: { UYU: 45000 },
        first_seen_at: "2026-06-01T00:00:00Z",
        last_seen_at: "2026-07-20T00:00:00Z",
        confirmed_by: "user-1",
        confirmed_at: "2026-07-20T00:00:00Z",
        bank_payer_identities: {
          bank_name: "Santander",
          original_name: "ENERGETIA LIMITADA",
          normalized_name: "ENERGETIA LIMITADA",
          masked_account: "••••1234",
          fingerprint_strength: "name",
          usual_currency: "UYU",
          status: "active",
          first_seen_at: "2026-06-01T00:00:00Z",
          last_seen_at: "2026-07-20T00:00:00Z",
          movement_count: 3,
        },
      },
      {
        id: "link-rejected",
        workspace_id: WS,
        payer_identity_id: IDENTITY_1,
        client_company_id: CLIENT_A,
        status: "rejected",
        confidence: 10,
        confirmations: 0,
        rejections: 1,
        reconciled_count: 0,
        total_by_currency: {},
        first_seen_at: null,
        last_seen_at: null,
        confirmed_by: null,
        confirmed_at: null,
        bank_payer_identities: null,
      },
    ]);

    return listClientPayerHistory(client as never, WS, CLIENT_A).then((rows: unknown[]) => {
      expect(rows).toHaveLength(1);
      const row = rows[0] as Record<string, unknown>;
      expect(row.linkStatus).toBe("confirmed");
      expect(row.confirmations).toBe(3);
      expect(row.normalizedName).toBe("ENERGETIA LIMITADA");
      expect(row.maskedAccount).toBe("••••1234");
    });
  });

  it("devuelve lista vacía cuando falta el clientId", async () => {
    const client = fakeClient([]);
    const rows = await listClientPayerHistory(client as never, WS, "");
    expect(rows).toEqual([]);
  });
});

describe("countOtherClientsForPayerIdentity", () => {
  it("cuenta clientes distintos de otros que comparten la misma identidad", async () => {
    const client = fakeClient([
      { workspace_id: WS, client_company_id: CLIENT_A, status: "confirmed", payer_identity_id: IDENTITY_1 },
      { workspace_id: WS, client_company_id: CLIENT_B, status: "confirmed", payer_identity_id: IDENTITY_1 },
    ]);
    const count = await countOtherClientsForPayerIdentity(client as never, WS, IDENTITY_1, CLIENT_A);
    expect(count).toBe(1);
  });
});
