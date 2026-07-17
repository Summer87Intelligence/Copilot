import { describe, it, expect } from "vitest";

import { isLocalSafePgUrl, assertLocalPgUrl } from "@/lib/bank/intelligence/reconciliation-local-guard";

describe("local-guard — solo PostgreSQL local", () => {
  it("acepta localhost / 127.0.0.1 / host de contenedor", () => {
    expect(isLocalSafePgUrl("postgresql://u:p@localhost:5432/test")).toBe(true);
    expect(isLocalSafePgUrl("postgres://u:p@127.0.0.1:54322/postgres")).toBe(true);
    expect(isLocalSafePgUrl("postgresql://u:p@db:5432/test")).toBe(true); // servicio Docker
  });
  it("RECHAZA Supabase remoto y hosts con dominio", () => {
    expect(isLocalSafePgUrl("postgresql://u:p@db.erzdifkvvailxnwdukzf.supabase.co:5432/postgres")).toBe(false);
    expect(isLocalSafePgUrl("postgresql://u:p@aws-0-us-east.pooler.supabase.com:6543/postgres")).toBe(false);
    expect(isLocalSafePgUrl("postgresql://u:p@some.remote.example.com:5432/db")).toBe(false);
  });
  it("RECHAZA vacío / protocolo no-postgres / URL inválida", () => {
    expect(isLocalSafePgUrl("")).toBe(false);
    expect(isLocalSafePgUrl(null)).toBe(false);
    expect(isLocalSafePgUrl("http://localhost:5432")).toBe(false);
    expect(isLocalSafePgUrl("not a url")).toBe(false);
  });
  it("assertLocalPgUrl lanza en URL no-local y devuelve la local", () => {
    expect(() => assertLocalPgUrl("postgresql://u:p@db.x.supabase.co:5432/postgres")).toThrow();
    expect(assertLocalPgUrl("postgresql://u:p@localhost:5432/test")).toContain("localhost");
  });
});
