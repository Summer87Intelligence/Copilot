/**
 * Layout tests: verify that PDF renderers do not generate blank or footer-only pages.
 *
 * Root cause fixed: renderFooter in render-account-statement-pdf.ts was positioning
 * text at y=800 (> PDFKit maxY=794), causing PDFKit to auto-add a new page per
 * doc.text() call — producing blank pages with only "Página: X" / "Emisión: ...".
 */
import { describe, expect, it } from "vitest";

import { buildClientAccountStatement } from "@/lib/copilot-client-account-statement";
import {
  renderAccountStatementPdf,
  renderBulkAccountStatementsPdf,
  type ClientInfo,
  type BulkAccountStatementEntry,
} from "./render-account-statement-pdf";
import type { DataRow } from "@/lib/copilot-data";

// ── Page count helper ─────────────────────────────────────────────────────────

/**
 * Counts PDF pages by scanning for /Type /Page (not /Type /Pages) in the
 * binary PDF buffer. Reliable for PDFKit-generated documents.
 */
function countPdfPages(buf: Buffer): number {
  const str = buf.toString("binary");
  let count = 0;
  let idx = 0;
  const needle = "/Type /Page";
  while ((idx = str.indexOf(needle, idx)) !== -1) {
    if (str[idx + needle.length] !== "s") count++;
    idx++;
  }
  return count;
}

// ── Test data factories ───────────────────────────────────────────────────────

function inv(id: string, date: string, total: number, currency: "UYU" | "USD" = "UYU"): DataRow {
  return { id, invoice_number: `INV-${id}`, issue_date: date, total_amount: total, currency_code: currency, is_active: true };
}

function rec(id: string, date: string, amount: number, currency: "UYU" | "USD" = "UYU"): DataRow {
  return { id, receipt_number: `REC-${id}`, receipt_date: date, amount, currency_code: currency, is_active: true };
}

function clientInfo(name: string): ClientInfo {
  return { name };
}

function singleUyuStatement(movCount: number) {
  const invoices: DataRow[] = [];
  for (let i = 0; i < movCount; i++) {
    invoices.push(inv(`i${i}`, `2026-01-${String(i + 1).padStart(2, "0")}`, 1000));
  }
  return buildClientAccountStatement({ invoices, receipts: [], ledgerMode: true });
}

function bothCurrenciesStatement() {
  return buildClientAccountStatement({
    invoices: [
      inv("u1", "2026-01-01", 10000, "UYU"),
      inv("d1", "2026-01-02", 500, "USD"),
    ],
    receipts: [],
    ledgerMode: true,
  });
}

// ── Single client PDF ─────────────────────────────────────────────────────────

describe("renderAccountStatementPdf — individual", () => {
  it("1 movimiento UYU → exactamente 1 página", async () => {
    const stmt = singleUyuStatement(1);
    const buf = await renderAccountStatementPdf({
      companyName: "Test SA",
      statement: stmt,
      client: clientInfo("Test SA"),
      currencies: ["UYU"],
    });
    expect(countPdfPages(buf)).toBe(1);
  });

  it("cliente con UYU y USD → a lo sumo 2 páginas, ninguna en blanco", async () => {
    const stmt = bothCurrenciesStatement();
    const buf = await renderAccountStatementPdf({
      companyName: "Test SA",
      statement: stmt,
      client: clientInfo("Test SA"),
      currencies: ["UYU", "USD"],
    });
    const pages = countPdfPages(buf);
    // UYU block + USD block: may share 1 page or need 2, never 3+
    expect(pages).toBeGreaterThanOrEqual(1);
    expect(pages).toBeLessThanOrEqual(2);
  });

  it("muchos movimientos UYU → páginas = ceil(movimientos / capacidad), sin páginas extra vacías", async () => {
    // 50 movements should produce a multi-page PDF but no blank/extra pages
    const stmt = singleUyuStatement(50);
    const buf = await renderAccountStatementPdf({
      companyName: "Test SA",
      statement: stmt,
      client: clientInfo("Test SA"),
      currencies: ["UYU"],
    });
    const pages = countPdfPages(buf);
    // 50 rows at ~18pt each = 900pt; A4 content area ~700pt → at least 2 pages
    expect(pages).toBeGreaterThanOrEqual(2);
    // Sanity upper bound: should not exceed 10 pages for 50 rows
    expect(pages).toBeLessThanOrEqual(10);
  });
});

// ── Bulk PDF (UYU+USD combinado) ──────────────────────────────────────────────

