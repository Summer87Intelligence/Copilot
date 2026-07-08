import { describe, expect, it } from "vitest";

import { loadClientPortfolioSourceRows } from "@/lib/data/proto-analytics-read-repository";
import type { OperationalSupabase } from "@/lib/data/supabase-operational-data";

type TableRows = {
  companies?: Record<string, unknown>[];
  invoices?: Record<string, unknown>[];
  receipts?: Record<string, unknown>[];
  contacts?: Record<string, unknown>[];
};

/**
 * Cliente mínimo PostgREST-like con soporte de `.range(from, to)` respaldado por arrays en
 * memoria — simula el comportamiento real de paginación de Supabase/PostgREST.
 */
function createPortfolioMock(tables: TableRows): OperationalSupabase {
  const byTable: Record<string, Record<string, unknown>[]> = {
    proto_companies: tables.companies ?? [],
    proto_invoices: tables.invoices ?? [],
    proto_receipts: tables.receipts ?? [],
    proto_contacts: tables.contacts ?? [],
  };

  const from = (table: string) => {
    if (table === "invoice_financials") {
      const fin: Record<string, unknown> = {};
      fin.select = () => fin;
      fin.limit = () => ({
        eq: () => Promise.resolve({ data: [], error: null }),
        in: () => Promise.resolve({ data: [], error: null }),
      });
      return fin;
    }

    const rows = byTable[table] ?? [];
    const self: Record<string, unknown> = {};
    const chain = () => self;
    self.select = chain;
    self.eq = chain;
    self.gte = chain;
    self.in = chain;
    self.order = chain;
    self.range = (from: number, to: number) =>
      Promise.resolve({ data: rows.slice(from, to + 1), error: null });
    return self;
  };

  return { from } as unknown as OperationalSupabase;
}

function makeContacts(n: number, companyId: string) {
  return Array.from({ length: n }, (_, i) => ({
    id: `contact-${i}`,
    company_id: companyId,
    is_active: true,
  }));
}

describe("loadClientPortfolioSourceRows", () => {
  it("trae todos los contactos aunque superen el cap fijo de 5000 (bug real: 7914 en un workspace)", async () => {
    const contacts = makeContacts(7914, "company-1");
    const client = createPortfolioMock({
      companies: [{ id: "company-1", name: "Acme" }],
      contacts,
    });

    const { ctRes, sourceLoadMeta } = await loadClientPortfolioSourceRows(client, "workspace-1");

    expect(ctRes.error).toBeNull();
    expect(ctRes.data).toHaveLength(7914);
    expect(sourceLoadMeta.contacts.rowsFetched).toBe(7914);
    expect(sourceLoadMeta.contacts.truncatedAtMaxRows).toBe(false);
    // Ningún contacto se pierde: el último id del set original sigue presente.
    const ids = new Set((ctRes.data ?? []).map((c) => c.id));
    expect(ids.has("contact-7913")).toBe(true);
  });

  it("no trunca companies/invoices/receipts por debajo del pageSize (caso normal, una sola página)", async () => {
    const client = createPortfolioMock({
      companies: [{ id: "c1", name: "Acme" }],
      invoices: [
        {
          id: "inv1",
          company_id: "c1",
          issue_date: "2026-01-01",
          balance_amount: 500,
          total_amount: 500,
        },
      ],
      receipts: [{ id: "r1", company_id: "c1", amount: 100 }],
      contacts: [{ id: "ct1", company_id: "c1" }],
    });

    const { cRes, iRes, rRes, ctRes, sourceLoadMeta } = await loadClientPortfolioSourceRows(
      client,
      "workspace-1"
    );

    expect(cRes.data).toHaveLength(1);
    expect(iRes.data).toHaveLength(1);
    expect(rRes.data).toHaveLength(1);
    expect(ctRes.data).toHaveLength(1);
    expect(sourceLoadMeta.companies.truncatedAtMaxRows).toBe(false);
    expect(sourceLoadMeta.invoices.truncatedAtMaxRows).toBe(false);
    expect(sourceLoadMeta.receipts.truncatedAtMaxRows).toBe(false);
  });

  it("mantiene el shape { data, error } esperado por getClientPortfolio para cada tabla", async () => {
    const client = createPortfolioMock({});
    const result = await loadClientPortfolioSourceRows(client, "workspace-1");

    expect(result).toHaveProperty("cRes.data");
    expect(result).toHaveProperty("cRes.error");
    expect(result).toHaveProperty("iRes.data");
    expect(result).toHaveProperty("rRes.data");
    expect(result).toHaveProperty("ctRes.data");
    expect(result).toHaveProperty("sourceLoadMeta.contacts");
  });
});
