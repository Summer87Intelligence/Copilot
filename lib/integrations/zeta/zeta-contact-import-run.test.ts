import { beforeEach, describe, expect, it, vi } from "vitest";

import { runZetaContactsInitialImport } from "@/lib/integrations/zeta/zeta-contact-import-run";

vi.mock("@/lib/integrations/zeta/zeta-contacts-fetch", () => ({
  fetchZetaContacts: vi.fn(),
}));

import { fetchZetaContacts } from "@/lib/integrations/zeta/zeta-contacts-fetch";

const mockFetch = vi.mocked(fetchZetaContacts);

const CONTACT_COLUMNS = [
  "id",
  "workspace_company_id",
  "company_id",
  "full_name",
  "job_title",
  "email",
  "status",
  "is_active",
  "created_at",
  "updated_at",
];

function zetaRow(overrides: Record<string, unknown> = {}) {
  return {
    Codigo: "Z-1",
    RazonSocial: "Empresa SA",
    Nombre: "Ana Gómez",
    RUT: "214567890013",
    Email1: "ana@empresa.example.com",
    Telefono: "099111222",
    ContactoActivo: "S",
    ...overrides,
  };
}

function createSupabaseMock(opts: { companyId?: string }) {
  const companyId = opts.companyId ?? "comp-uuid-1";

  const fromMock = vi.fn((table: string) => {
    if (table === "proto_contacts") {
      return {
        select: vi.fn((sel: string) => {
          if (sel === "*") {
            return {
              limit: vi.fn(() =>
                Promise.resolve({
                  data: [
                    Object.fromEntries(
                      CONTACT_COLUMNS.map((c) => [c, c === "is_active" ? true : c === "status" ? "active" : ""])
                    ),
                  ],
                  error: null,
                })
              ),
            };
          }
          if (sel === "company_id,email,full_name") {
            return {
              eq: vi.fn(() =>
                Promise.resolve({
                  data: [],
                  error: null,
                })
              ),
            };
          }
          throw new Error(`select inesperado: ${sel}`);
        }),
        insert: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn(async () => {
              return { data: { id: "new-contact-1" }, error: null };
            }),
          })),
        })),
      };
    }
    if (table === "proto_companies") {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() =>
            Promise.resolve({
              data: [{ id: companyId, Codigo: "Z-1", RUT: "214567890013" }],
              error: null,
            })
          ),
        })),
      };
    }
    throw new Error(`tabla inesperada: ${table}`);
  });

  return { from: fromMock };
}

describe("runZetaContactsInitialImport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("inserta contacto cuando hay empresa por Codigo", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      contacts: [zetaRow()],
      hasMore: false,
      requestUrl: "https://example/zeta",
      httpStatus: 200,
      raw: {},
      warnings: [],
    } as Awaited<ReturnType<typeof fetchZetaContacts>>);

    const supabase = createSupabaseMock({});
    const r = await runZetaContactsInitialImport(supabase as never, "tenant-1", { limit: 10 });
    expect(r.inserted).toBe(1);
    expect(r.processed).toBe(1);
    expect(r.skipped_no_company).toBe(0);
  });
});