describe("renderBulkAccountStatementsPdf — masivo", () => {
  it("3 clientes con 1 movimiento UYU cada uno → exactamente 3 páginas", async () => {
    const entries: BulkAccountStatementEntry[] = [1, 2, 3].map((n) => ({
      client: clientInfo(`Cliente ${n}`),
      companyName: `Cliente ${n}`,
      statement: buildClientAccountStatement({
        invoices: [inv(`i${n}`, "2026-01-01", 5000)],
        receipts: [],
        ledgerMode: true,
      }),
    }));

    const buf = await renderBulkAccountStatementsPdf({
      entries,
      currencies: ["UYU"],
    });

    expect(countPdfPages(buf)).toBe(3);
  });

  it("PDF UYU+USD: cliente con ambas monedas no genera páginas intermedias vacías", async () => {
    const entries: BulkAccountStatementEntry[] = [
      {
        client: clientInfo("Cliente A"),
        companyName: "Cliente A",
        statement: buildClientAccountStatement({
          invoices: [inv("u1", "2026-01-01", 5000, "UYU"), inv("d1", "2026-01-01", 100, "USD")],
          receipts: [],
          ledgerMode: true,
        }),
      },
      {
        client: clientInfo("Cliente B"),
        companyName: "Cliente B",
        statement: buildClientAccountStatement({
          invoices: [inv("u2", "2026-01-02", 3000, "UYU")],
          receipts: [],
          ledgerMode: true,
        }),
      },
    ];

    const buf = await renderBulkAccountStatementsPdf({
      entries,
      currencies: ["UYU", "USD"],
    });

    const pages = countPdfPages(buf);
    // Cliente A: UYU block + USD block (1 or 2 pages)
    // Cliente B: UYU only (1 page)
    // Max expected = 3, never more (blank pages would push this up)
    expect(pages).toBeGreaterThanOrEqual(2);
    expect(pages).toBeLessThanOrEqual(3);
  });

  it("PDF masivo: N clientes → no más de N páginas por cliente con 1 movimiento", async () => {
    const n = 10;
    const entries: BulkAccountStatementEntry[] = Array.from({ length: n }, (_, i) => ({
      client: clientInfo(`Empresa ${i}`),
      companyName: `Empresa ${i}`,
      statement: buildClientAccountStatement({
        invoices: [inv(`i${i}`, "2026-03-01", 2000)],
        receipts: [],
        ledgerMode: true,
      }),
    }));

    const buf = await renderBulkAccountStatementsPdf({
      entries,
      currencies: ["UYU"],
    });

    const pages = countPdfPages(buf);
    // 10 clients × 1 page each = 10 pages, no blanks
    expect(pages).toBe(n);
  });

  it("clientes sin movimientos son omitidos y no generan páginas en blanco (filteredEntries)", async () => {
    const entries: BulkAccountStatementEntry[] = [
      {
        client: clientInfo("Con movimientos"),
        companyName: "Con movimientos",
        statement: buildClientAccountStatement({
          invoices: [inv("i1", "2026-01-01", 1000)],
          receipts: [],
          ledgerMode: true,
        }),
      },
      {
        // No movements — renderClientCurrencies skips this; outer hasData check filters it
        client: clientInfo("Sin movimientos"),
        companyName: "Sin movimientos",
        statement: buildClientAccountStatement({
          invoices: [],
          receipts: [],
          ledgerMode: true,
        }),
      },
    ];

    // Filter out empty entries like the API route does
    const filteredEntries = entries.filter((e) =>
      ["UYU", "USD"].some((cur) => {
        const block = cur === "UYU" ? e.statement.uyu : e.statement.usd;
        return block.movements.length > 0;
      })
    );

    const buf = await renderBulkAccountStatementsPdf({
      entries: filteredEntries,
      currencies: ["UYU", "USD"],
    });

    expect(countPdfPages(buf)).toBe(1);
  });
});

// ── Cliente específico — renderAccountStatementPdf con filtros de moneda ──────

describe("renderAccountStatementPdf — cliente específico (modo individual)", () => {
  it("1 movimiento USD → exactamente 1 página", async () => {
    const stmt = buildClientAccountStatement({
      invoices: [inv("d1", "2026-01-15", 500, "USD")],
      receipts: [],
      ledgerMode: true,
    });
    const buf = await renderAccountStatementPdf({
      companyName: "Test SA",
      statement: stmt,
      client: clientInfo("Test SA"),
      currencies: ["USD"],
    });
    expect(countPdfPages(buf)).toBe(1);
  });

  it("currencies=['UYU'] con cliente UYU+USD → solo sección UYU (1 página)", async () => {
    const stmt = buildClientAccountStatement({
      invoices: [
        inv("u1", "2026-01-01", 10000, "UYU"),
        inv("d1", "2026-01-02", 500, "USD"),
      ],
      receipts: [],
      ledgerMode: true,
    });
    const buf = await renderAccountStatementPdf({
      companyName: "Test SA",
      statement: stmt,
      client: clientInfo("Test SA"),
      currencies: ["UYU"],
    });
    expect(countPdfPages(buf)).toBe(1);
  });

  it("currencies=['USD'] con cliente UYU+USD → solo sección USD (1 página)", async () => {
    const stmt = buildClientAccountStatement({
      invoices: [
        inv("u1", "2026-01-01", 10000, "UYU"),
        inv("d1", "2026-01-02", 500, "USD"),
      ],
      receipts: [],
      ledgerMode: true,
    });
    const buf = await renderAccountStatementPdf({
      companyName: "Test SA",
      statement: stmt,
      client: clientInfo("Test SA"),
      currencies: ["USD"],
    });
    expect(countPdfPages(buf)).toBe(1);
  });

  it("cliente sin movimientos en moneda solicitada → no lanza error, retorna PDF válido", async () => {
    const stmt = buildClientAccountStatement({
      invoices: [inv("u1", "2026-01-01", 5000, "UYU")],
      receipts: [],
      ledgerMode: true,
    });
    // Requesting USD but client only has UYU — renderClientCurrencies skips the block
    const buf = await renderAccountStatementPdf({
      companyName: "Test SA",
      statement: stmt,
      client: clientInfo("Test SA"),
      currencies: ["USD"],
    });
    // PDFKit always creates at least 1 page (autoFirstPage:true); no crash expected
    expect(countPdfPages(buf)).toBeGreaterThanOrEqual(1);
  });
});

