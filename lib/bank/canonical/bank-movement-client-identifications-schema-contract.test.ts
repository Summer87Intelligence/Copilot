import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Contrato estático de la migración local (NO aplicada) de
 * `bank_movement_client_identifications`. Verifica que la tabla nunca se
 * confunda semánticamente con la conciliación financiera real.
 */

const sql = readFileSync(
  join(process.cwd(), "supabase", "migrations", "20260726120000_bank_movement_client_identifications.sql"),
  "utf8"
);

describe("bank_movement_client_identifications — schema contract", () => {
  it("documenta que no está aplicada y es aditiva", () => {
    expect(sql).toMatch(/NO APLICAR/);
    expect(sql).toMatch(/ADITIVA/);
  });

  it("nunca declara receipt_id ni target_type/target_id como columna propia (contrato de link financiero)", () => {
    expect(sql).not.toMatch(/^\s*receipt_id\s+/im);
    expect(sql).not.toMatch(/^\s*target_type\s+/im);
    expect(sql).not.toMatch(/^\s*target_id\s+/im);
  });

  it("no crea FK ni columnas hacia tablas financieras (allocations, reconciliation links/events) — solo puede mencionarlas en comentarios explicando la separación", () => {
    expect(sql).not.toMatch(/REFERENCES public\.payment_allocations/i);
    expect(sql).not.toMatch(/REFERENCES public\.bank_movement_reconciliation_links/i);
    expect(sql).not.toMatch(/REFERENCES public\.reconciliation_events/i);
    expect(sql).not.toMatch(/INSERT INTO public\.(payment_allocations|bank_movement_reconciliation_links|reconciliation_events)/i);
  });

  it("tiene los estados requeridos por la fase, ninguno implica conciliación financiera", () => {
    expect(sql).toContain("'identified'");
    expect(sql).toContain("'shared_account'");
    expect(sql).toContain("'third_party'");
    expect(sql).toContain("'excluded'");
    expect(sql).toContain("'revoked'");
    // Nunca un estado que se lea como "conciliado"/"pagado".
    expect(sql).not.toMatch(/'conciliad/i);
    expect(sql).not.toMatch(/'pagad/i);
  });

  it("una identificación activa por movimiento vía índice único parcial (no un UNIQUE total)", () => {
    expect(sql).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS bmci_active_uidx/);
    expect(sql).toMatch(/WHERE status NOT IN \('excluded','revoked'\)/);
  });

  it("RLS habilitado por workspace, sin grants a anon/public", () => {
    expect(sql).toContain("ENABLE ROW LEVEL SECURITY");
    expect(sql).toContain("copilot_current_workspace_company_id()");
    expect(sql).not.toMatch(/TO\s+anon/i);
    expect(sql).not.toMatch(/TO\s+public/i);
  });

  it("referencia bank_movements y proto_companies (movimiento→cliente), y bank_payer_identities es opcional", () => {
    expect(sql).toMatch(/REFERENCES public\.bank_movements\(id\)/);
    expect(sql).toMatch(/REFERENCES public\.proto_companies\(id\)/);
    expect(sql).toMatch(/payer_identity_id\s+UUID\s+NULL REFERENCES public\.bank_payer_identities\(id\)/);
  });
});
