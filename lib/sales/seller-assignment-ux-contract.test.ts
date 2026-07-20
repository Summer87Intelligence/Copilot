import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * FASE SALES-DOCUMENT-SELLER-INLINE-UX-AND-IDENTITY-FIX-001 — contrato
 * estático sobre el código fuente (el proyecto no usa @testing-library/react,
 * así que esto reemplaza un test de render real, siguiendo el mismo patrón ya
 * usado para migraciones en `reconciliation-schema-contract.test.ts`).
 *
 * Bloquea la regresión reportada: después de asignar un vendedor no debe
 * dispararse un refetch completo de la sección, y la identidad de cada fila
 * debe ser siempre `documentId` (UUID), nunca número visible / línea / índice.
 */

const ROOT = join(process.cwd(), "components", "copilot");
const detalleTab = readFileSync(join(ROOT, "ventas", "ventas-detalle-tab.tsx"), "utf8");
const cliente360Tab = readFileSync(join(ROOT, "clientes", "tabs", "ventas-tab.tsx"), "utf8");
const sellerSelect = readFileSync(join(ROOT, "ventas", "seller-select.tsx"), "utf8");

describe("Ventas → Detalle: sin recarga completa tras asignar vendedor", () => {
  it("el callback onAssigned del selector de vendedor NUNCA llama load()", () => {
    // Debe existir un `onAssigned={(nextId, nextName) => patchRowsForDocument(...)}`
    // y NO un `onAssigned={() => void load()}` como antes de esta fase.
    expect(detalleTab).not.toMatch(/onAssigned=\{\(\)\s*=>\s*void load\(\)\}/);
    expect(detalleTab).toContain("patchRowsForDocument");
  });

  it("el patch local usa documentId (identidad), no lineId ni documentNumber", () => {
    expect(detalleTab).toMatch(/patchRowsForDocument\(r\.documentId,\s*nextId,\s*nextName\)/);
    expect(detalleTab).toMatch(/patchRowsForDocument\(detailRow\.documentId,\s*nextId,\s*nextName\)/);
    expect(detalleTab).toContain("patchRowsByDocumentId");
  });

  it("solo se renderiza UN selector por documento (isFirstLineOfDoc); otras líneas muestran indicador de agrupación", () => {
    expect(detalleTab).toContain("r.isFirstLineOfDoc");
    expect(detalleTab).toContain("mismo comprobante");
  });

  it("hay una revalidación en background (debounced) de métricas, no un refetch de Detalle", () => {
    expect(detalleTab).toContain("onSellerAssigned");
    expect(detalleTab).not.toMatch(/onSellerAssigned[\s\S]{0,40}void load\(\)/);
  });
});

describe("Ventas → Detalle: filtros/búsqueda/página no se resetean al asignar", () => {
  it("load() solo se dispara desde el efecto atado a los filtros (qs), no desde la asignación", () => {
    // El único `void load()` restante debe ser el del useEffect de montaje/filtros.
    const matches = detalleTab.match(/void load\(\)/g) ?? [];
    expect(matches.length).toBe(1);
  });
});

describe("Cliente 360 → Ventas: mismo contrato de identidad", () => {
  it("no dispara refetch completo al asignar; usa patchDocumentSeller por documentId", () => {
    expect(cliente360Tab).not.toMatch(/onAssigned=\{\(\)\s*=>\s*void load\(\)\}/);
    expect(cliente360Tab).toContain("patchDocumentSeller");
    expect(cliente360Tab).toContain("patchRowsByDocumentId");
    expect(cliente360Tab).toMatch(/patchDocumentSeller\(inv\.documentId,\s*nextId,\s*nextName\)/);
  });
});

describe("SellerSelect: optimista, revierte solo esta fila, nunca window.location/router.refresh", () => {
  it("no usa window.location.reload ni router.refresh", () => {
    expect(sellerSelect).not.toMatch(/window\.location\.reload/);
    expect(sellerSelect).not.toMatch(/router\.refresh/);
  });

  it("actualiza el estado local ANTES de esperar la respuesta (optimista) y revierte en error", () => {
    expect(sellerSelect).toMatch(/setLocalSellerId\(nextId\)/);
    expect(sellerSelect).toMatch(/setLocalSellerId\(previousId\)/);
  });

  it("el reset de estado local depende solo de documentId (identidad), no de sellerId en cada render", () => {
    expect(sellerSelect).toMatch(/\},\s*\[documentId\]\)/);
  });
});
