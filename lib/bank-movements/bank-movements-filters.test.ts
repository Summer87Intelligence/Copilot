import { describe, expect, it } from "vitest";

import {
  computeReconciliationFilteredMeta,
  DEFAULT_BANK_MOVEMENTS_LIST_FILTERS,
  DEFAULT_RECONCILIATION_VIEW_FILTERS,
  filterBankMovements,
  filterReconciliationItems,
  isBankMovementsListFiltersActive,
  isReconciliationViewFiltersActive,
  matchesMovementPeriod,
  movementMatchesAmountSearch,
  movementMatchesTextSearch,
  normalizeAmountSearch,
  reconciliationApiStatusFromSuggestion,
  reconciliationItemMatchesTextSearch,
} from "@/lib/bank-movements/bank-movements-filters";
import type { BankMovement } from "@/lib/bank-movements/bank-movements-types";

function movement(partial: Partial<BankMovement> & Pick<BankMovement, "description" | "amount">): BankMovement {
  return {
    id: partial.id ?? "m1",
    workspace_id: "ws",
    import_id: null,
    bank_name: "Santander",
    account_label: partial.account_label ?? "Santander UYU",
    movement_date: partial.movement_date ?? "2026-07-06",
    description: partial.description,
    raw_description: partial.raw_description ?? null,
    amount: partial.amount,
    currency: partial.currency ?? "UYU",
    direction: partial.direction ?? "outflow",
    bank_reference: partial.bank_reference ?? null,
    status: partial.status ?? "pending",
    matched_type: null,
    matched_id: null,
    matched_confidence: null,
    matched_by: null,
    matched_at: null,
    metadata: partial.metadata ?? null,
    created_at: "2026-07-01T00:00:00Z",
    updated_at: "2026-07-01T00:00:00Z",
  };
}

const julyNow = new Date("2026-07-09T12:00:00");

