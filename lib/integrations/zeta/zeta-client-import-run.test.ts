import { beforeEach, describe, expect, it, vi } from "vitest";

import { runZetaCompaniesInitialImport } from "@/lib/integrations/zeta/zeta-client-import-run";

vi.mock("@/lib/integrations/zeta/zeta-clients", () => ({
  fetchZetaClients: vi.fn(),
}));

import { fetchZetaClients } from "@/lib/integrations/zeta/zeta-clients";

const mockFetch = vi.mocked(fetchZetaClients);

const BASE_COLUMNS = [
  "id",
  "name",
  "workspace_company_id",
  "status",
  "risk_level",
  "is_active",
  "archived_at",
  "industry",
  "city",
  "Codigo",
  "RazonSocial",
  "Nombre",
  "RUT",
  "zeta_metadata",
  "created_at",
  "updated_at",
];

function zetaRow(codigo: string, nombre = "Acme SA") {
  return {
    Codigo: codigo,
    RazonSocial: nombre,
    Nombre: "",
    RUT: "214567890013",
    ContactoActivo: "S",
    EsCliente: "S",
  };
}

function createSupabaseMock(opts: {
  columns?: string[];
  existingCodigos?: string[];
  insertIds?: string[];
  rpcError?: boolean;
}) {
  let insertCall = 0;
  const fromCalls: string[] = [];
  const insertIds = opts.insertIds ?? ["new-1"];
  const columns = opts.columns ?? BASE_COLUMNS;

  const fromMock = vi.fn((table: string) => {
    fromCalls.push(table);
    if (table === "proto_contacts") {
      throw new Error("proto_contacts no debe consultarse en import Zeta empresas");
    }
    if (table !== "proto_companies") {
      throw new Error(`tabla inesperada: ${table}`);
    }

    return {
      select(sel: string) {
        if (sel === "Codigo") {
          return {
            eq: vi.fn(() =>
              Promise.resolve({
                data: (opts.existingCodigos ?? []).map((c) => ({ Codigo: c })),
                error: null,
              }),
            ),
          };
        }
        if (sel === "id,RUT,Codigo") {
          return {
            eq: vi.fn(() => Promise.resolve({ data: [], error: null })),
          };
        }
        if (sel === "*") {
          return {
            limit: vi.fn(() => Promise.resolve({ data: [], error: null })),
          };
        }
        throw new Error(`select inesperado: ${sel}`);
      },
      insert: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn(async () => {
            const id = insertIds[insertCall] ?? `new-${insertCall + 1}`;
            insertCall += 1;
            return { data: { id }, error: null };
          }),
        })),
      })),
    };
  });

  return {
    from: fromMock,
    rpc: vi.fn(async () => {
      if (opts.rpcError) {
        return { data: null, error: { message: "rpc missing" } };
      }
      return { data: columns, error: null };
    }),
    __fromCalls: fromCalls,
    __insertCallCount: () => insertCall,
  };
}

