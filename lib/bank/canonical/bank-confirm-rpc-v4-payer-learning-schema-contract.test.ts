import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Contrato estático de la migración v4 (payer learning) — no aplica DDL.
 * Verifica que no se inventen constraints que rompan el esquema real.
 */

const sql = readFileSync(
  join(
    process.cwd(),
    "supabase",
    "migrations",
    "20260725120000_bank_reconciliation_confirm_rpc_v4_payer_learning.sql"
  ),
  "utf8"
);

describe("confirm_bank_reconciliation_v1 v4 — schema contract", () => {
  it("preserva la firma de 8 parámetros de v3", () => {
    expect(sql).toContain("p_metadata       jsonb DEFAULT '{}'::jsonb");
    expect(sql).toContain(
      "CREATE OR REPLACE FUNCTION public.confirm_bank_reconciliation_v1("
    );
  });

  it("NO agrega UNIQUE total sobre client_payer_links (rompe histórico rejected/inactive)", () => {
    expect(sql).not.toMatch(/ADD CONSTRAINT client_payer_links_workspace_identity_client_key/);
    expect(sql).not.toMatch(/UNIQUE\s*\(\s*workspace_id,\s*payer_identity_id,\s*client_company_id\s*\)/);
  });

  it("NO agrega constraint UNIQUE redundante sobre bank_payer_identities (índice ya existe)", () => {
    expect(sql).not.toMatch(/ADD CONSTRAINT bank_payer_identities_workspace_account_hash_key/);
  });

  it("method es siempre suggested_confirmed", () => {
    expect(sql).toContain("'suggested_confirmed'");
    expect(sql).not.toMatch(/method\s*=\s*.*manual_reviewed/);
  });

  it("idempotencia early-return no incrementa aprendizaje", () => {
    expect(sql).toContain("already_confirmed");
    expect(sql).toContain("already_linked");
    const alreadyIdx = sql.indexOf("already_confirmed");
    const learningInsertIdx = sql.indexOf("INSERT INTO public.bank_payer_identities");
    expect(alreadyIdx).toBeGreaterThan(-1);
    expect(learningInsertIdx).toBeGreaterThan(alreadyIdx);
  });

  it("detecta conflicto multi-cliente sin autoselección", () => {
    expect(sql).toContain("payer_link_conflicted");
    expect(sql).toContain("'conflicted'");
  });

  it("exige suggestion_scope operational y SECURITY INVOKER", () => {
    expect(sql).toContain("suggestion_scope = 'operational'");
    expect(sql).toContain("SECURITY INVOKER");
    expect(sql).toContain("SET search_path TO 'public, pg_temp'");
    expect(sql).toContain("GRANT EXECUTE");
    expect(sql).toContain("service_role");
  });

  it("cliente final se valida contra proto_companies del workspace", () => {
    expect(sql).toContain("PAYER_CLIENT_NOT_IN_WORKSPACE");
    expect(sql).toContain("proto_companies");
  });

  it("documenta que no está aplicada", () => {
    expect(sql).toMatch(/NO APLICAR|PREPARADA LOCALMENTE|NO APLICADA/);
  });
});
