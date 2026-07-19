import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Contrato de esquema (estático sobre el SQL de las migraciones pendientes).
 * El entorno vitest es `node` (sin Postgres): estos tests garantizan las
 * INVARIANTES de diseño anti-drift sin ejecutar DDL. La ejecución transaccional
 * real se valida al aplicar las migraciones (autorización).
 */

const MIG = join(process.cwd(), "supabase", "migrations");
const suggestions = readFileSync(join(MIG, "20260719120100_bank_reconciliation_suggestions.sql"), "utf8");
const rpc = readFileSync(join(MIG, "20260719120200_bank_reconciliation_confirm_rpc.sql"), "utf8");
const scope = readFileSync(join(MIG, "20260720120000_bank_suggestion_scope.sql"), "utf8");
const reviewActions = readFileSync(join(MIG, "20260721120000_bank_review_actions.sql"), "utf8");

describe("esquema canónico de conciliación — contrato", () => {
  it("NO existe una segunda tabla canónica de conciliación efectiva (matches)", () => {
    expect(suggestions).not.toContain("bank_reconciliation_matches");
    expect(suggestions).toContain("CREATE TABLE IF NOT EXISTS public.bank_reconciliation_suggestions");
  });

  it("una sugerencia confirmada REQUIERE link canónico (anti-drift)", () => {
    expect(suggestions).toContain("brs_confirmed_requires_link");
    expect(suggestions).toContain("brs_rejected_has_no_link");
    expect(suggestions).toContain("confirmed_link_id");
    expect(suggestions).toContain("REFERENCES public.bank_movement_reconciliation_links(id)");
    // Reversión preserva historia: estado 'reversed' sin link.
    expect(suggestions).toMatch(/CHECK \(status IN \([^)]*'reversed'\)/);
    expect(suggestions).toMatch(/status NOT IN \('rejected','superseded','reversed'\)/);
  });

  it("payment_allocations referencia el LINK CANÓNICO, no la sugerencia; único por link+factura", () => {
    expect(suggestions).toContain("reconciliation_link_id");
    expect(suggestions).toMatch(/reconciliation_link_id\s+UUID\s+NOT NULL REFERENCES public\.bank_movement_reconciliation_links/);
    expect(suggestions).not.toMatch(/payment_allocations[\s\S]*suggestion_id\s+UUID\s+NOT NULL/);
    // Una factura una vez por link activo (varios links → una factura SÍ permitido).
    expect(suggestions).toContain("pa_link_invoice_active_uidx");
  });

  it("eventos append-only y sin anon/public en RLS", () => {
    expect(suggestions).toContain("reconciliation_events");
    expect(suggestions).not.toContain("TO anon");
    expect(suggestions).not.toContain("TO public");
  });

  it("existen las RPC transaccionales confirm/reverse con validación AGREGADA de sumas", () => {
    expect(rpc).toContain("confirm_bank_reconciliation_v1");
    expect(rpc).toContain("reverse_bank_reconciliation_v1");
    expect(rpc).toContain("SECURITY INVOKER");
    expect(rpc).toContain("FOR UPDATE");
    expect(rpc).toContain("OVER_APPLIED_MOVEMENT");
    expect(rpc).toContain("OVER_APPLIED_RECEIPT");
    expect(rpc).toContain("OVER_APPLIED_INVOICE");
    expect(rpc).toContain("ALLOCATIONS_EXCEED_LINK");
    expect(rpc).toContain("INVOICE_FULLY_PAID");
    expect(rpc).toContain("GROUP BY 1"); // agrega allocations por factura (dedup del JSON)
    expect(rpc).toMatch(/GROUP BY 1\s*\n\s*ORDER BY 1/); // orden de locks determinístico (anti-deadlock)
    expect(rpc).toContain("SET search_path TO 'public, pg_temp'");
  });

  it("RPC SOLO service_role: sin anon/public/authenticated EXECUTE", () => {
    expect(rpc).toContain("p_workspace_id");
    expect(rpc).toContain("WORKSPACE_MISMATCH");
    expect(rpc).toMatch(/REVOKE ALL ON FUNCTION public\.confirm_bank_reconciliation_v1[\s\S]*FROM PUBLIC, anon, authenticated/);
    expect(rpc).toContain("TO service_role");
    expect(rpc).not.toContain("TO authenticated, service_role");
  });

  it("actor no falsificable: valida p_created_by contra app_users del workspace", () => {
    expect(rpc).toContain("INVALID_ACTOR");
    expect(rpc).toMatch(/FROM public\.app_users[\s\S]*company_id = p_workspace_id/);
    expect(rpc).toContain("is_active IS NOT FALSE");
  });

  it("idempotencia con detección de conflicto y saldo sin aplicar", () => {
    expect(rpc).toContain("already_confirmed");
    expect(rpc).toContain("already_linked");
    expect(rpc).toContain("already_reversed");
    expect(rpc).toContain("IDEMPOTENCY_CONFLICT");
    expect(rpc).toContain("unappliedAmount");
  });
});

