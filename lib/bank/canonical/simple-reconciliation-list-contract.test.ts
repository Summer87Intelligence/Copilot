import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * FASE BANK-SIMPLE-FLOW-COMPLETION-001 — Conciliación pasa a ser una lista
 * plana de movimientos (sección 4), reemplazando clusters/recibos/colas
 * como flujo principal. Contrato estático (mismo patrón que
 * bank-history-panel-contract.test.ts): el proyecto no usa
 * @testing-library/react para componentes de Banco.
 */

const list = readFileSync(
  join(process.cwd(), "components", "copilot", "bank-movements", "simple-reconciliation-list.tsx"),
  "utf8"
);
const pageClient = readFileSync(
  join(process.cwd(), "components", "copilot", "bank-movements", "bank-movements-page-client.tsx"),
  "utf8"
);

describe("SimpleReconciliationList — lista plana, sin clusters/recibos/colas", () => {
  it("no hace su propio fetch: recibe movimientos ya cargados como props (una sola fuente de verdad)", () => {
    expect(list).not.toMatch(/fetch\(/);
    expect(list).toContain("movements: BankMovement[]");
    expect(list).toContain("movementLevels: Record<string, MovementReconciliationLevel>");
  });

  it("columnas desktop exactas: Fecha/Descripción Santander/Importe/Cliente/Estado/Acción", () => {
    expect(list).toContain(">Fecha<");
    expect(list).toContain(">Descripción Santander<");
    expect(list).toContain(">Importe<");
    expect(list).toContain(">Cliente<");
    expect(list).toContain(">Estado<");
    expect(list).toContain(">Acción<");
  });

  it("tiene vista de cards para mobile (sm:hidden / hidden sm:block)", () => {
    expect(list).toContain("sm:hidden");
    expect(list).toContain("hidden overflow-x-auto sm:block");
  });

  it("usa el modelo de 7 estados simples, nunca los 8 niveles técnicos ni vocabulario de clusters", () => {
    expect(list).toContain("deriveSimpleMovementState");
    expect(list).toContain("SIMPLE_MOVEMENT_STATE_LABEL");
    expect(list).not.toMatch(/Revisar N listos|Revisar uno por uno|Confirmar con recibo|payerCluster|clusterKey/);
  });

  it("filtros mínimos: búsqueda, moneda, estado; orden por fecha/importe", () => {
    expect(list).toContain("Buscar");
    expect(list).toContain("Moneda");
    expect(list).toContain("Estado");
    expect(list).toContain("date_desc");
    expect(list).toContain("date_asc");
    expect(list).toContain("amount_desc");
    expect(list).toContain("amount_asc");
  });

  it("acción de fila abre el mismo panel de asociación (onOpenAssociation), nunca navega a otra pantalla", () => {
    expect(list).toContain("onOpenAssociation: (movementId: string) => void");
    expect(list).toContain("onClick={() => onOpenAssociation(movement.id)}");
  });

  it("bank-movements-page-client monta SimpleReconciliationList bajo Conciliación con la misma fuente de datos que Movimientos", () => {
    expect(pageClient).toMatch(/tab === "conciliacion" \? \(/);
    expect(pageClient).toContain("<SimpleReconciliationList");
    expect(pageClient).toContain("movements={movements}");
    expect(pageClient).toContain("movementLevels={movementLevels}");
    expect(pageClient).toContain("movementClients={movementClients}");
  });
});
