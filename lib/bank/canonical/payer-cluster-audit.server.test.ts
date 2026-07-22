import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { getPayerClusterDetail, listPayerClusterSummaries } = await import(
  "@/lib/bank/canonical/payer-cluster-audit.server"
);

const WS = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

type Row = Record<string, unknown>;
type Tables = Record<string, Row[]>;

/** Mismo patrón que canonical-suggestion-evidence.test.ts / repositories-scope.test.ts. */
function fakeClient(tables: Tables) {
  return {
    from(table: string) {
      const rows = tables[table] ?? [];
      const eqFilters: Record<string, unknown> = {};
      const neqFilters: Record<string, unknown> = {};
      const inFilters: Record<string, unknown[]> = {};
      let isNullCol: string | null = null;

      function apply(): Row[] {
        let out = rows;
        for (const [k, v] of Object.entries(eqFilters)) out = out.filter((r) => r[k] === v);
        for (const [k, v] of Object.entries(neqFilters)) out = out.filter((r) => r[k] !== v);
        for (const [k, v] of Object.entries(inFilters)) out = out.filter((r) => v.includes(r[k]));
        if (isNullCol) out = out.filter((r) => r[isNullCol!] == null);
        return out;
      }

      const builder: Record<string, unknown> = {
        select() {
          return builder;
        },
        eq(col: string, val: unknown) {
          eqFilters[col] = val;
          return builder;
        },
        neq(col: string, val: unknown) {
          neqFilters[col] = val;
          return builder;
        },
        in(col: string, vals: unknown[]) {
          inFilters[col] = vals;
          return builder;
        },
        is(col: string, val: unknown) {
          if (val === null) isNullCol = col;
          return builder;
        },
        not() {
          return builder;
        },
        gte() {
          return builder;
        },
        lte() {
          return builder;
        },
        limit() {
          return builder;
        },
        then(resolve: (v: { data: Row[]; error: null }) => void) {
          return resolve({ data: apply(), error: null });
        },
      };
      return builder;
    },
  };
}

const WINDOW = { workspaceId: WS, from: "2026-01-01", to: "2026-12-31" };

const BASE_TABLES: Tables = {
  bank_movements: [
    {
      id: "mov-energetia",
      workspace_id: WS,
      movement_date: "2026-07-20",
      amount: "15320.00",
      currency: "UYU",
      description: "TRANSFERENCIA RECIBIDA /ENERGETIA LIMITADA /COMERCIO",
      bank_reference: "TR0086095537",
      bank_name: "Santander",
      status: "pending",
      direction: "inflow",
    },
  ],
  proto_companies: [],
  proto_receipts: [],
  bank_movement_client_identifications: [],
  bank_movement_reconciliation_links: [],
  payment_allocations: [],
};

/** El token de cluster es derivado (normalizado), no se hardcodea: se descubre listando resúmenes. */
async function detailFor(client: unknown) {
  const summaries = await listPayerClusterSummaries(client as never, { ...WINDOW, page: 1, pageSize: 20 });
  const clusterKey = summaries.clusters[0]!.clusterKey;
  return getPayerClusterDetail(client as never, { ...WINDOW, clusterKey });
}

describe("BANK-RECONCILIATION-TRIAD-ALIGNMENT-001 — getPayerClusterDetail: nivel real, no hardcodeado", () => {
  it("caso ENERGETIA: sin cliente identificado, sin recibo → level unidentified", async () => {
    const client = fakeClient(BASE_TABLES);
    const result = await detailFor(client);
    expect(result).not.toBeNull();
    expect(result!.movements[0]!.level).toBe("unidentified");
    expect(result!.movements[0]!.hasFinancialLink).toBe(false);
  });

  it("cliente identificado + link financiero + SIN payment_allocations → reconciled_with_receipt (no full_reconciliation)", async () => {
    const client = fakeClient({
      ...BASE_TABLES,
      bank_movement_client_identifications: [
        { movement_id: "mov-energetia", client_company_id: "client-1", workspace_id: WS, status: "identified" },
      ],
      bank_movement_reconciliation_links: [
        { id: "link-1", bank_movement_id: "mov-energetia", workspace_id: WS, archived_at: null },
      ],
      payment_allocations: [],
    });
    const result = await detailFor(client);
    expect(result!.movements[0]!.level).toBe("reconciled_with_receipt");
  });

  it("cliente identificado + link financiero + payment_allocations activa → full_reconciliation", async () => {
    const client = fakeClient({
      ...BASE_TABLES,
      bank_movement_client_identifications: [
        { movement_id: "mov-energetia", client_company_id: "client-1", workspace_id: WS, status: "identified" },
      ],
      bank_movement_reconciliation_links: [
        { id: "link-1", bank_movement_id: "mov-energetia", workspace_id: WS, archived_at: null },
      ],
      payment_allocations: [
        { workspace_id: WS, reconciliation_link_id: "link-1", invoice_id: "inv-1", status: "active" },
      ],
    });
    const result = await detailFor(client);
    expect(result!.movements[0]!.level).toBe("full_reconciliation");
  });

  it("allocation con status<>active (anulada) no cuenta para full_reconciliation", async () => {
    const client = fakeClient({
      ...BASE_TABLES,
      bank_movement_client_identifications: [
        { movement_id: "mov-energetia", client_company_id: "client-1", workspace_id: WS, status: "identified" },
      ],
      bank_movement_reconciliation_links: [
        { id: "link-1", bank_movement_id: "mov-energetia", workspace_id: WS, archived_at: null },
      ],
      payment_allocations: [
        { workspace_id: WS, reconciliation_link_id: "link-1", invoice_id: "inv-1", status: "reversed" },
      ],
    });
    const result = await detailFor(client);
    expect(result!.movements[0]!.level).toBe("reconciled_with_receipt");
  });

  it("allocation de OTRO workspace no filtra por movimiento pero está excluida por workspace_id en la query", async () => {
    // La query real filtra .eq("workspace_id", workspaceId) antes de cruzar por reconciliation_link_id;
    // este test documenta que una allocation con workspace_id distinto nunca llega al Set.
    const client = fakeClient({
      ...BASE_TABLES,
      bank_movement_client_identifications: [
        { movement_id: "mov-energetia", client_company_id: "client-1", workspace_id: WS, status: "identified" },
      ],
      bank_movement_reconciliation_links: [
        { id: "link-1", bank_movement_id: "mov-energetia", workspace_id: WS, archived_at: null },
      ],
      payment_allocations: [
        { workspace_id: "other-ws", reconciliation_link_id: "link-1", invoice_id: "inv-1", status: "active" },
      ],
    });
    const result = await detailFor(client);
    expect(result!.movements[0]!.level).toBe("reconciled_with_receipt");
  });

  it("sin link financiero pero con allocation huérfana (no debería ocurrir) → allocation se ignora sin link", async () => {
    const client = fakeClient({
      ...BASE_TABLES,
      bank_movement_client_identifications: [
        { movement_id: "mov-energetia", client_company_id: "client-1", workspace_id: WS, status: "identified" },
      ],
      bank_movement_reconciliation_links: [],
      payment_allocations: [
        { workspace_id: WS, reconciliation_link_id: "link-ghost", invoice_id: "inv-1", status: "active" },
      ],
    });
    const result = await detailFor(client);
    expect(result!.movements[0]!.hasFinancialLink).toBe(false);
    expect(result!.movements[0]!.level).not.toBe("full_reconciliation");
  });
});
