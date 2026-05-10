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
 * DIV-003: el shape real de RESTContactosV3Query es QueryOut.Response[] (Postman oficial).
 * El contrato mantiene retrocompat con QueryOut.Contactos.Contacto[] (shape original asumido).
 */

// Shape real del tenant (Postman oficial) — QueryOut.Response[]
const SAMPLE_RESPONSE_ARRAY = {
  QueryOut: {
    Succeed: true,
    Response: [
      {
        Codigo: "C-100",
        Nombre: "María",
        RazonSocial: "Distribuidora Norte SA",
        RUT: "219876540013",
        Documento: "219876540013",
        Email1: "maria@example.com",
        Email2: "alt@example.com",
        Telefono: "094000000",
        Celular: "099111222",
        EsCliente: "S",
        EsProveedor: "N",
      },
    ],
    IsLastPage: true,
    Error: { Code: "", Message: "" },
  },
} as const;

// Shape retrocompat (asunción original): QueryOut.Contactos.Contacto[]
const SAMPLE_QUERY_OUT_LEGACY = {
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
  it("DIV-003: acepta shape primario QueryOut.Response[] (Postman + tenant real)", () => {
    expect(isZetaContactsResponse(SAMPLE_RESPONSE_ARRAY)).toBe(true);
    const rows = extractZetaContacts(SAMPLE_RESPONSE_ARRAY);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.Codigo).toBe("C-100");
    expect(rows[0]?.Email1).toBe("maria@example.com");
    expect(rows[0]?.Celular).toBe("099111222");
  });

  it("DIV-003: IsLastPage y TotalRegistros se leen desde QueryOut directamente", () => {
    const flags = readZetaContactsQueryOutFlags(SAMPLE_RESPONSE_ARRAY);
    expect(flags.isLastPage).toBe(true);
  });

  it("retrocompat: acepta QueryOut.Contactos.Contacto[] (shape original asumido)", () => {
    expect(isZetaContactsResponse(SAMPLE_QUERY_OUT_LEGACY)).toBe(true);
    const rows = extractZetaContacts(SAMPLE_QUERY_OUT_LEGACY);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.Codigo).toBe("C-100");
    const flags = readZetaContactsQueryOutFlags(SAMPLE_QUERY_OUT_LEGACY);
    expect(flags.isLastPage).toBe(true);
    expect(flags.total).toBe(1);
  });

  it("acepta Contactos como array directo (variante alternativa)", () => {
    const alt = {
      QueryOut: { Contactos: [{ Codigo: "A-1", EsCliente: "S" }] },
    };
    expect(isZetaContactsResponse(alt)).toBe(true);
    expect(extractZetaContacts(alt)).toHaveLength(1);
  });

  it("acepta Contacto único (objeto) normalizado a un elemento", () => {
    const one = {
      QueryOut: {
        Contactos: { Contacto: { Codigo: "Z-9", EsCliente: "N" } },
      },
    };
    expect(extractZetaContacts(one)).toHaveLength(1);
  });

  it("acepta Response vacío como válido (lista de 0 contactos)", () => {
    const empty = { QueryOut: { Response: [], IsLastPage: true } };
    expect(isZetaContactsResponse(empty)).toBe(true);
    expect(extractZetaContacts(empty)).toHaveLength(0);
  });

  it("rechaza respuestas sin QueryOut", () => {
    expect(isZetaContactsResponse({ foo: [{ Codigo: "x" }] })).toBe(false);
    expect(isZetaContactsResponse(null)).toBe(false);
    expect(isZetaContactsResponse("string")).toBe(false);
    expect(isZetaContactsResponse([])).toBe(false);
  });

  it("rechaza QueryOut sin claves reconocidas como array de filas", () => {
    expect(isZetaContactsResponse({ QueryOut: { Succeed: true } })).toBe(false);
    expect(isZetaContactsResponse({ QueryOut: {} })).toBe(false);
  });
});