describe("runZetaCompaniesInitialImport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("falla con workspace_company_id vacío", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      requestUrl: "https://example/zeta",
      httpStatus: 200,
      rawText: "{}",
      parsedJson: {},
      parseError: null,
      errors: [],
      warnings: [],
      extractedRows: [zetaRow("1")],
      zetaRowsExtractionPath: "QueryOut.Data.Items",
    } as Awaited<ReturnType<typeof fetchZetaClients>>);

    const supabase = createSupabaseMock({});
    const r = await runZetaCompaniesInitialImport(supabase as never, "   ", {});
    expect(r.ok).toBe(false);
    expect(r.inserted).toBe(0);
    expect(r.errors.join(" ")).toMatch(/workspace_company_id/i);
  });

  it("respeta límite del batch", async () => {
    const rows = Array.from({ length: 50 }, (_, i) => zetaRow(`C-${i + 1}`, `Empresa ${i + 1}`));
    mockFetch.mockResolvedValue({
      ok: true,
      requestUrl: "https://example/zeta",
      httpStatus: 200,
      rawText: "{}",
      parsedJson: {},
      parseError: null,
      errors: [],
      warnings: [],
      extractedRows: rows,
      zetaRowsExtractionPath: "QueryOut.Data.Items",
    } as Awaited<ReturnType<typeof fetchZetaClients>>);

    const supabase = createSupabaseMock({});
    const r = await runZetaCompaniesInitialImport(supabase as never, "tenant-1", { limit: 5 });
    expect(r.processed).toBe(5);
    expect(r.inserted).toBe(5);
    expect(supabase.__insertCallCount()).toBe(5);
  });

  it("no inserta duplicado si ya existe Codigo en proto_companies", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      requestUrl: "https://example/zeta",
      httpStatus: 200,
      rawText: "{}",
      parsedJson: {},
      parseError: null,
      errors: [],
      warnings: [],
      extractedRows: [zetaRow("DUP-1", "Ya existe")],
      zetaRowsExtractionPath: "QueryOut.Data.Items",
    } as Awaited<ReturnType<typeof fetchZetaClients>>);

    const supabase = createSupabaseMock({ existingCodigos: ["DUP-1"] });
    const r = await runZetaCompaniesInitialImport(supabase as never, "tenant-1", { limit: 20 });
    expect(r.inserted).toBe(0);
    expect(r.skipped_duplicate_codigo).toBe(1);
    expect(supabase.__insertCallCount()).toBe(0);
  });

  it("advertencia si falta zeta_metadata en el esquema", async () => {
    const cols = BASE_COLUMNS.filter((c) => c !== "zeta_metadata");
    mockFetch.mockResolvedValue({
      ok: true,
      requestUrl: "https://example/zeta",
      httpStatus: 200,
      rawText: "{}",
      parsedJson: {},
      parseError: null,
      errors: [],
      warnings: [],
      extractedRows: [zetaRow("Z1", "Sin metadata col")],
      zetaRowsExtractionPath: "QueryOut.Data.Items",
    } as Awaited<ReturnType<typeof fetchZetaClients>>);

    const supabase = createSupabaseMock({ columns: cols });
    const r = await runZetaCompaniesInitialImport(supabase as never, "tenant-1", {});
    expect(r.warnings.some((w) => w.includes("zeta_metadata"))).toBe(true);
    expect(r.inserted).toBe(1);
  });

  it("advertencia y sin inserciones si falta columna Codigo", async () => {
    const cols = BASE_COLUMNS.filter((c) => c !== "Codigo");
    mockFetch.mockResolvedValue({
      ok: true,
      requestUrl: "https://example/zeta",
      httpStatus: 200,
      rawText: "{}",
      parsedJson: {},
      parseError: null,
      errors: [],
      warnings: [],
      extractedRows: [zetaRow("X1")],
      zetaRowsExtractionPath: "QueryOut.Data.Items",
    } as Awaited<ReturnType<typeof fetchZetaClients>>);

    const supabase = createSupabaseMock({ columns: cols });
    const r = await runZetaCompaniesInitialImport(supabase as never, "tenant-1", {});
    expect(r.inserted).toBe(0);
    expect(r.skipped_no_codigo_column).toBe(1);
    expect(r.warnings.some((w) => w.includes("Codigo"))).toBe(true);
    expect(supabase.__fromCalls.filter((t) => t === "proto_contacts")).toHaveLength(0);
  });

  it("no toca proto_contacts", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      requestUrl: "https://example/zeta",
      httpStatus: 200,
      rawText: "{}",
      parsedJson: {},
      parseError: null,
      errors: [],
      warnings: [],
      extractedRows: [zetaRow("PC-1")],
      zetaRowsExtractionPath: "QueryOut.Data.Items",
    } as Awaited<ReturnType<typeof fetchZetaClients>>);

    const supabase = createSupabaseMock({});
    await runZetaCompaniesInitialImport(supabase as never, "tenant-1", {});
    expect(supabase.__fromCalls.includes("proto_contacts")).toBe(false);
    expect(supabase.__fromCalls.filter((t) => t === "proto_companies").length).toBeGreaterThan(0);
  });
});
