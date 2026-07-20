import { describe, it, expect } from "vitest";

import {
  pickCurrentSuggestionForMovement,
  deriveIncomeRowStatus,
  buildIncomeWorkspaceCounters,
  buildIncomeWorkspaceRows,
  type IncomeWorkspaceRow,
} from "@/lib/bank/canonical/income-workspace";
import type { ShadowSuggestionRow } from "@/lib/bank/intelligence/server/types";
import type { CanonicalSuggestionEvidence } from "@/lib/bank/canonical/canonical-suggestion-evidence";

const WS = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

function suggestion(overrides: Partial<ShadowSuggestionRow>): ShadowSuggestionRow {
  return {
    id: "sugg-1",
    workspaceId: WS,
    bankMovementId: "mov-1",
    payerIdentityId: null,
    proposedClientId: null,
    proposedReceiptId: null,
    confidence: 60,
    reasons: [],
    warnings: [],
    recommendedAction: "REVIEW",
    engineVersion: 1,
    status: "generated",
    suggestionScope: "operational",
    confirmedLinkId: null,
    reviewedAt: null,
    reviewedBy: null,
    rejectedReason: null,
    createdAt: "2026-07-18T00:00:00Z",
    updatedAt: "2026-07-18T00:00:00Z",
    ...overrides,
  };
}

function evidence(overrides: Partial<CanonicalSuggestionEvidence>): CanonicalSuggestionEvidence {
  return {
    suggestionId: "sugg-1",
    status: "generated",
    confidenceScore: 60,
    confidenceLevel: "media",
    confidenceLabel: "Media",
    reasons: [],
    warnings: [],
    movement: { id: "mov-1", date: "2026-07-18", amount: 1000, currency: "UYU", descriptionMasked: "AB••••XY", accountLabel: null },
    payer: null,
    client: null,
    receipt: null,
    candidateInvoices: [],
    ...overrides,
  };
}

describe("pickCurrentSuggestionForMovement", () => {
  it("devuelve null si no hay sugerencias", () => {
    expect(pickCurrentSuggestionForMovement([])).toBeNull();
  });

  it("prioriza confirmed sobre cualquier otro estado", () => {
    const confirmed = suggestion({ id: "s-confirmed", status: "confirmed", createdAt: "2026-07-10T00:00:00Z" });
    const active = suggestion({ id: "s-active", status: "generated", createdAt: "2026-07-15T00:00:00Z" });
    expect(pickCurrentSuggestionForMovement([active, confirmed])!.id).toBe("s-confirmed");
  });

  it("prioriza rejected sobre generated/pending_review", () => {
    const rejected = suggestion({ id: "s-rejected", status: "rejected", createdAt: "2026-07-10T00:00:00Z" });
    const active = suggestion({ id: "s-active", status: "pending_review", createdAt: "2026-07-15T00:00:00Z" });
    expect(pickCurrentSuggestionForMovement([active, rejected])!.id).toBe("s-rejected");
  });

  it("entre varias activas, elige la más reciente por createdAt", () => {
    const older = suggestion({ id: "s-older", status: "generated", createdAt: "2026-07-10T00:00:00Z" });
    const newer = suggestion({ id: "s-newer", status: "pending_review", createdAt: "2026-07-15T00:00:00Z" });
    expect(pickCurrentSuggestionForMovement([older, newer])!.id).toBe("s-newer");
  });

  it("ignora superseded/expired si no hay ninguna otra sugerencia (se trata como sin sugerencia)", () => {
    const superseded = suggestion({ id: "s-superseded", status: "superseded" });
    const expired = suggestion({ id: "s-expired", status: "expired" });
    expect(pickCurrentSuggestionForMovement([superseded, expired])).toBeNull();
  });
});

