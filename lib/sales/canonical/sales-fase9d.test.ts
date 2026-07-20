/**
 * FASE 9D — tests de atribución comercial por cliente (historial temporal).
 * Puros: sin I/O.
 */

import { describe, expect, it } from "vitest";

import {
  resolveClientSalespersonOnDate,
  currentClientSalespersonMap,
  countAssignedCustomersBySalesperson,
  type ClientSalespersonAssignmentRow,
} from "@/lib/sales/sales-client-salesperson-repository";
import { SALESPERSON_START_DATE } from "@/lib/sales/canonical/types";
import {
  buildSalesPeriodSnapshot,
  buildCustomerSalesSummary,
  buildSalespersonSummary,
  buildProductSalesSummary,
} from "@/lib/sales/canonical/sales-aggregations";
import type { CanonicalSaleDocument } from "@/lib/sales/canonical/types";

function asg(
  partial: Partial<ClientSalespersonAssignmentRow> &
    Pick<ClientSalespersonAssignmentRow, "customerId" | "salespersonId" | "validFrom">
): ClientSalespersonAssignmentRow {
  return {
    id: partial.id ?? "a1",
    customerId: partial.customerId,
    salespersonId: partial.salespersonId,
    validFrom: partial.validFrom,
    validTo: partial.validTo ?? null,
    assignedAt: partial.assignedAt ?? "2026-07-01T00:00:00Z",
  };
}

describe("resolveClientSalespersonOnDate", () => {
  const history = [
    asg({ id: "1", customerId: "c1", salespersonId: "camila", validFrom: "2026-07-01", validTo: "2026-07-14" }),
    asg({ id: "2", customerId: "c1", salespersonId: "daniel", validFrom: "2026-07-15", validTo: null }),
  ];

  it("returns null before SALESPERSON_START_DATE", () => {
    expect(resolveClientSalespersonOnDate(history, "c1", "2026-06-30")).toBeNull();
  });

  it("returns Camila during her validity window", () => {
    expect(resolveClientSalespersonOnDate(history, "c1", "2026-07-01")).toBe("camila");
    expect(resolveClientSalespersonOnDate(history, "c1", "2026-07-14")).toBe("camila");
  });

  it("returns Daniel after reassignment without rewriting prior window", () => {
    expect(resolveClientSalespersonOnDate(history, "c1", "2026-07-15")).toBe("daniel");
    expect(resolveClientSalespersonOnDate(history, "c1", "2026-08-01")).toBe("daniel");
    // histórico intacto
    expect(resolveClientSalespersonOnDate(history, "c1", "2026-07-10")).toBe("camila");
  });

  it("returns null for unknown customer or null id", () => {
    expect(resolveClientSalespersonOnDate(history, "other", "2026-07-20")).toBeNull();
    expect(resolveClientSalespersonOnDate(history, null, "2026-07-20")).toBeNull();
  });

  it("currentClientSalespersonMap only keeps open assignments", () => {
    const map = currentClientSalespersonMap(history);
    expect(map.get("c1")).toBe("daniel");
    expect(map.size).toBe(1);
  });

  it("countAssignedCustomersBySalesperson counts open only", () => {
    const counts = countAssignedCustomersBySalesperson(history);
    expect(counts.get("daniel")).toBe(1);
    expect(counts.get("camila")).toBeUndefined();
  });

  it("exposes SALESPERSON_START_DATE as 2026-07-01", () => {
    expect(SALESPERSON_START_DATE).toBe("2026-07-01");
  });
});

