/**
 * FASE BANK-LOCAL-POSTGRES-VALIDATION-001 — Harness de integración contra Postgres LOCAL.
 *
 * SE OMITE por defecto: solo corre si `LOCAL_PG_URL` apunta a un Postgres local/efímero
 * (guard) Y el driver `pg` está instalado (`npm i -D pg`). Sin esas condiciones el
 * describe queda `skip` y la suite permanece verde. NUNCA corre contra Supabase remoto.
 *
 * Para ejecutarlo (ver scripts/bank-reconciliation-local-validation/README.md): aplicar
 * baseline FASE E + las 3 migraciones + fixtures, luego:
 *   LOCAL_PG_URL=postgres://...@localhost:54322/postgres npx vitest run lib/bank/intelligence/reconciliation-postgres.pg.test.ts
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";

import { isLocalSafePgUrl, assertLocalPgUrl } from "@/lib/bank/intelligence/reconciliation-local-guard";

const LOCAL_PG_URL = process.env.LOCAL_PG_URL;
const ENABLED = isLocalSafePgUrl(LOCAL_PG_URL);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadPg(): Promise<any | null> {
  try {
    const spec = "pg"; // specifier no literal → tsc no exige el módulo si falta
    return await import(spec);
  } catch {
    return null;
  }
}

const suite = ENABLED ? describe : describe.skip;

suite("conciliación bancaria — validación real en Postgres local", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let client: any = null;

  beforeAll(async () => {
    assertLocalPgUrl(LOCAL_PG_URL);
    const pg = await loadPg();
    if (!pg) throw new Error("Driver `pg` no instalado. Ejecutá `npm i -D pg` para correr el harness.");
    client = new pg.Client({ connectionString: LOCAL_PG_URL as string });
    await client.connect();
  });

  afterAll(async () => {
    if (client) await client.end();
  });

  it("las 3 migraciones aplicaron: tablas y RPCs presentes; sin tabla duplicada", async () => {
    const t = await client.query("SELECT to_regclass('public.bank_reconciliation_suggestions') AS s, to_regclass('public.payment_allocations') AS a");
    expect(t.rows[0].s).not.toBeNull();
    expect(t.rows[0].a).not.toBeNull();
    const f = await client.query("SELECT count(*)::int AS n FROM pg_proc WHERE proname IN ('confirm_bank_reconciliation_v1','reverse_bank_reconciliation_v1')");
    expect(f.rows[0].n).toBe(2);
    const m = await client.query("SELECT to_regclass('public.bank_reconciliation_matches') AS m");
    expect(m.rows[0].m).toBeNull();
  });

  // Batería funcional 8–24 y concurrencia 25–28 con la RPC real (guion en el README).
  it.todo("batería funcional 8–24 (requiere baseline FASE E + fixtures cargados)");
  it.todo("concurrencia 25–28 (dos conexiones reales, locks/deadlocks)");
});
