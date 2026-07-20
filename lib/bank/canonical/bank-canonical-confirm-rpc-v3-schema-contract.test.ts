import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * FASE BANK-MANUAL-CANONICAL-MATCH-SELECTION-001 — contrato de esquema
 * (estático sobre el SQL, sin Postgres) para la migración v3 de
 * `confirm_bank_reconciliation_v1`. **Creada, NO aplicada** (requiere
 * autorización). Mismo patrón que la v2.
 *
 * Garantiza: (1) el único cambio real es un parámetro `p_metadata` ADITIVO
 * con DEFAULT, de forma que el modo "suggested" (llamada sin ese parámetro)
 * sigue funcionando exactamente igual contra esta v3; (2) `proposed_client_id`/
 * `proposed_receipt_id` de la sugerencia jamás se sobrescriben; (3) no se
 * agregan columnas nuevas a ninguna tabla — `reconciliation_events.metadata`
 * ya existía; (4) mismo nivel de seguridad que v2 (SECURITY INVOKER,
 * search_path fijo, service_role-only).
 */

const MIG = join(process.cwd(), "supabase", "migrations");
const v2Sql = readFileSync(join(MIG, "20260722130000_bank_reconciliation_confirm_rpc_v2.sql"), "utf8");
const v3Sql = readFileSync(join(MIG, "20260723120000_bank_reconciliation_confirm_rpc_v3.sql"), "utf8");

describe("confirm_bank_reconciliation_v1 (v3) — contrato de esquema", () => {
  it("agrega ÚNICAMENTE p_metadata, aditivo con DEFAULT, al final de la firma", () => {
    expect(v2Sql).not.toContain("p_metadata");
    expect(v3Sql).toContain("p_metadata       jsonb DEFAULT '{}'::jsonb");
  });

  it("el modo 'suggested' (llamada sin p_metadata) sigue siendo válido: v_metadata usa coalesce sobre el parámetro opcional", () => {
    expect(v3Sql).toContain("v_metadata   jsonb := coalesce(p_metadata, '{}'::jsonb)");
  });

  it("no agrega columnas nuevas a ninguna tabla (usa reconciliation_events.metadata, ya existente)", () => {
    expect(v3Sql).not.toMatch(/ALTER TABLE/i);
    expect(v3Sql).not.toMatch(/ADD COLUMN/i);
  });

  it("nunca sobrescribe proposed_client_id/proposed_receipt_id — el UPDATE de la sugerencia sigue tocando solo status/confirmed_link_id/reviewed_*", () => {
    const updateBlock = v3Sql.match(/UPDATE public\.bank_reconciliation_suggestions[\s\S]*?WHERE[^;]+;/)![0];
    expect(updateBlock).not.toContain("proposed_client_id");
    expect(updateBlock).not.toContain("proposed_receipt_id");
    expect(updateBlock).toContain("status='confirmed'");
    expect(updateBlock).toContain("confirmed_link_id=v_link_id");
  });

  it("registra p_metadata en el evento reconciliation_confirmed (antes quedaba en '{}' por defecto)", () => {
    expect(v2Sql).toMatch(/INSERT INTO public\.reconciliation_events \(workspace_id, event_type, entity_type, entity_id, new_state, actor_user_id\)\s*\n\s*VALUES \(p_workspace_id, 'reconciliation_confirmed'/);
    expect(v3Sql).toMatch(/INSERT INTO public\.reconciliation_events \(workspace_id, event_type, entity_type, entity_id, new_state, actor_user_id, metadata\)\s*\n\s*VALUES \(p_workspace_id, 'reconciliation_confirmed'.*v_metadata\)/);
  });

  it("la RPC nunca exigió (ni exige en v3) que p_receipt_id coincida con proposed_receipt_id — esa restricción vivía solo en el adapter TypeScript", () => {
    // Las únicas menciones de proposed_client_id/proposed_receipt_id en el archivo son
    // comentarios explicativos (documentando que NUNCA se tocan) — nunca una comparación
    // ejecutable tipo "= proposed_receipt_id" dentro del cuerpo SQL de la función.
    expect(v3Sql).not.toMatch(/=\s*proposed_(client|receipt)_id/);
    expect(v3Sql).not.toMatch(/proposed_(client|receipt)_id\s*=/);
  });

  it("la RPC nunca conoce ni valida 'cliente' — no recibe client_id como parámetro", () => {
    expect(v3Sql).not.toMatch(/p_client_id/);
  });

  it("mantiene el mismo nivel de seguridad que v2: SECURITY INVOKER, search_path fijo, grants service_role-only", () => {
    expect(v3Sql).toContain("SECURITY INVOKER");
    expect(v3Sql).toContain("SET search_path TO 'public, pg_temp'");
    expect(v3Sql).toContain("REVOKE ALL ON FUNCTION public.confirm_bank_reconciliation_v1");
    expect(v3Sql).toMatch(/FROM PUBLIC, anon, authenticated/);
    expect(v3Sql).toContain("GRANT EXECUTE ON FUNCTION public.confirm_bank_reconciliation_v1");
    expect(v3Sql).toContain("TO service_role");
  });

  it("conserva idempotencia y validaciones existentes intactas", () => {
    for (const marker of [
      "already_confirmed",
      "already_linked",
      "IDEMPOTENCY_CONFLICT",
      "OVER_APPLIED_MOVEMENT",
      "OVER_APPLIED_RECEIPT",
      "OVER_APPLIED_INVOICE",
      "ALLOCATIONS_EXCEED_LINK",
      "suggestion_scope = 'operational'",
    ]) {
      expect(v3Sql).toContain(marker);
    }
  });

  it("incluye rollback conceptual comentado, no ejecutado", () => {
    expect(v3Sql).toMatch(/ROLLBACK CONCEPTUAL \(no ejecutar aquí\)/);
  });

  it("no toca datos existentes, sin backfill, sin DELETE", () => {
    expect(v3Sql).not.toMatch(/DELETE FROM/i);
    expect(v3Sql).not.toMatch(/backfill/i);
  });
});