describe("scope de sugerencias (historical_review) — contrato de migración aditiva", () => {
  it("agrega suggestion_scope con default operational y dominio de 3 valores", () => {
    expect(scope).toContain("ADD COLUMN IF NOT EXISTS suggestion_scope TEXT NOT NULL DEFAULT 'operational'");
    expect(scope).toMatch(
      /CHECK \(suggestion_scope IN \('operational','historical_review','matched_audit'\)\)/
    );
  });

  it("idempotencia por ÁMBITO: reemplaza brs_active_uidx por índice que incluye suggestion_scope", () => {
    expect(scope).toContain("DROP INDEX IF EXISTS public.brs_active_uidx");
    expect(scope).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS brs_active_scope_uidx[\s\S]*bank_movement_id, engine_version, suggestion_scope[\s\S]*WHERE status IN \('generated','pending_review'\)/
    );
  });

  it("índice de consulta por ámbito + aditiva (sin DROP TABLE/COLUMN de datos)", () => {
    expect(scope).toContain("brs_ws_scope_status_idx");
    expect(scope).not.toMatch(/DROP TABLE(?! IF)/);
    // El único DROP COLUMN permitido vive en el rollback conceptual comentado.
    expect(scope).not.toMatch(/^\s*ALTER TABLE[^\n]*DROP COLUMN/m);
  });

  it("las 5 filas existentes quedan operational (backfill explícito, sin reclasificar matched)", () => {
    expect(scope).toMatch(/UPDATE public\.bank_reconciliation_suggestions[\s\S]*SET suggestion_scope = 'operational'/);
    expect(scope).toContain("NO se reclasifican a matched_audit");
  });
});

describe("acciones de revisión (BANK-HISTORICAL-REVIEW-ACTIONS-001) — contrato de migración", () => {
  it("amplía event_type con los 3 tipos de revisión (aditivo)", () => {
    expect(reviewActions).toContain("suggestion_reviewed");
    expect(reviewActions).toContain("suggestion_note_added");
    expect(reviewActions).toContain("suggestion_rejected");
    // Conserva los tipos previos.
    expect(reviewActions).toContain("reconciliation_confirmed");
    expect(reviewActions).toContain("suggestion_created");
  });

  it("crea las 3 RPC SECURITY INVOKER con search_path fijo", () => {
    for (const fn of [
      "review_bank_suggestion_v1",
      "reject_bank_suggestion_v1",
      "add_bank_suggestion_note_v1",
    ]) {
      expect(reviewActions).toContain(`FUNCTION public.${fn}`);
    }
    expect(reviewActions).toContain("SECURITY INVOKER");
    expect(reviewActions).toContain("SET search_path TO 'public, pg_temp'");
  });

  it("revisada usa reviewed_at (Modelo A): NO agrega status='reviewed'", () => {
    expect(reviewActions).toContain("SET reviewed_at = now(), reviewed_by = p_actor");
    expect(reviewActions).not.toMatch(/status\s*=\s*'reviewed'/);
    expect(reviewActions).not.toMatch(/'reviewed'::text/);
  });

  it("rechazo exige reason y setea status='rejected'", () => {
    expect(reviewActions).toContain("REASON_INVALID");
    expect(reviewActions).toMatch(/length\(v_reason\)\s*<\s*3/);
    expect(reviewActions).toContain("SET status = 'rejected'");
  });

  it("atómico: UPDATE de suggestion + INSERT de event en la misma función", () => {
    // review y reject actualizan la suggestion y luego insertan el evento.
    expect(reviewActions).toMatch(/UPDATE public\.bank_reconciliation_suggestions[\s\S]*INSERT INTO public\.reconciliation_events[\s\S]*suggestion_reviewed/);
    expect(reviewActions).toMatch(/SET status = 'rejected'[\s\S]*INSERT INTO public\.reconciliation_events[\s\S]*suggestion_rejected/);
  });

  it("NO reutiliza RPC financieras ni escribe links/allocations", () => {
    expect(reviewActions).not.toContain("confirm_bank_reconciliation_v1");
    expect(reviewActions).not.toContain("reverse_bank_reconciliation_v1");
    expect(reviewActions).not.toMatch(/INSERT INTO public\.bank_movement_reconciliation_links/);
    expect(reviewActions).not.toMatch(/INSERT INTO public\.payment_allocations/);
  });

  it("nota es append-only (solo INSERT event) y con idempotencia por token", () => {
    expect(reviewActions).toMatch(/'suggestion_note_added'[\s\S]*clientToken/);
    // La función de nota no hace UPDATE de la suggestion.
    const noteFn = reviewActions.slice(reviewActions.indexOf("add_bank_suggestion_note_v1"));
    expect(noteFn).not.toMatch(/UPDATE public\.bank_reconciliation_suggestions/);
  });

  it("permisos SOLO service_role (sin anon/public/authenticated)", () => {
    expect(reviewActions).toMatch(/REVOKE ALL ON FUNCTION[\s\S]*FROM PUBLIC, anon, authenticated/);
    expect(reviewActions).toContain("GRANT EXECUTE ON FUNCTION %s TO service_role");
  });
});
