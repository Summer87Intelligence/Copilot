import { describe, expect, it, vi } from "vitest";

import {
  extractZetaContacts,
  isZetaContactsResponse,
  readZetaContactsQueryOutFlags,
} from "@/lib/integrations/zeta/contracts/zeta-contacts.contract";

vi.mock("@/lib/integrations/zeta/zeta-logger", () => ({
  logZetaError: vi.fn(),
}));

/**
 * Ejemplo de envelope REST realista (PascalCase) para RESTContactosV3Query.
 * Solo se usa `QueryOut.Contactos.Contacto[]` — sin otros arrays en la raíz.
 */
const SAMPLE_QUERY_OUT = {
  QueryOut: {
    Succeed: true,
    IsLastPage: true,
    TotalRegistros: 1,
    Contactos: {
      Contacto: [
        {
          Codigo: "C-100",
          Nombre: "María",
          RazonSocial: "Distribuidora Norte SA",
          Documento: "219876540013",
          Email1: "maria@example.com",
          Telefono: "094000000",
          EsCliente: "S",
          EsProveedor: "N",
        },
      ],
    },
  },
} as const;

describe("zeta-contacts.contract", () => {
  it("isZetaContactsResponse es true solo con QueryOut.Contactos.Contacto", () => {
    expect(isZetaContactsResponse(SAMPLE_QUERY_OUT)).toBe(true);
    expect(isZetaContactsResponse({ foo: [{ Codigo: "x" }] })).toBe(false);
    expect(isZetaContactsResponse({ QueryOut: { Items: [] } })).toBe(false);
  });

  it("extractZetaContacts devuelve filas y flags de paginación", () => {
    const rows = extractZetaContacts(SAMPLE_QUERY_OUT);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.Codigo).toBe("C-100");
    const flags = readZetaContactsQueryOutFlags(SAMPLE_QUERY_OUT);
    expect(flags.isLastPage).toBe(true);
    expect(flags.total).toBe(1);
  });

  it("acepta Contactos como array de contactos", () => {
    const alt = {
      QueryOut: {
        Contactos: [{ Codigo: "A-1", EsCliente: "S" }],
      },
    };
    expect(isZetaContactsResponse(alt)).toBe(true);
    expect(extractZetaContacts(alt)).toHaveLength(1);
  });

  it("Contacto único (objeto) se normaliza a un elemento", () => {
    const one = {
      QueryOut: {
        Contactos: {
          Contacto: { Codigo: "Z-9", EsCliente: "N", EsProveedor: "S" },
        },
      },
    };
    expect(extractZetaContacts(one)).toHaveLength(1);
  });
});
