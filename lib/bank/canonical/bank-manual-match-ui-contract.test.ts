import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * FASE BANK-MANUAL-CANONICAL-MATCH-SELECTION-001, secciones 4/12/13 —
 * contrato estático de `ManualMatchSelector` (drawer de Ingresos): cambiar
 * de cliente limpia recibo/facturas, el motivo es obligatorio para habilitar
 * "Confirmar selección manual", y la selección nunca navega de tab ni llama
 * ningún endpoint de escritura antes del confirm explícito.
 */

const evidenceUi = readFileSync(
  join(process.cwd(), "components", "copilot", "bank-movements", "canonical-evidence-ui.tsx"),
  "utf8"
);

describe("ManualMatchSelector — cambiar cliente limpia recibo y facturas", () => {
  it("selectClient limpia selectedReceiptId y selectedInvoices al elegir un cliente", () => {
    const fn = evidenceUi.match(/const selectClient = \(client: ClientOption\) => \{[\s\S]*?\n  \};/)![0];
    expect(fn).toContain("setSelectedReceiptId(null)");
    expect(fn).toContain("setSelectedInvoices({})");
  });

  it("changeClient (volver a buscar) también limpia recibo y facturas", () => {
    const fn = evidenceUi.match(/const changeClient = \(\) => \{[\s\S]*?\n  \};/)![0];
    expect(fn).toContain("setSelectedReceiptId(null)");
    expect(fn).toContain("setSelectedInvoices({})");
  });

  it("elegir un recibo distinto limpia la selección de facturas previa", () => {
    const radioBlock = evidenceUi.match(/onChange=\{\(\) => \{\s*setSelectedReceiptId\(r\.id\);\s*setSelectedInvoices\(\{\}\);\s*\}\}/);
    expect(radioBlock).not.toBeNull();
  });
});

describe("ManualMatchSelector — motivo Y recibo obligatorios para confirmar", () => {
  it("canConfirm exige selectedClient + selectedReceiptId + reasonText de al menos 3 caracteres", () => {
    expect(evidenceUi).toContain(
      "const canConfirm = selectedClient != null && selectedReceiptId != null && reasonText.length >= 3"
    );
  });

  it("el botón 'Confirmar selección manual' está deshabilitado cuando !canConfirm", () => {
    const buttonBlock = evidenceUi.match(/Confirmar selección manual[\s\S]{0,0}/);
    expect(evidenceUi).toMatch(/disabled=\{!canConfirm\}[\s\S]*?Confirmar selección manual/);
  });

  it("BANK-V3-APPLY-PDF-IMPORT-FIX-AND-DEMO-READY-001: recibo obligatorio evita ejercitar el bug latente de la RPC con p_receipt_id=NULL en conexiones frías", () => {
    // El comentario explicativo debe estar presente junto al guard, documentando el motivo.
    expect(evidenceUi).toMatch(/Recibo obligatorio[\s\S]{0,400}canConfirm = selectedClient != null && selectedReceiptId != null/);
  });
});

describe("ManualMatchSelector — búsqueda server-side, sin escritura antes de confirmar", () => {
  it("busca clientes vía GET a clients-search (nunca POST/PATCH/DELETE) con debounce", () => {
    expect(evidenceUi).toContain("/api/copilot/bank-reconciliation/clients-search?q=");
    expect(evidenceUi).toContain("setTimeout(() => {");
  });

  it("busca recibos/facturas vía GET a receipts-search, acotado por clientId+currency", () => {
    expect(evidenceUi).toMatch(/receipts-search\?clientId=\$\{encodeURIComponent\(client\.id\)\}&currency=\$\{encodeURIComponent\(item\.movement\.currency\)\}/);
  });

  it("la única escritura ocurre al invocar onConfirm (mode='manual_reviewed'), nunca antes", () => {
    expect(evidenceUi).toContain('mode: "manual_reviewed"');
    // La búsqueda de clientes/recibos usa fetch GET plano (sin method:"POST"), separado de postJson.
    const manualSelectorSrc = evidenceUi.split("function ManualMatchSelector")[1] ?? "";
    expect(manualSelectorSrc).not.toMatch(/method:\s*["'](POST|PATCH|DELETE)["']/);
  });

  it("no navega de tab ni recarga la página al buscar/seleccionar (sin router.push/window.location)", () => {
    const manualSelectorSrc = evidenceUi.split("function ManualMatchSelector")[1] ?? "";
    expect(manualSelectorSrc).not.toContain("router.push");
    expect(manualSelectorSrc).not.toContain("window.location");
  });
});

describe("ManualMatchSelector — recibos ya usados no son seleccionables", () => {
  it("el radio de un recibo usado está disabled", () => {
    expect(evidenceUi).toMatch(/disabled=\{r\.used\}/);
  });
});
