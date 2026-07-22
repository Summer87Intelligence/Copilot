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

describe("Conciliación: vista única unificada, sin tabs principales nuevos", () => {
  it("TABS de Banco siguen siendo exactamente 4 (Importar/Movimientos/Conciliación/Historial)", () => {
    const tabsBlock = pageClient.match(/const TABS[\s\S]*?\];/)![0];
    const ids = [...tabsBlock.matchAll(/id:\s*"([a-z]+)"/g)].map((m) => m[1]);
    expect(ids).toEqual(["importar", "movimientos", "conciliacion", "historial"]);
  });

  // FASE BANK-SIMPLE-FLOW-COMPLETION-001 — Conciliación ya no exige elegir
  // entre "Identificar clientes"/"Vincular recibos" NI monta la vista
  // unificada de clusters: es una lista plana de movimientos que abre el
  // mismo panel simple de asociación que Movimientos.
  it("Conciliación monta la lista plana simple, no las sub-vistas ni la infraestructura vieja de clusters/recibos", () => {
    expect(pageClient).not.toContain('useState<"identificar" | "vincular">');
    expect(pageClient).not.toContain(">Identificar clientes<");
    expect(pageClient).not.toContain(">Vincular recibos<");
    expect(pageClient).toContain("SimpleReconciliationList");
    expect(pageClient).not.toContain("UnifiedReconciliationWorkspace");
    expect(pageClient).not.toContain("ClusterReviewDrawer");
    expect(pageClient).not.toContain("FocusedReceiptConfirmDrawer");
    expect(pageClient).not.toMatch(/fixed inset-0[\s\S]{0,200}BankIncomeWorkspace/);
  });

  it("la vista unificada nunca reimplementa el clustering/matching: compone las mismas APIs read-only ya existentes", () => {
    const unifiedWorkspace = readFileSync(
      join(COMPONENTS_ROOT, "unified-reconciliation-workspace.tsx"),
      "utf8"
    );
    expect(unifiedWorkspace).toContain("/api/copilot/bank-reconciliation/unified-cases");
    expect(unifiedWorkspace).toContain("/api/copilot/bank-reconciliation/client-identifications");
  });

  it("detalle unificado muestra cliente/recibo/factura/estado/acción y tarjetas en mobile", () => {
    const unifiedWorkspace = readFileSync(
      join(COMPONENTS_ROOT, "unified-reconciliation-workspace.tsx"),
      "utf8"
    );
    expect(unifiedWorkspace).toContain(">Factura<");
    expect(unifiedWorkspace).toMatch(/Cliente\s*[·•]/);
    expect(unifiedWorkspace).toContain("invoiceContextLabel");
    expect(unifiedWorkspace).toContain("UnifiedRowCard");
    expect(unifiedWorkspace).toContain("md:hidden");
    expect(unifiedWorkspace).toContain("Cambiar cliente");
    expect(unifiedWorkspace).toContain("No hay reversión segura desde esta pantalla.");
    expect(unifiedWorkspace).not.toMatch(/>\s*clusterKey\s*</);
    expect(unifiedWorkspace).not.toMatch(/suggestion|allocation|payer identity|manual draft/i);
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

  it("BANK-FULL-RECONCILIATION-UI-CORRECTION-001: usa el label canónico compartido, no un mapa local duplicado", () => {
    expect(identificationWorkspace).toContain(
      'import { MOVEMENT_LEVEL_LABEL } from "@/lib/bank/canonical/movement-reconciliation-level-labels"'
    );
    expect(identificationWorkspace).not.toContain("const MOVEMENT_STATUS_LABEL");
  });

  it("nunca llama la palabra 'Conciliado' para una mera identificación (solo para full/reconciled)", () => {
    const labelsSource = readFileSync(
      join(process.cwd(), "lib", "bank", "canonical", "movement-reconciliation-level-labels.ts"),
      "utf8"
    );
    expect(labelsSource).toMatch(/full_reconciliation:\s*"Conciliación completa"/);
    expect(labelsSource).toMatch(/reconciled_with_receipt:\s*"Conciliado con recibo"/);
    expect(labelsSource).toMatch(/client_identified:\s*"Cliente identificado"/);
    expect(labelsSource).toMatch(/missing_receipt:\s*"Falta recibo en Zeta"/);
    expect(identificationWorkspace).not.toMatch(/>\s*Conciliado\s*</);
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
