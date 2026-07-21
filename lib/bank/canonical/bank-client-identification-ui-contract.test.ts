import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * FASE BANK-CLIENT-IDENTIFICATION-SCHEMA-APPLY-AND-BATCH-UI-001 — contrato
 * estático sobre el código fuente (el proyecto no usa @testing-library/react;
 * mismo patrón que `bank-canonical-routing-contract.test.ts`). Verifica la
 * navegación de Conciliación (dos sub-vistas, sin tabs principales nuevos) y
 * que la vista "Identificar clientes" nunca escribe en tablas financieras.
 */

const COMPONENTS_ROOT = join(process.cwd(), "components", "copilot", "bank-movements");
const pageClient = readFileSync(join(COMPONENTS_ROOT, "bank-movements-page-client.tsx"), "utf8");
const identificationWorkspace = readFileSync(
  join(COMPONENTS_ROOT, "bank-client-identification-workspace.tsx"),
  "utf8"
);

describe("Conciliación: dos sub-vistas, sin tabs principales nuevos", () => {
  it("TABS de Banco siguen siendo exactamente 4 (Importar/Movimientos/Conciliación/Historial)", () => {
    const tabsBlock = pageClient.match(/const TABS[\s\S]*?\];/)![0];
    const ids = [...tabsBlock.matchAll(/id:\s*"([a-z]+)"/g)].map((m) => m[1]);
    expect(ids).toEqual(["importar", "movimientos", "conciliacion", "historial"]);
  });

  it("dentro de Conciliación existen exactamente las sub-vistas Identificar clientes / Vincular recibos", () => {
    expect(pageClient).toContain("Identificar clientes");
    expect(pageClient).toContain("Vincular recibos");
    expect(pageClient).toContain("BankClientIdentificationWorkspace");
    expect(pageClient).toContain("BankIncomeWorkspace");
  });

  it("Identificar clientes es la sub-vista por defecto", () => {
    expect(pageClient).toMatch(/useState<"identificar" \| "vincular">\("identificar"\)/);
  });
});

describe("BankClientIdentificationWorkspace: nunca escribe en tablas financieras", () => {
  it("solo llama a los endpoints de identificación de cliente, nunca a confirm/reject/manual-draft", () => {
    expect(identificationWorkspace).toContain("/api/copilot/bank-reconciliation/payer-clusters");
    expect(identificationWorkspace).toContain("/api/copilot/bank-reconciliation/client-identifications");
    expect(identificationWorkspace).not.toMatch(/\/bank-reconciliation\/\$\{[^}]+\}\/confirm/);
    expect(identificationWorkspace).not.toMatch(/\/bank-reconciliation\/\$\{[^}]+\}\/reject/);
    expect(identificationWorkspace).not.toContain("/bank-reconciliation/manual-draft");
  });

  it("el resumen de confirmación aclara explícitamente que no se modifica recibo ni factura", () => {
    expect(identificationWorkspace).toContain("Ningún recibo ni factura será modificado");
  });

  it("nunca llama la palabra 'Conciliado' para una mera identificación (solo para full/reconciled)", () => {
    const label = identificationWorkspace.match(/MOVEMENT_STATUS_LABEL[\s\S]*?};/)![0];
    // "Conciliado" solo debe aparecer asociado a full_reconciliation/reconciled_with_receipt.
    expect(label).toMatch(/full_reconciliation:\s*"Conciliado"/);
    expect(label).toMatch(/reconciled_with_receipt:\s*"Conciliado"/);
    expect(label).toMatch(/client_identified:\s*"Con recibo"/);
    expect(label).toMatch(/missing_receipt:\s*"Falta recibo en Zeta"/);
  });

  it("expone las 4 evidencias del modelo (fuerte/probable/ambigua/sin candidato)", () => {
    expect(identificationWorkspace).toContain("Coincidencia fuerte");
    expect(identificationWorkspace).toContain("Coincidencia probable");
    expect(identificationWorkspace).toContain("Ambigua");
    expect(identificationWorkspace).toContain("Sin cliente sugerido");
  });

  it("permite excluir movimientos individualmente antes de confirmar (checkbox por fila)", () => {
    expect(identificationWorkspace).toContain("toggleMovement");
    expect(identificationWorkspace).toMatch(/type="checkbox"/);
  });

  it("busca clientes server-side (nunca carga el portfolio completo)", () => {
    expect(identificationWorkspace).toContain("/api/copilot/bank-reconciliation/clients-search");
  });

  it("pagina y busca server-side (no renderiza los 479 movimientos de una vez)", () => {
    expect(identificationWorkspace).toMatch(/page:\s*String\(page\)/);
    expect(identificationWorkspace).toContain("pageSize");
    expect(identificationWorkspace).toMatch(/params\.set\("search"/);
  });

  it("carga el detalle de un cluster de forma lazy (recién al abrir el drawer)", () => {
    expect(identificationWorkspace).toMatch(/payer-clusters\/\$\{encodeURIComponent\(/);
  });
});
