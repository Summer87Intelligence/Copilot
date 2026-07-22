import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * FASE BANK-SIMPLE-FLOW-COMPLETION-001 — bug real reproducido en vivo: un
 * movimiento ya conciliado financieramente (link real en
 * `bank_movement_reconciliation_links`, sin fila propia en
 * `bank_movement_client_identifications` porque el escritor de
 * identificación se niega a crear una redundante) aparecía "Asociado" con
 * el nombre del cliente en la lista (Movimientos/Conciliación, que sí
 * resuelve el cliente vía el link) pero "Asignar cliente" en el panel
 * (que solo miraba la tabla de identificaciones) — mismo movimiento, dos
 * estados distintos, exactamente el defecto que esta fase existe para
 * eliminar. El panel debe reflejar el mismo cliente resuelto en modo
 * solo lectura, sin ofrecer Cambiar/Revocar (no hay identificación que
 * tocar, y esta pantalla nunca debe tocar conciliación financiera real).
 */

const routeSource = readFileSync(
  join(
    process.cwd(),
    "app",
    "api",
    "copilot",
    "bank-reconciliation",
    "movements",
    "[id]",
    "association",
    "route.ts"
  ),
  "utf8"
);
const panelSource = readFileSync(
  join(process.cwd(), "components", "copilot", "bank-movements", "simple-movement-association-panel.tsx"),
  "utf8"
);

describe("Asociación single-movement: cliente resuelto también vía link financiero real", () => {
  it("el endpoint cae a bank_movement_reconciliation_links cuando no hay identificación activa", () => {
    expect(routeSource).toContain("getActiveIdentificationForMovement");
    expect(routeSource).toContain("bank_movement_reconciliation_links");
    expect(routeSource).toContain('target_type", "receipt"');
    expect(routeSource).toContain("proto_receipts");
    expect(routeSource).toContain('source = "financial_link"');
  });

  it("nunca revoca ni reasigna cuando el origen es un link financiero (esta pantalla nunca toca conciliación financiera real)", () => {
    const financialBlock = panelSource.match(
      /association\?\.source === "financial_link" \? \([\s\S]*?\) : !pickedClientId \?/
    );
    expect(financialBlock).not.toBeNull();
    expect(financialBlock![0]).not.toContain("Cambiar cliente");
    expect(financialBlock![0]).not.toContain("Revocar asociación");
    expect(financialBlock![0]).toContain("Ver ficha del cliente");
  });
});