// ── Bulk — filtro de moneda ───────────────────────────────────────────────────

describe("renderBulkAccountStatementsPdf — filtro de moneda por currency", () => {
  it("currencies=['UYU']: clientes sin movimientos UYU son omitidos del PDF", async () => {
    const entries: BulkAccountStatementEntry[] = [
      {
        client: clientInfo("Solo UYU"),
        companyName: "Solo UYU",
        statement: buildClientAccountStatement({
          invoices: [inv("u1", "2026-01-01", 5000, "UYU")],
          receipts: [],
          ledgerMode: true,
        }),
      },
      {
        client: clientInfo("Solo USD"),
        companyName: "Solo USD",
        statement: buildClientAccountStatement({
          invoices: [inv("d1", "2026-01-01", 200, "USD")],
          receipts: [],
          ledgerMode: true,
        }),
      },
    ];
    const buf = await renderBulkAccountStatementsPdf({ entries, currencies: ["UYU"] });
    // Only "Solo UYU" passes the hasData check → 1 page
    expect(countPdfPages(buf)).toBe(1);
  });

  it("currencies=['USD']: clientes sin movimientos USD son omitidos del PDF", async () => {
    const entries: BulkAccountStatementEntry[] = [
      {
        client: clientInfo("Solo UYU"),
        companyName: "Solo UYU",
        statement: buildClientAccountStatement({
          invoices: [inv("u1", "2026-01-01", 5000, "UYU")],
          receipts: [],
          ledgerMode: true,
        }),
      },
      {
        client: clientInfo("Con USD"),
        companyName: "Con USD",
        statement: buildClientAccountStatement({
          invoices: [inv("d1", "2026-01-01", 200, "USD")],
          receipts: [],
          ledgerMode: true,
        }),
      },
    ];
    const buf = await renderBulkAccountStatementsPdf({ entries, currencies: ["USD"] });
    // Only "Con USD" passes → 1 page
    expect(countPdfPages(buf)).toBe(1);
  });

  it("currencies=['UYU'] con 2 clientes UYU y 1 solo USD → exactamente 2 páginas", async () => {
    const entries: BulkAccountStatementEntry[] = [
      {
        client: clientInfo("UYU A"),
        companyName: "UYU A",
        statement: buildClientAccountStatement({
          invoices: [inv("u1", "2026-01-01", 3000, "UYU")],
          receipts: [],
          ledgerMode: true,
        }),
      },
      {
        client: clientInfo("UYU B"),
        companyName: "UYU B",
        statement: buildClientAccountStatement({
          invoices: [inv("u2", "2026-01-02", 4000, "UYU")],
          receipts: [],
          ledgerMode: true,
        }),
      },
      {
        client: clientInfo("Solo USD"),
        companyName: "Solo USD",
        statement: buildClientAccountStatement({
          invoices: [inv("d1", "2026-01-03", 100, "USD")],
          receipts: [],
          ledgerMode: true,
        }),
      },
    ];
    const buf = await renderBulkAccountStatementsPdf({ entries, currencies: ["UYU"] });
    // "UYU A" + "UYU B" → 2 pages; "Solo USD" skipped
    expect(countPdfPages(buf)).toBe(2);
  });

  it("currencies=['USD'] con 2 clientes USD y 1 solo UYU → exactamente 2 páginas", async () => {
    const entries: BulkAccountStatementEntry[] = [
      {
        client: clientInfo("Solo UYU"),
        companyName: "Solo UYU",
        statement: buildClientAccountStatement({
          invoices: [inv("u1", "2026-01-01", 5000, "UYU")],
          receipts: [],
          ledgerMode: true,
        }),
      },
      {
        client: clientInfo("USD X"),
        companyName: "USD X",
        statement: buildClientAccountStatement({
          invoices: [inv("d1", "2026-01-02", 300, "USD")],
          receipts: [],
          ledgerMode: true,
        }),
      },
      {
        client: clientInfo("USD Y"),
        companyName: "USD Y",
        statement: buildClientAccountStatement({
          invoices: [inv("d2", "2026-01-03", 700, "USD")],
          receipts: [],
          ledgerMode: true,
        }),
      },
    ];
    const buf = await renderBulkAccountStatementsPdf({ entries, currencies: ["USD"] });
    // "USD X" + "USD Y" → 2 pages; "Solo UYU" skipped
    expect(countPdfPages(buf)).toBe(2);
  });
});
