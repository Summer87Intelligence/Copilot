import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * FASE BANK-CANONICAL-CONFIRM-CONTRACT-CORRECTION-001 — contrato de esquema
 * (estático sobre el SQL de la migración de corrección, sin Postgres). La
 * migración `20260722130000_bank_reconciliation_confirm_rpc_v2.sql` está
 * CREADA pero NO APLICADA (requiere autorización). Mismo patrón que
 * `sales-document-seller-audit-migration-schema-contract.test.ts`.
 *
 * Garantiza las dos correcciones exactas (sin 'reversed' inalcanzable en
 * bank_movements.status; suggestion_scope='operational' obligatorio) y que
 * la migración NO amplía el contrato más allá de lo auditado: misma firma,
 * mismo nivel de seguridad, sin tocar CHECK constraints ni otras tablas.
 */

const MIG = join(process.cwd(), "supabase", "migrations");
const v1Sql = readFileSync(join(MIG, "20260719120200_bank_reconciliation_confirm_rpc.sql"), "utf8");
const v2Sql = readFileSync(join(MIG, "20260722130000_bank_reconciliation_confirm_rpc_v2.sql"), "utf8");

describe("confirm_bank_reconciliation_v1 (v2 correction) — contrato de esquema", () => {
  it("retira la comparación inalcanzable contra 'reversed' en bank_movements.status", () => {
    expect(v1Sql).toContain("IF v_mov.status IN ('ignored','reversed') THEN RAISE EXCEPTION 'MOVEMENT_NOT_RECONCILABLE'");
    // La v2 sí menciona la frase en un comentario explicativo (documentando el bug corregido),
    // pero la sentencia EJECUTABLE ya no debe existir.
    expect(v2Sql).not.toContain("IF v_mov.status IN ('ignored','reversed') THEN RAISE EXCEPTION");
    expect(v2Sql).toContain("IF v_mov.status = 'ignored' THEN RAISE EXCEPTION 'MOVEMENT_NOT_RECONCILABLE'");
  });

  it("no agrega 'reversed' a ningún CHECK constraint (la corrección es de lógica RPC, no de esquema)", () => {
    expect(v2Sql).not.toMatch(/ALTER TABLE/i);
    expect(v2Sql).not.toMatch(/ADD CONSTRAINT/i);
    expect(v2Sql).not.toMatch(/DROP CONSTRAINT/i);
    expect(v2Sql).not.toMatch(/CHECK\s*\(/i);
  });

  it("exige suggestion_scope='operational' para confirmar por sugerencia (gap real corregido)", () => {
    expect(v1Sql).not.toContain("suggestion_scope = 'operational'");
    expect(v2Sql).toMatch(/status IN \('generated','pending_review'\)\s*\n\s*AND suggestion_scope = 'operational'/);
  });

  it("mantiene la misma firma exacta (CREATE OR REPLACE, aditiva, sin migrar datos)", () => {
    const sig = "confirm_bank_reconciliation_v1(\n  p_workspace_id   uuid,\n  p_movement_id    uuid,\n  p_receipt_id     uuid,\n  p_suggestion_id  uuid,\n  p_allocations    jsonb,";
    expect(v1Sql).toContain(sig);
    expect(v2Sql).toContain(sig);
  });

  it("conserva SECURITY INVOKER, search_path fijo y grants service_role-only", () => {
    expect(v2Sql).toContain("SECURITY INVOKER");
    expect(v2Sql).toContain("SET search_path TO 'public, pg_temp'");
    expect(v2Sql).toContain("REVOKE ALL ON FUNCTION public.confirm_bank_reconciliation_v1");
    expect(v2Sql).toMatch(/FROM PUBLIC, anon, authenticated/);
    expect(v2Sql).toContain("GRANT EXECUTE ON FUNCTION public.confirm_bank_reconciliation_v1");
    expect(v2Sql).toContain("TO service_role");
  });

  it("no toca datos existentes, no borra links/allocations, no incluye backfill", () => {
    expect(v2Sql).not.toMatch(/DELETE FROM/i);
    expect(v2Sql).not.toMatch(/UPDATE public\.bank_movement_reconciliation_links/);
    expect(v2Sql).not.toMatch(/UPDATE public\.payment_allocations/);
    expect(v2Sql).not.toMatch(/backfill/i);
  });

  it("mantiene idempotencia (misma sugerencia ya confirmada) y el resto de las validaciones agregadas intactas", () => {
    for (const marker of [
      "already_confirmed",
      "already_linked",
      "IDEMPOTENCY_CONFLICT",
      "OVER_APPLIED_MOVEMENT",
      "OVER_APPLIED_RECEIPT",
      "OVER_APPLIED_INVOICE",
      "ALLOCATIONS_EXCEED_LINK",
      "ORDER BY 1", // orden determinístico de locks por invoice_id
    ]) {
      expect(v2Sql).toContain(marker);
    }
  });

  it("incluye rollback conceptual comentado, no ejecutado", () => {
    expect(v2Sql).toMatch(/ROLLBACK CONCEPTUAL \(no ejecutar aquí\)/);
  });
});

describe("reverse_bank_reconciliation_v1 — auditada de nuevo, sin cambios necesarios", () => {
  it("la v2 no redefine reverse_bank_reconciliation_v1 (no requería corrección)", () => {
    expect(v2Sql).not.toContain("CREATE OR REPLACE FUNCTION public.reverse_bank_reconciliation_v1");
  });

  it("la v1 de reverse nunca escribe bank_movements (no depende del valor cuestionado)", () => {
    const reverseFn = v1Sql.split("CREATE OR REPLACE FUNCTION public.reverse_bank_reconciliation_v1")[1] ?? "";
    expect(reverseFn).not.toMatch(/UPDATE public\.bank_movements/);
  });
});