function doc(partial: Partial<CanonicalSaleDocument> & Pick<CanonicalSaleDocument, "documentId" | "kind" | "currency" | "grossAmount" | "issueDate">): CanonicalSaleDocument {
  return {
    workspaceId: "ws",
    documentId: partial.documentId,
    externalId: null,
    kind: partial.kind,
    documentType: partial.kind === "credit_note" ? "NC" : "e-Factura",
    cfeTipo: partial.kind === "credit_note" ? 102 : 101,
    documentNumber: "1",
    customerId: partial.customerId ?? "c1",
    customerCode: "C1",
    customerName: partial.customerName ?? "Cliente QA",
    issueDate: partial.issueDate,
    dueDate: null,
    currency: partial.currency,
    grossAmount: partial.grossAmount,
    appliedAmount: 0,
    registeredAmount: 0,
    pendingAmount: partial.grossAmount,
    status: partial.status ?? "valid",
    salespersonId: partial.salespersonId ?? null,
    salespersonName: partial.salespersonName ?? null,
    sellerId: partial.sellerId ?? null,
    sellerName: partial.sellerName ?? null,
    lines: partial.lines ?? [
      {
        lineId: `${partial.documentId}-l1`,
        documentId: partial.documentId,
        originalCode: null,
        originalDescription: "Servicio QA",
        originalConcept: "Servicio QA",
        canonicalProductId: null,
        canonicalProductName: null,
        canonicalCategoryId: null,
        canonicalCategoryName: null,
        displayProductName: "Servicio QA",
        productGroupKey: "svc:qa",
        normalizationStatus: "original",
        classificationStatus: "unclassified",
        classificationSource: "zeta_concept",
        quantity: 1,
        unitPrice: partial.grossAmount,
        lineAmount: partial.grossAmount,
        netAmount: null,
        taxAmount: null,
        currency: partial.currency,
        synthetic: false,
      },
    ],
  };
}

describe("net sales + NC + client commercial inheritance", () => {
  it("allows negative net when NC exceed emitted", () => {
    const docs = [
      doc({ documentId: "s1", kind: "sale", currency: "USD", grossAmount: 100, issueDate: "2026-07-10" }),
      doc({ documentId: "n1", kind: "credit_note", currency: "USD", grossAmount: 250, issueDate: "2026-07-12" }),
    ];
    const snap = buildSalesPeriodSnapshot(docs, "2026-07-01", "2026-07-31");
    expect(snap.salesEmitted.USD).toBe(100);
    expect(snap.creditNotes.USD).toBe(250);
    expect(snap.netSalesByCurrency.USD).toBe(-150);
    expect(snap.invoiceCount).toBe(1);
    expect(snap.creditNoteCount).toBe(1);
  });

  it("NC alone does not create a buying customer or product row", () => {
    const docs = [
      doc({ documentId: "n1", kind: "credit_note", currency: "UYU", grossAmount: 500, issueDate: "2026-07-12", customerId: "only-nc" }),
    ];
    const customers = buildCustomerSalesSummary(docs, "2026-07-01", "2026-07-31");
    const products = buildProductSalesSummary(docs, "2026-07-01", "2026-07-31");
    expect(customers).toHaveLength(0);
    expect(products).toHaveLength(0);
    const snap = buildSalesPeriodSnapshot(docs, "2026-07-01", "2026-07-31");
    expect(snap.newCustomers + snap.recurringCustomers).toBe(0);
  });

  it("attributes NC Case B to the salesperson inherited on the document", () => {
    const docs = [
      doc({
        documentId: "s1",
        kind: "sale",
        currency: "USD",
        grossAmount: 1000,
        issueDate: "2026-07-10",
        salespersonId: "camila",
        salespersonName: "Camila",
      }),
      doc({
        documentId: "n1",
        kind: "credit_note",
        currency: "USD",
        grossAmount: 200,
        issueDate: "2026-07-12",
        salespersonId: "camila",
        salespersonName: "Camila",
      }),
    ];
    const people = buildSalespersonSummary(docs, "2026-07-01", "2026-07-31");
    const camila = people.find((p) => p.salespersonId === "camila");
    expect(camila).toBeTruthy();
    expect(camila!.salesByCurrency.USD).toBe(1000);
    expect(camila!.creditNotesByCurrency.USD).toBe(200);
    expect(camila!.netSalesByCurrency.USD).toBe(800);
    expect(camila!.invoiceCount).toBe(1);
  });
});
