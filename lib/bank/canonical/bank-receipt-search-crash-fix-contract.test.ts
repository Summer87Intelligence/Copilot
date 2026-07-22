import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * FASE BANK-RECEIPT-SEARCH-PAGE-CRASH-001 — contrato estático: "Buscar cliente
 * y recibo" (borrador manual sin sugerencia canónica) nunca debe navegar a una
 * ruta rota ni desmontar la página completa. Root cause real: el borrador
 * insertaba `reasons: [{ code, detail }]` (objetos) en vez de códigos string
 * planos; React no puede renderizar un objeto como children, y sin un error
 * boundary local esa excepción tiraba abajo toda la página.
 */

const COMPONENTS_ROOT = join(process.cwd(), "components", "copilot", "bank-movements");
const REPO_ROOT = process.cwd();

const incomeWorkspace = readFileSync(join(COMPONENTS_ROOT, "bank-income-workspace.tsx"), "utf8");
const manualDraftServer = readFileSync(
  join(REPO_ROOT, "lib", "bank", "canonical", "create-manual-draft-suggestion.server.ts"),
  "utf8"
);
const repositoriesIndex = readFileSync(
  join(REPO_ROOT, "lib", "bank", "intelligence", "server", "repositories", "index.ts"),
  "utf8"
);
const manualDraftRoute = readFileSync(
  join(REPO_ROOT, "app", "api", "copilot", "bank-reconciliation", "manual-draft", "route.ts"),
  "utf8"
);
const errorBoundary = readFileSync(
  join(REPO_ROOT, "components", "copilot", "ui", "inline-error-boundary.tsx"),
  "utf8"
);

describe("Buscar cliente y recibo: onClick nunca navega a una ruta", () => {
  it("onStartManualDraft llama un handler local (fetch + estado), no router.push/Link/href", () => {
    const handlerBlock = incomeWorkspace.match(/const handleManualDraft[\s\S]*?\n {2}\);/)![0];
    expect(handlerBlock).toContain('fetch("/api/copilot/bank-reconciliation/manual-draft"');
    expect(handlerBlock).not.toMatch(/router\.push|router\.replace|window\.location/);
  });

  it("el botón usa onClick={onStartManualDraft}, nunca un <Link>/href", () => {
    const buttonBlock = incomeWorkspace.match(/Buscar cliente y recibo[\s\S]{0,0}/) ? incomeWorkspace : incomeWorkspace;
    const idx = incomeWorkspace.indexOf('"Buscar cliente y recibo"');
    const around = incomeWorkspace.slice(Math.max(0, idx - 300), idx);
    expect(around).toContain("onClick={onStartManualDraft}");
    expect(buttonBlock).toBeDefined();
  });
});

describe("Nunca dejar la página completa en 'This page couldn't load'", () => {
  it("InlineErrorBoundary existe y atrapa errores de render (no re-lanza, no recarga la app)", () => {
    expect(errorBoundary).toContain("getDerivedStateFromError");
    expect(errorBoundary).toContain("componentDidCatch");
    expect(errorBoundary).not.toMatch(/window\.location\.reload/);
  });

  it("cada fila de Vincular recibos está envuelta en InlineErrorBoundary", () => {
    expect(incomeWorkspace).toContain("import { InlineErrorBoundary }");
    const listBlock = incomeWorkspace.match(/{pageRows\.map\(\(movement\) => {[\s\S]*?\n {12}\)\)}/)?.[0] ?? incomeWorkspace;
    expect(listBlock).toContain("<InlineErrorBoundary");
    expect(listBlock).toContain("<IncomeRow");
  });

  it("el drawer de evidencia está envuelto en InlineErrorBoundary y cierra el drawer si falla", () => {
    const drawerIdx = incomeWorkspace.indexOf("drawerMovementId && drawerEvidence");
    const around = incomeWorkspace.slice(drawerIdx, drawerIdx + 500);
    expect(around).toContain("InlineErrorBoundary");
    expect(around).toContain("onError={() => setDrawerMovementId(null)}");
    expect(around).toContain("<ReconciliationEvidenceDrawer");
  });
});

describe("Root cause: reasons deben ser códigos string, nunca objetos", () => {
  it("createOrReuseManualDraftSuggestion inserta reasons como array de strings planos", () => {
    expect(manualDraftServer).toContain('reasons: ["MANUAL_DRAFT"]');
    expect(manualDraftServer).not.toMatch(/reasons:\s*\[\{\s*code/);
  });

  it("mapSuggestionRow filtra defensivamente cualquier entrada no-string de reasons/warnings", () => {
    expect(repositoriesIndex).toMatch(/reasons:\s*Array\.isArray\(raw\.reasons\)[\s\S]*?filter\(\(r\): r is string => typeof r === "string"\)/);
    expect(repositoriesIndex).toMatch(/warnings:\s*Array\.isArray\(raw\.warnings\)[\s\S]*?filter\(\(w\): w is string => typeof w === "string"\)/);
  });
});

describe("Movimiento ya identificado sin suggestion canónica: contrato de estado vacío", () => {
  it("el manual-draft rechaza movimientos ya conciliados/ignorados/egresos con códigos controlados (nunca 500 crudo)", () => {
    expect(manualDraftRoute).toContain("MOVEMENT_NOT_FOUND");
    expect(manualDraftRoute).toContain("MOVEMENT_ALREADY_RECONCILED");
    expect(manualDraftRoute).toContain("MOVEMENT_NOT_RECONCILABLE");
    expect(manualDraftRoute).toContain("? 404");
    expect(manualDraftRoute).toContain("? 409");
  });

  it("el cliente muestra json.message/json.error en feedback controlado si la respuesta no es ok, sin romper la página", () => {
    const handlerBlock = incomeWorkspace.match(/const handleManualDraft[\s\S]*?\n {2}\);/)![0];
    expect(handlerBlock).toContain("if (!res.ok || !json.ok)");
    expect(handlerBlock).toContain("setFeedback(json.message ?? json.error ?? ");
    expect(handlerBlock).not.toMatch(/throw /);
  });
});

describe("Deep link inválido nunca abre un drawer sin evidencia", () => {
  it("el efecto de deep link solo setea drawerMovementId si ya existe evidencia cargada para ese movimiento", () => {
    expect(incomeWorkspace).toContain("if (rowsById[initialMovementId]?.evidence) setDrawerMovementId(initialMovementId)");
  });
});

describe("Identificar clientes / Vincular recibos: compatibilidad", () => {
  it("el borrador manual no depende de bank_movement_client_identifications (compatible con movimiento ya identificado o no)", () => {
    expect(manualDraftServer).not.toContain("bank_movement_client_identifications");
  });
});