describe("deriveIncomeRowStatus", () => {
  const movementActive = { bankMovementStatus: "pending" };
  const movementIgnored = { bankMovementStatus: "ignored" };

  it("ignorado tiene prioridad sobre cualquier evidencia", () => {
    expect(deriveIncomeRowStatus(movementIgnored, evidence({ status: "confirmed" }))).toBe("ignorado");
    expect(deriveIncomeRowStatus(movementIgnored, null)).toBe("ignorado");
  });

  it("sin evidencia -> sin_identificar", () => {
    expect(deriveIncomeRowStatus(movementActive, null)).toBe("sin_identificar");
  });

  it("evidencia confirmed -> conciliado", () => {
    expect(deriveIncomeRowStatus(movementActive, evidence({ status: "confirmed" }))).toBe("conciliado");
  });

  it("evidencia rejected -> sugerencia_rechazada", () => {
    expect(deriveIncomeRowStatus(movementActive, evidence({ status: "rejected" }))).toBe("sugerencia_rechazada");
  });

  it("cliente+recibo concretos, sin conflicto, sin warnings -> con_coincidencia AUNQUE la confianza sea Baja", () => {
    const ev = evidence({
      confidenceLevel: "baja",
      client: { id: "c1", name: "El País" },
      receipt: { id: "r1", amount: 20000, currency: "UYU", date: "2026-07-18", status: "paid" },
      warnings: [],
      payer: { identityId: "p1", maskedAccount: "•••• 1", normalizedName: "x", knownClientLinks: [], hasConflict: false },
    });
    expect(deriveIncomeRowStatus(movementActive, ev)).toBe("con_coincidencia");
  });

  it("sin cliente propuesto -> requiere_revision aunque no haya warnings", () => {
    const ev = evidence({ client: null, receipt: null });
    expect(deriveIncomeRowStatus(movementActive, ev)).toBe("requiere_revision");
  });

  it("con warnings (pagador con conflicto) -> requiere_revision aunque haya cliente y recibo", () => {
    const ev = evidence({
      client: { id: "c1", name: "El País" },
      receipt: { id: "r1", amount: 20000, currency: "UYU", date: "2026-07-18", status: "paid" },
      payer: { identityId: "p1", maskedAccount: "•••• 1", normalizedName: "x", knownClientLinks: [], hasConflict: true },
    });
    expect(deriveIncomeRowStatus(movementActive, ev)).toBe("requiere_revision");
  });

  it("con warnings explícitos (candidatos empatados) -> requiere_revision", () => {
    const ev = evidence({
      client: { id: "c1", name: "El País" },
      receipt: { id: "r1", amount: 20000, currency: "UYU", date: "2026-07-18", status: "paid" },
      warnings: ["hay varios candidatos igual de fuertes"],
    });
    expect(deriveIncomeRowStatus(movementActive, ev)).toBe("requiere_revision");
  });
});

describe("buildIncomeWorkspaceCounters", () => {
  function row(status: IncomeWorkspaceRow["status"]): IncomeWorkspaceRow {
    return {
      movement: { id: "m", date: "2026-07-18", amount: 1, currency: "UYU", descriptionMasked: "x", accountLabel: null, bankMovementStatus: "pending" },
      status,
      evidence: null,
    };
  }

  it("Pendientes agrupa con_coincidencia + requiere_revision + sin_identificar (nunca conciliado/rechazado/ignorado)", () => {
    const rows: IncomeWorkspaceRow[] = [
      row("con_coincidencia"),
      row("requiere_revision"),
      row("sin_identificar"),
      row("cliente_sugerido"),
      row("conciliado"),
      row("sugerencia_rechazada"),
      row("ignorado"),
    ];
    const counters = buildIncomeWorkspaceCounters(rows, 3);
    expect(counters.pendientes).toBe(4);
    expect(counters.conCoincidencia).toBe(1);
    expect(counters.requiereRevision).toBe(1);
    expect(counters.sinIdentificar).toBe(2);
    expect(counters.conciliadosHoy).toBe(3);
  });

  it("nunca cuenta un movimiento en dos buckets incompatibles (cada fila aporta a un solo bucket de Pendientes)", () => {
    const rows: IncomeWorkspaceRow[] = [row("con_coincidencia")];
    const counters = buildIncomeWorkspaceCounters(rows, 0);
    expect(counters.pendientes).toBe(1);
    expect(counters.conCoincidencia).toBe(1);
    expect(counters.requiereRevision).toBe(0);
    expect(counters.sinIdentificar).toBe(0);
  });
});

type Row = Record<string, unknown>;
type Tables = Record<string, Row[]>;

