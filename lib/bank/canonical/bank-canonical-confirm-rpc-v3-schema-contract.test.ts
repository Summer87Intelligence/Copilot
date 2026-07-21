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
 *
 * FASE BANK-CONFIRM-RPC-V3-MIGRATION-CORRECTION-001 — la primera versión de
 * este archivo derivaba `bank_movement_reconciliation_links.method` de
 * `p_metadata->>'mode'` (`'manual_reviewed'` cuando correspondía), lo cual
 * hubiera violado el CHECK real de esa columna en producción
 * (`bank_movement_reconciliation_links_method_check`, capturado en vivo:
 * `CHECK ((method = ANY (ARRAY['manual'::text, 'suggested_confirmed'::text])))`,
 * ver `supabase/migrations/20260717003453_bank_movement_reconciliation_links.sql`).
 * No fue detectado por los tests anteriores porque eran puramente textuales
 * y nunca verificaban el valor insertado contra el conjunto real permitido.
 * Los tests de este bloque cierran ese gap: NUNCA se ejecuta contra Postgres
 * real (no hay `LOCAL_PG_URL` disponible en este entorno — limitación
 * documentada, igual que `reconciliation-postgres.pg.test.ts`), pero el
 * conjunto permitido se fija como fixture tomado del CHECK real capturado
 * esta fase, y se verifica que el INSERT del archivo solo pueda producir
 * valores de ese conjunto.
 */

const MIG = join(process.cwd(), "supabase", "migrations");
const v2Sql = readFileSync(join(MIG, "20260722130000_bank_reconciliation_confirm_rpc_v2.sql"), "utf8");
const v3Sql = readFileSync(join(MIG, "20260723120000_bank_reconciliation_confirm_rpc_v3.sql"), "utf8");

/**
 * Fixture: conjunto real permitido por `bank_movement_reconciliation_links_method_check`
 * en producción (`erzdifkvvailxnwdukzf`), capturado vía `execute_sql` el 2026-07-21
 * durante BANK-CONFIRM-RPC-V3-MIGRATION-CORRECTION-001. Si el CHECK real cambia,
 * este fixture debe actualizarse explícitamente — nunca inferirse del código.
 */
const REAL_METHOD_CHECK_ALLOWED_VALUES = ["manual", "suggested_confirmed"] as const;

describe("confirm_bank_reconciliation_v1 (v3) — contrato de esquema", () => {
  it("agrega ÚNICAMENTE p_metadata, aditivo con DEFAULT, al final de la firma", () => {
    expect(v2Sql).not.toContain("p_metadata");
    expect(v3Sql).toContain("p_metadata       jsonb DEFAULT '{}'::jsonb");
  });

  it("el modo 'suggested' (llamada sin p_metadata) sigue siendo válido: v_metadata usa coalesce sobre el parámetro opcional", () => {
    expect(v3Sql).toContain("v_metadata   jsonb := coalesce(p_metadata, '{}'::jsonb)");
  });

  it("Sección 7.B: omitir p_metadata y enviar p_metadata='{}'::jsonb explícito producen el MISMO v_metadata — sin regresión por prueba de razonamiento sobre COALESCE", () => {
    // COALESCE(NULL, '{}') = '{}' y COALESCE('{}', '{}') = '{}' — ambos casos producen
    // el mismo valor de v_metadata, así que el INSERT a reconciliation_events.metadata
    // (única consumidora de v_metadata) recibe idéntico contenido en ambos escenarios.
    // No requiere ejecución contra Postgres real: es una propiedad de COALESCE sobre
    // constantes, verificable por inspección del texto (single source: la declaración).
    const declarationCount = [...v3Sql.matchAll(/coalesce\(p_metadata, '\{\}'::jsonb\)/g)].length;
    expect(declarationCount).toBe(1);
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

describe("confirm_bank_reconciliation_v1 (v3) — CORRECCIÓN: method siempre pertenece al CHECK real (BANK-CONFIRM-RPC-V3-MIGRATION-CORRECTION-001)", () => {
  it("el INSERT a bank_movement_reconciliation_links asigna un literal fijo a `method`, sin CASE ni derivación de p_metadata/v_metadata", () => {
    const insertBlock = v3Sql.match(/INSERT INTO public\.bank_movement_reconciliation_links[\s\S]*?RETURNING id INTO v_link_id;/)![0];
    // No debe haber ninguna expresión condicional ni referencia a metadata dentro de este INSERT.
    expect(insertBlock).not.toMatch(/CASE\s+WHEN/i);
    expect(insertBlock).not.toContain("v_metadata");
    expect(insertBlock).not.toContain("p_metadata");
    // El valor literal asignado a `method` debe ser exactamente 'suggested_confirmed'.
    expect(insertBlock).toMatch(/'inflow',\s*\n\s*'suggested_confirmed',/);
  });

  it("el único literal insertado en `method` pertenece al conjunto real permitido por el CHECK de producción", () => {
    const insertBlock = v3Sql.match(/INSERT INTO public\.bank_movement_reconciliation_links[\s\S]*?RETURNING id INTO v_link_id;/)![0];
    const methodLiteralMatch = insertBlock.match(/'inflow',\s*\n\s*'([a-z_]+)',/);
    expect(methodLiteralMatch).not.toBeNull();
    const methodValue = methodLiteralMatch![1];
    expect(REAL_METHOD_CHECK_ALLOWED_VALUES).toContain(methodValue);
  });

  it("'manual_reviewed' JAMÁS aparece como valor candidato de `method` — solo dentro de p_metadata/comentarios/reconciliation_events", () => {
    // Toda mención de 'manual_reviewed' en el archivo debe estar fuera del bloque de
    // INSERT a bank_movement_reconciliation_links (que ya se verificó arriba que no
    // referencia metadata en absoluto).
    const insertBlock = v3Sql.match(/INSERT INTO public\.bank_movement_reconciliation_links[\s\S]*?RETURNING id INTO v_link_id;/)![0];
    expect(insertBlock).not.toContain("manual_reviewed");
    // Pero sí debe seguir existiendo como valor documentado de metadata.mode en otro lugar
    // del archivo (comentarios/COMMENT ON FUNCTION) — confirma que no se perdió la funcionalidad.
    expect(v3Sql).toContain("manual_reviewed");
  });

  it("reconciliation_events.metadata (no method) es el único lugar que persiste v_metadata — confirma el fix sin reintroducir la regresión", () => {
    const eventsInsertBlock = v3Sql.match(/INSERT INTO public\.reconciliation_events \(workspace_id, event_type, entity_type, entity_id, new_state, actor_user_id, metadata\)[\s\S]*?v_metadata\);/)![0];
    expect(eventsInsertBlock).toContain("v_metadata");
    // v_metadata debe aparecer EXACTAMENTE una vez en todo el archivo fuera de su
    // declaración/comentarios — es decir, solo en este INSERT.
    const usagesOutsideDeclaration = [...v3Sql.matchAll(/\bv_metadata\b/g)].length;
    // 1 declaración (DECLARE) + 1 uso real (este INSERT) = 2 apariciones del identificador.
    expect(usagesOutsideDeclaration).toBe(2);
  });

  // LIMITACIÓN DOCUMENTADA: estos tests son estáticos (sobre el texto del SQL, sin
  // ejecutar contra Postgres real) — este entorno no tiene LOCAL_PG_URL disponible,
  // mismo patrón/limitación que reconciliation-postgres.pg.test.ts (skip por defecto).
  // El fixture REAL_METHOD_CHECK_ALLOWED_VALUES viene de una lectura en vivo de
  // producción vía execute_sql, no de una suposición sobre el código.
});
