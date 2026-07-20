import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * FASE SALES-DOCUMENT-SELLER-AUDIT-CORRECTION-001 — Contrato de esquema
 * (estático sobre el SQL de la migración pendiente, sin Postgres). La
 * migración `20260722120000_sales_document_salesperson_audit.sql` está
 * CREADA pero NO APLICADA (requiere autorización); estos tests garantizan
 * las invariantes de diseño anti-drift antes de esa autorización.
 */

const MIG = join(process.cwd(), "supabase", "migrations");
const sql = readFileSync(join(MIG, "20260722120000_sales_document_salesperson_audit.sql"), "utf8");

describe("sales_document_salesperson_audit — contrato de esquema", () => {
  it("crea únicamente la tabla de auditoría (aditivo, IF NOT EXISTS)", () => {
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.sales_document_salesperson_audit");
  });

  it("tiene la constraint de cambio real usando IS DISTINCT FROM (null-safe), no <>", () => {
    expect(sql).toContain("CONSTRAINT sales_document_salesperson_audit_change_chk");
    expect(sql).toMatch(/CHECK\s*\(previous_seller_id IS DISTINCT FROM new_seller_id\)/);
    // <> no cubre NULL <> NULL correctamente (sería UNKNOWN, no rechazaría null=null) — no debe usarse.
    expect(sql).not.toMatch(/CHECK\s*\(previous_seller_id\s*<>\s*new_seller_id\)/);
  });

  it("mantiene FKs y timestamp server-side", () => {
    expect(sql).toMatch(/previous_seller_id UUID\s+NULL REFERENCES public\.sales_salespersons\(id\)/);
    expect(sql).toMatch(/new_seller_id\s+UUID\s+NULL REFERENCES public\.sales_salespersons\(id\)/);
    expect(sql).toMatch(/workspace_id\s+UUID\s+NOT NULL REFERENCES public\.companies\(id\)/);
    expect(sql).toMatch(/changed_by\s+UUID\s+NULL REFERENCES public\.app_users\(id\)/);
    expect(sql).toMatch(/changed_at\s+TIMESTAMPTZ NOT NULL DEFAULT now\(\)/);
  });

  it("es append-only: solo policies SELECT e INSERT, nunca UPDATE/DELETE", () => {
    expect(sql).toContain('FOR SELECT TO authenticated');
    expect(sql).toContain('FOR INSERT TO authenticated');
    expect(sql).not.toMatch(/FOR UPDATE TO authenticated[\s\S]*sales_document_salesperson_audit/);
    expect(sql).not.toContain("sales_document_salesperson_audit_update");
    expect(sql).not.toContain("sales_document_salesperson_audit_delete");
  });

  it("RLS habilitada, scope por workspace", () => {
    expect(sql).toContain("ALTER TABLE public.sales_document_salesperson_audit ENABLE ROW LEVEL SECURITY");
    expect(sql).toMatch(/USING \(workspace_id = public\.copilot_current_workspace_company_id\(\)\)/);
    expect(sql).toMatch(/WITH CHECK \(workspace_id = public\.copilot_current_workspace_company_id\(\)\)/);
  });

  it("no agrega índice por actor (changed_by) — sin necesidad real hoy", () => {
    expect(sql).not.toMatch(/CREATE INDEX[^;]*changed_by/);
  });

  it("no contiene DML ni backfill", () => {
    expect(sql).not.toMatch(/\bUPDATE\s+public\./i);
    expect(sql).not.toMatch(/\bDELETE\s+FROM\b/i);
    expect(sql).not.toMatch(/\bTRUNCATE\b/i);
    expect(sql).not.toMatch(/\bINSERT INTO\b/i);
  });

  it("no toca proto_invoices, sales_salespersons, sales_client_salespersons ni sales_document_salespersons (solo referencia por FK)", () => {
    expect(sql).not.toMatch(/ALTER TABLE public\.proto_invoices/);
    expect(sql).not.toMatch(/ALTER TABLE public\.sales_salespersons\b/);
    expect(sql).not.toMatch(/ALTER TABLE public\.sales_client_salespersons/);
    expect(sql).not.toMatch(/ALTER TABLE public\.sales_document_salespersons\b/);
    expect(sql).not.toMatch(/CREATE TRIGGER[^;]*ON public\.sales_document_salespersons\b/);
  });

  it("no toca tablas de Banco", () => {
    expect(sql).not.toMatch(/bank_/i);
  });
});

/**
 * Réplica pura de la semántica `IS DISTINCT FROM` de Postgres para UUID
 * nullable (comparación null-safe: null IS DISTINCT FROM null → false).
 * Verifica los casos exigidos por la especificación de la fase, independiente
 * de tener Postgres disponible en el entorno de test.
 */
function isDistinctFrom(a: string | null, b: string | null): boolean {
  if (a === null && b === null) return false;
  if (a === null || b === null) return true;
  return a !== b;
}

describe("semántica del CHECK — IS DISTINCT FROM (previous, new)", () => {
  it("rechaza (previous=new): null→null y Daniel→Daniel", () => {
    expect(isDistinctFrom(null, null)).toBe(false); // rechazado por el CHECK
    expect(isDistinctFrom("daniel", "daniel")).toBe(false); // rechazado por el CHECK
    expect(isDistinctFrom("camila", "camila")).toBe(false); // rechazado por el CHECK
  });

  it("acepta cambios reales: null→Daniel, Daniel→Camila, Camila→null", () => {
    expect(isDistinctFrom(null, "daniel")).toBe(true);
    expect(isDistinctFrom("daniel", "camila")).toBe(true);
    expect(isDistinctFrom("camila", null)).toBe(true);
  });
});