function fakeClient(tables: Tables) {
  return {
    from(table: string) {
      const rows = tables[table] ?? [];
      const eqFilters: Record<string, unknown> = {};
      const inFilters: Record<string, unknown[]> = {};
      let gtCol: string | null = null;
      let gtVal: number | null = null;
      function apply(): Row[] {
        let out = rows;
        for (const [k, v] of Object.entries(eqFilters)) out = out.filter((r) => r[k] === v);
        for (const [k, v] of Object.entries(inFilters)) out = out.filter((r) => v.includes(r[k]));
        if (gtCol) out = out.filter((r) => Number(r[gtCol!]) > (gtVal as number));
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
        in(col: string, vals: unknown[]) {
          inFilters[col] = vals;
          return builder;
        },
        gt(col: string, val: number) {
          gtCol = col;
          gtVal = val;
          return builder;
        },
        limit() {
          return builder;
        },
        maybeSingle() {
          const out = apply();
          return Promise.resolve({ data: out[0] ?? null, error: null });
        },
        then(resolve: (v: { data: Row[]; error: null }) => void) {
          return resolve({ data: apply(), error: null });
        },
      };
      return builder;
    },
  };
}

describe("buildIncomeWorkspaceRows — orquestación end-to-end (fake Supabase)", () => {
  it("cada movimiento aparece una sola vez; el conciliado usa la evidencia confirmed y no la generated vieja", () => {
    const client = fakeClient({
      bank_reconciliation_suggestions: [
        {
          id: "s-old",
          workspace_id: WS,
          bank_movement_id: "mov-1",
          payer_identity_id: null,
          proposed_client_id: null,
          proposed_receipt_id: null,
          confidence: 40,
          reasons: [],
          warnings: [],
          recommended_action: "REVIEW",
          engine_version: 1,
          status: "superseded",
          suggestion_scope: "operational",
          created_at: "2026-07-10T00:00:00Z",
          updated_at: "2026-07-10T00:00:00Z",
        },
        {
          id: "s-confirmed",
          workspace_id: WS,
          bank_movement_id: "mov-1",
          payer_identity_id: null,
          proposed_client_id: "client-1",
          proposed_receipt_id: "receipt-1",
          confidence: 90,
          reasons: [],
          warnings: [],
          recommended_action: "AUTO_RECONCILE_CANDIDATE",
          engine_version: 1,
          status: "confirmed",
          suggestion_scope: "operational",
          created_at: "2026-07-15T00:00:00Z",
          updated_at: "2026-07-15T00:00:00Z",
        },
      ],
      proto_companies: [{ id: "client-1", workspace_company_id: WS, name: "El País", is_active: true }],
      proto_receipts: [
        { id: "receipt-1", workspace_company_id: WS, company_id: "client-1", amount: 20000, currency_code: "UYU", receipt_date: "2026-07-18", status: "paid" },
      ],
      proto_invoices: [],
    });

    const movements = [
      {
        id: "mov-1",
        workspace_id: WS,
        bank_name: "Santander",
        account_label: "Cta UYU",
        movement_date: "2026-07-18",
        description: "TRANSFERENCIA EL PAIS",
        raw_description: "TRANSFERENCIA EL PAIS",
        amount: 20000,
        currency: "UYU",
        direction: "inflow" as const,
        bank_reference: null,
        status: "matched",
        metadata: {},
      },
      {
        id: "mov-2",
        workspace_id: WS,
        bank_name: "Santander",
        account_label: "Cta UYU",
        movement_date: "2026-07-19",
        description: "TRANSFERENCIA SIN IDENTIFICAR",
        raw_description: "TRANSFERENCIA SIN IDENTIFICAR",
        amount: 5000,
        currency: "UYU",
        direction: "inflow" as const,
        bank_reference: null,
        status: "pending",
        metadata: {},
      },
    ];

    return buildIncomeWorkspaceRows(client as never, WS, movements as never).then((rows) => {
      expect(rows).toHaveLength(2);
      const mov1 = rows.find((r) => r.movement.id === "mov-1")!;
      expect(mov1.status).toBe("conciliado");
      expect(mov1.evidence?.suggestionId).toBe("s-confirmed");
      const mov2 = rows.find((r) => r.movement.id === "mov-2")!;
      expect(mov2.status).toBe("sin_identificar");
      expect(mov2.evidence).toBeNull();
    });
  });
});