describe("bank-movements-filters helpers", () => {
  describe("normalizeAmountSearch", () => {
    it("acepta enteros y decimales comunes", () => {
      expect(normalizeAmountSearch("3548")).toBe(3548);
      expect(normalizeAmountSearch("3.548")).toBe(3548);
      expect(normalizeAmountSearch("3,548")).toBe(3548);
      expect(normalizeAmountSearch("3548,00")).toBe(3548);
      expect(normalizeAmountSearch("3548.00")).toBe(3548);
      expect(normalizeAmountSearch("1.375")).toBe(1375);
    });

    it("devuelve null para vacío o inválido", () => {
      expect(normalizeAmountSearch("")).toBeNull();
      expect(normalizeAmountSearch("abc")).toBeNull();
    });
  });

  describe("movementMatchesAmountSearch", () => {
    it("encuentra Movistar 3.548 contra búsqueda 3548", () => {
      const mov = movement({
        description: "MOVISTAR",
        amount: 3.548,
        metadata: { debit: 3.548 },
      });
      expect(movementMatchesAmountSearch(mov, 3548)).toBe(true);
      expect(movementMatchesAmountSearch(mov, 3.548)).toBe(true);
    });
  });

  describe("filterBankMovements", () => {
    const rows = [
      movement({ id: "uyu", description: "MOVISTAR", amount: 3.55, currency: "UYU", movement_date: "2026-07-06", metadata: { parser: "santander_excel_consolidated_v1", debit: 3.548 } }),
      movement({ id: "usd", description: "AMAZON", amount: 120, currency: "USD", movement_date: "2026-06-15" }),
      movement({
        id: "bse",
        description: "BSE SEGURO",
        amount: 1.375,
        currency: "UYU",
        movement_date: "2026-07-03",
        bank_reference: "REF-123",
      }),
      movement({
        id: "matched",
        description: "PAGO",
        amount: 100,
        status: "matched",
        movement_date: "2026-07-01",
      }),
    ];

    it("filtra por UYU", () => {
      const result = filterBankMovements(rows, { ...DEFAULT_BANK_MOVEMENTS_LIST_FILTERS, currency: "UYU" }, julyNow);
      expect(result.map((row) => row.id)).toEqual(["uyu", "bse", "matched"]);
    });

    it("filtra por USD", () => {
      // scope: "all" para incluir el movimiento histórico de junio en el test de moneda.
      const result = filterBankMovements(rows, { ...DEFAULT_BANK_MOVEMENTS_LIST_FILTERS, scope: "all", currency: "USD" }, julyNow);
      expect(result.map((row) => row.id)).toEqual(["usd"]);
    });

    it("filtra por mes", () => {
      // Junio es histórico: scope "all" para probar el filtro de período en aislamiento.
      const result = filterBankMovements(
        rows,
        { ...DEFAULT_BANK_MOVEMENTS_LIST_FILTERS, scope: "all", period: "2026-06" },
        julyNow
      );
      expect(result.map((row) => row.id)).toEqual(["usd"]);
    });

    it("busca por descripción", () => {
      const result = filterBankMovements(rows, { ...DEFAULT_BANK_MOVEMENTS_LIST_FILTERS, text: "movistar" }, julyNow);
      expect(result.map((row) => row.id)).toEqual(["uyu"]);
    });

    it("busca por referencia", () => {
      const result = filterBankMovements(rows, { ...DEFAULT_BANK_MOVEMENTS_LIST_FILTERS, text: "REF-123" }, julyNow);
      expect(result.map((row) => row.id)).toEqual(["bse"]);
    });

    it("busca por monto 3548", () => {
      const result = filterBankMovements(rows, { ...DEFAULT_BANK_MOVEMENTS_LIST_FILTERS, amount: "3548" }, julyNow);
      expect(result.map((row) => row.id)).toEqual(["uyu"]);
    });

    it("filtra por rango de importe mínimo/máximo", () => {
      const mid = movement({ id: "mid", description: "MEDIO", amount: 500, currency: "UYU", movement_date: "2026-07-05" });
      const high = movement({ id: "high", description: "ALTO", amount: 5000, currency: "UYU", movement_date: "2026-07-05" });
      const set = [...rows, mid, high];
      const result = filterBankMovements(
        set,
        { ...DEFAULT_BANK_MOVEMENTS_LIST_FILTERS, amountMin: "100", amountMax: "1000" },
        julyNow
      );
      // usd (120) entra al rango; ahora es operativo (fecha 2026-06-15 ≥ corte 2026-01-01).
      expect(result.map((row) => row.id).sort()).toEqual(["matched", "mid", "usd"]);
    });

    it("filtra por fuente PDF/Excel y por duplicados", () => {
      const pdf = movement({
        id: "pdf1",
        description: "PDF",
        amount: 10,
        movement_date: "2026-07-05",
        metadata: { parser: "santander_pdf_v1" },
      });
      const resultSource = filterBankMovements(
        [...rows, pdf],
        { ...DEFAULT_BANK_MOVEMENTS_LIST_FILTERS, source: "pdf" },
        julyNow
      );
      expect(resultSource.map((r) => r.id)).toEqual(["pdf1"]);

      const resultDup = filterBankMovements(
        [...rows, pdf],
        { ...DEFAULT_BANK_MOVEMENTS_LIST_FILTERS, duplicates: "only" },
        julyNow,
        { pdf1: { canonicalMovementId: "uyu" } }
      );
      expect(resultDup.map((r) => r.id)).toEqual(["pdf1"]);
    });

    it("filtra por estado pendiente", () => {
      const result = filterBankMovements(rows, { ...DEFAULT_BANK_MOVEMENTS_LIST_FILTERS, status: "pending" }, julyNow);
      expect(result.every((row) => row.status === "pending")).toBe(true);
    });

    it("detecta filtros activos y limpia al default", () => {
      const active = { ...DEFAULT_BANK_MOVEMENTS_LIST_FILTERS, text: "BSE" };
      expect(isBankMovementsListFiltersActive(active)).toBe(true);
      expect(isBankMovementsListFiltersActive(DEFAULT_BANK_MOVEMENTS_LIST_FILTERS)).toBe(false);
    });

    it("filtra por dateRange del contexto ignorando filters.period", () => {
      const rows = [
        movement({ id: "in", description: "IN", amount: 10, movement_date: "2026-07-05" }),
        movement({ id: "out", description: "OUT", amount: 10, movement_date: "2026-06-01" }),
      ];
      const result = filterBankMovements(
        rows,
        { ...DEFAULT_BANK_MOVEMENTS_LIST_FILTERS, scope: "all", period: "2026-06" },
        julyNow,
        undefined,
        { dateRange: { from: "2026-07-01", to: "2026-07-31" } }
      );
      expect(result.map((r) => r.id)).toEqual(["in"]);
    });

    it("filtra por clientPresence with/without", () => {
      const rows = [
        movement({ id: "a", description: "A", amount: 10 }),
        movement({ id: "b", description: "B", amount: 20 }),
      ];
      const clients = {
        a: { clientName: "Acme SA" },
        b: { clientName: null },
      };
      const withClient = filterBankMovements(
        rows,
        { ...DEFAULT_BANK_MOVEMENTS_LIST_FILTERS, clientPresence: "with" },
        julyNow,
        undefined,
        { clientsByMovementId: clients }
      );
      expect(withClient.map((r) => r.id)).toEqual(["a"]);

      const withoutClient = filterBankMovements(
        rows,
        { ...DEFAULT_BANK_MOVEMENTS_LIST_FILTERS, clientPresence: "without" },
        julyNow,
        undefined,
        { clientsByMovementId: clients }
      );
      expect(withoutClient.map((r) => r.id)).toEqual(["b"]);
    });

    it("filtra por simpleStates usando levels", () => {
      const rows = [
        movement({ id: "sin", description: "SIN", amount: 10, direction: "inflow", status: "pending" }),
        movement({ id: "asoc", description: "ASOC", amount: 20, direction: "inflow", status: "pending" }),
      ];
      const result = filterBankMovements(
        rows,
        { ...DEFAULT_BANK_MOVEMENTS_LIST_FILTERS, simpleStates: "asociado" },
        julyNow,
        undefined,
        { levels: { asoc: "client_identified" } }
      );
      expect(result.map((r) => r.id)).toEqual(["asoc"]);
    });

    it("busca por nombre de cliente vía contexto", () => {
      const rows = [movement({ id: "m1", description: "PAGO", amount: 100 })];
      const result = filterBankMovements(
        rows,
        { ...DEFAULT_BANK_MOVEMENTS_LIST_FILTERS, text: "botica" },
        julyNow,
        undefined,
        { clientsByMovementId: { m1: { clientName: "Botica del Señor SRL" } } }
      );
      expect(result.map((r) => r.id)).toEqual(["m1"]);
    });
  });

  describe("filterReconciliationItems", () => {
    const items = [
      {
        movement: movement({ id: "movistar", description: "MOVISTAR", amount: 3.55, movement_date: "2026-07-06", metadata: { parser: "santander_excel_consolidated_v1", debit: 3.548 } }),
        suggestions: [
          {
            target_type: "planned_cash_obligation" as const,
            target_id: "o1",
            confidence: "high" as const,
            score: 80,
            reasons: ["Monto similar"],
            movement: movement({ description: "MOVISTAR", amount: 3.548 }),
            target: {
              id: "o1",
              title: "Movistar — Celulares corporativos",
              description: null,
              amount_estimated: 3548,
              currency_code: "UYU",
              due_date: "2026-07-06",
              direction: "outflow",
              status: "paid",
              notes: null,
              obligation_type: "service",
            },
          },
        ],
      },
      {
        movement: movement({ id: "mcd", description: "MCDONALDS", amount: 184, movement_date: "2026-07-05" }),
        suggestions: [],
      },
      {
        movement: movement({
          id: "matched",
          description: "BSE",
          amount: 1375,
          status: "matched",
          movement_date: "2026-07-03",
        }),
        suggestions: [],
      },
    ];

    it("default mes actual filtra julio", () => {
      const juneItem = {
        movement: movement({ id: "june", description: "JUNIO", amount: 10, movement_date: "2026-06-30" }),
        suggestions: [],
      };
      const result = filterReconciliationItems(
        [...items, juneItem],
        DEFAULT_RECONCILIATION_VIEW_FILTERS,
        julyNow
      );
      expect(result.some((item) => item.movement.id === "june")).toBe(false);
      expect(result.some((item) => item.movement.id === "movistar")).toBe(true);
    });

    it("filtra con sugerencia incluyendo high/medium/low", () => {
      const lowItem = {
        movement: movement({ id: "low", description: "OTRO", amount: 100, movement_date: "2026-07-05" }),
        suggestions: [
          {
            target_type: "planned_cash_obligation" as const,
            target_id: "o-low",
            confidence: "low" as const,
            score: 40,
            reasons: [],
            movement: movement({ description: "OTRO", amount: 100 }),
            target: {
              id: "o-low",
              title: "Otro pago",
              description: null,
              amount_estimated: 100,
              currency_code: "UYU",
              due_date: "2026-07-05",
              direction: "outflow",
              status: "planned",
              notes: null,
              obligation_type: "service",
            },
          },
        ],
      };
      const result = filterReconciliationItems(
        [...items, lowItem],
        { ...DEFAULT_RECONCILIATION_VIEW_FILTERS, suggestion: "with_suggestion" },
        julyNow
      );
      expect(result.map((item) => item.movement.id)).toEqual(["movistar", "low"]);
      expect(result.some((item) => item.movement.id === "mcd")).toBe(false);
    });

    it("con sugerencia excluye conciliados e ignorados", () => {
      const ignored = {
        movement: movement({
          id: "ignored",
          description: "IGN",
          amount: 10,
          status: "ignored",
          movement_date: "2026-07-04",
        }),
        suggestions: [{ target_type: "planned_cash_obligation" as const, target_id: "x", confidence: "high" as const, score: 90, reasons: [], movement: movement({ description: "IGN", amount: 10 }), target: { id: "x", title: "X", description: null, amount_estimated: 10, currency_code: "UYU", due_date: "2026-07-04", direction: "outflow", status: "planned", notes: null, obligation_type: "service" } }],
      };
      const result = filterReconciliationItems(
        [...items, ignored],
        { ...DEFAULT_RECONCILIATION_VIEW_FILTERS, suggestion: "with_suggestion" },
        julyNow
      );
      expect(result.some((item) => item.movement.id === "ignored")).toBe(false);
      expect(result.some((item) => item.movement.id === "matched")).toBe(false);
    });

    it("ordena con sugerencia: high antes que low", () => {
      const lowItem = {
        movement: movement({ id: "low", description: "OTRO", amount: 100, movement_date: "2026-07-05" }),
        suggestions: [
          {
            target_type: "planned_cash_obligation" as const,
            target_id: "o-low",
            confidence: "low" as const,
            score: 40,
            reasons: [],
            movement: movement({ description: "OTRO", amount: 100 }),
            target: {
              id: "o-low",
              title: "Otro pago",
              description: null,
              amount_estimated: 100,
              currency_code: "UYU",
              due_date: "2026-07-05",
              direction: "outflow",
              status: "planned",
              notes: null,
              obligation_type: "service",
            },
          },
        ],
      };
      const result = filterReconciliationItems(
        [...items, lowItem],
        { ...DEFAULT_RECONCILIATION_VIEW_FILTERS, suggestion: "with_suggestion" },
        julyNow
      );
      expect(result[0]?.movement.id).toBe("movistar");
      expect(result[1]?.movement.id).toBe("low");
    });

    it("todos sigue mostrando sin sugerencia", () => {
      const result = filterReconciliationItems(
        items,
        { ...DEFAULT_RECONCILIATION_VIEW_FILTERS, suggestion: "all" },
        julyNow
      );
      expect(result.some((item) => item.movement.id === "mcd")).toBe(true);
    });

    it("filtra alta confianza", () => {
      const result = filterReconciliationItems(
        items,
        { ...DEFAULT_RECONCILIATION_VIEW_FILTERS, suggestion: "high" },
        julyNow
      );
      expect(result).toHaveLength(1);
      expect(result[0]?.movement.id).toBe("movistar");
    });

    it("filtra sin sugerencia", () => {
      const result = filterReconciliationItems(
        items,
        { ...DEFAULT_RECONCILIATION_VIEW_FILTERS, suggestion: "none" },
        julyNow
      );
      expect(result.map((item) => item.movement.id)).toEqual(["mcd"]);
    });

    it("busca por texto de movimiento", () => {
      const result = filterReconciliationItems(
        items,
        { ...DEFAULT_RECONCILIATION_VIEW_FILTERS, suggestion: "all", text: "mcdonald" },
        julyNow
      );
      expect(result).toHaveLength(1);
    });

    it("busca por título sugerido", () => {
      const result = filterReconciliationItems(
        items,
        { ...DEFAULT_RECONCILIATION_VIEW_FILTERS, text: "celulares" },
        julyNow
      );
      expect(result).toHaveLength(1);
      expect(result[0]?.movement.id).toBe("movistar");
    });

    it("busca por monto", () => {
      const result = filterReconciliationItems(
        items,
        { ...DEFAULT_RECONCILIATION_VIEW_FILTERS, amount: "3548" },
        julyNow
      );
      expect(result).toHaveLength(1);
    });

    it("filtra por moneda", () => {
      const usdItem = {
        movement: movement({
          id: "usd",
          description: "AMAZON",
          amount: 20,
          currency: "USD",
          movement_date: "2026-07-04",
        }),
        suggestions: [],
      };
      const result = filterReconciliationItems(
        [...items, usdItem],
        { ...DEFAULT_RECONCILIATION_VIEW_FILTERS, suggestion: "all", currency: "USD" },
        julyNow
      );
      expect(result).toHaveLength(1);
      expect(result[0]?.movement.id).toBe("usd");
    });

    it("mapea estado API para conciliados", () => {
      expect(reconciliationApiStatusFromSuggestion("matched")).toBe("matched");
      expect(reconciliationApiStatusFromSuggestion("ignored")).toBe("ignored");
      expect(reconciliationApiStatusFromSuggestion("high")).toBe("pending");
    });

    it("calcula meta del subconjunto filtrado", () => {
      const meta = computeReconciliationFilteredMeta(items);
      expect(meta.pending_count).toBe(2);
      expect(meta.with_high_confidence).toBe(1);
      expect(meta.without_suggestions).toBe(2);
      expect(meta.matched_count).toBe(1);
    });

    it("detecta filtros activos", () => {
      expect(
        isReconciliationViewFiltersActive({
          ...DEFAULT_RECONCILIATION_VIEW_FILTERS,
          suggestion: "high",
        })
      ).toBe(true);
      expect(isReconciliationViewFiltersActive(DEFAULT_RECONCILIATION_VIEW_FILTERS)).toBe(false);
    });
  });

  describe("matchesMovementPeriod", () => {
    it("mes actual usa fecha de referencia", () => {
      expect(matchesMovementPeriod("2026-07-06", "current", julyNow)).toBe(true);
      expect(matchesMovementPeriod("2026-06-15", "current", julyNow)).toBe(false);
    });
  });

  describe("movementMatchesTextSearch", () => {
    it("busca en account_label", () => {
      expect(
        movementMatchesTextSearch(
          movement({ description: "X", amount: 1, account_label: "Cuenta Corriente UYU" }),
          "corriente"
        )
      ).toBe(true);
    });

    it("busca en monto, pagador y cuenta enmascarada", () => {
      expect(
        movementMatchesTextSearch(
          movement({
            description: "X",
            amount: 3548,
            metadata: {
              payer_name_raw: "ZETASOFTWARE S.A.",
              payer_name_normalized: "ZETASOFTWARE SA",
              masked_account: "••••4821",
            },
          }),
          "3548"
        )
      ).toBe(true);
      expect(
        movementMatchesTextSearch(
          movement({
            description: "X",
            amount: 100,
            metadata: { payer_name_normalized: "ENERGETIA" },
          }),
          "energetia"
        )
      ).toBe(true);
      expect(
        movementMatchesTextSearch(
          movement({
            description: "X",
            amount: 100,
            metadata: { masked_account: "••••4821" },
          }),
          "4821"
        )
      ).toBe(true);
    });

    it("acepta extraHaystack (cliente)", () => {
      expect(
        movementMatchesTextSearch(movement({ description: "PAGO", amount: 100 }), "acme", ["Acme Corp"])
      ).toBe(true);
    });
  });

  describe("reconciliationItemMatchesTextSearch", () => {
    it("busca en razones de sugerencia", () => {
      expect(
        reconciliationItemMatchesTextSearch(
          {
            movement: movement({ description: "X", amount: 1 }),
            suggestions: [
              {
                target_type: "planned_cash_obligation",
                target_id: "o1",
                confidence: "high",
                score: 80,
                reasons: ["Monto similar"],
                movement: movement({ description: "X", amount: 1 }),
                target: {
                  id: "o1",
                  title: "Proveedor",
                  description: null,
                  amount_estimated: 100,
                  currency_code: "UYU",
                  due_date: "2026-07-06",
                  direction: "outflow",
                  status: "paid",
                  notes: null,
                  obligation_type: "service",
                },
              },
            ],
          },
          "similar"
        )
      ).toBe(true);
    });
  });
});
