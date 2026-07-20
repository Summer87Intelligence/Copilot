import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * FASE SALES-REMOVE-EXECUTIVES-TAB-001 — contrato estático sobre el código
 * fuente (el proyecto no usa @testing-library/react, así que esto reemplaza
 * un test de render real, siguiendo el mismo patrón ya usado en
 * `seller-assignment-ux-contract.test.ts`).
 *
 * Objetivo: la pestaña "Ejecutivos" desaparece de Ventas; "Vendedores" queda
 * como única vista personal. El DOMINIO de ejecutivo (tabla, asignación,
 * Clientes/Cliente 360, Configuración) NO se toca.
 */

const ROOT = join(process.cwd(), "components", "copilot");
const pageClient = readFileSync(join(ROOT, "ventas", "ventas-page-client.tsx"), "utf8");
const vendedoresTab = readFileSync(join(ROOT, "ventas", "ventas-vendedores-tab.tsx"), "utf8");
const clientesTab = readFileSync(join(ROOT, "ventas", "ventas-clientes-tab.tsx"), "utf8");
const configuracionClient = readFileSync(join(ROOT, "ventas", "ventas-configuracion-client.tsx"), "utf8");
const cliente360VentasTab = readFileSync(join(ROOT, "clientes", "tabs", "ventas-tab.tsx"), "utf8");

describe("Ventas: la pestaña Ejecutivos ya no existe en la navegación", () => {
  it("el componente de la pestaña Ejecutivos fue eliminado (sin consumidores)", () => {
    expect(existsSync(join(ROOT, "ventas", "ventas-ejecutivos-tab.tsx"))).toBe(false);
  });

  it("ventas-page-client no importa ni monta VentasEjecutivosTab", () => {
    expect(pageClient).not.toContain("VentasEjecutivosTab");
    expect(pageClient).not.toContain("ventas-ejecutivos-tab");
  });

  it("el tipo TabKey ya no admite 'ejecutivos' (garantía de compilación: no puede seleccionarse)", () => {
    expect(pageClient).not.toMatch(/TabKey\s*=\s*"[^"]*"\s*\|\s*"[^"]*"\s*\|\s*"[^"]*"\s*\|\s*"[^"]*"\s*\|\s*"[^"]*"\s*\|\s*"ejecutivos"/);
    expect(pageClient).not.toMatch(/key:\s*"ejecutivos"/);
  });

  it("el orden de tabs visibles es exactamente: Resumen, Servicios, Detalle, Clientes, Comparativo, Vendedores", () => {
    const tabsBlockMatch = pageClient.match(/const TABS[\s\S]*?\];/);
    expect(tabsBlockMatch).not.toBeNull();
    const tabsBlock = tabsBlockMatch![0];
    const labels = [...tabsBlock.matchAll(/label:\s*"([^"]+)"/g)].map((m) => m[1]);
    expect(labels).toEqual(["Resumen", "Servicios", "Detalle", "Clientes", "Comparativo", "Vendedores"]);
  });

  it("no queda ningún render condicional para tab === 'ejecutivos'", () => {
    expect(pageClient).not.toMatch(/tab === "ejecutivos"/);
  });
});

describe("Ventas: no hay persistencia de tab en URL/localStorage/sessionStorage a migrar", () => {
  it("el tab activo es estado de React puro (useState), nunca leído de query param/localStorage/hash", () => {
    // Si en el futuro se persiste el tab en la URL, debe agregarse fallback
    // explícito "ejecutivos" -> "vendedores". Hoy no existe tal persistencia:
    // toda carga de página arranca en "resumen" (estado válido), y TypeScript
    // ya impide seleccionar "ejecutivos" (no está en TabKey ni en TABS).
    expect(pageClient).toContain('useState<TabKey>("resumen")');
    expect(pageClient).not.toContain("localStorage");
    expect(pageClient).not.toContain("sessionStorage");
    expect(pageClient).not.toMatch(/searchParams[?.]*\.get\(["']tab["']\)/);
  });
});

describe("Ventas → Vendedores: única vista personal, con Participación", () => {
  it("existe y expone las columnas requeridas", () => {
    expect(vendedoresTab).toContain('header: "Vendedor"');
    expect(vendedoresTab).toContain('header: "Operaciones"');
    expect(vendedoresTab).toContain('header: "Clientes"');
    expect(vendedoresTab).toContain('header: "Ventas netas UYU"');
    expect(vendedoresTab).toContain('header: "Ventas netas USD"');
    expect(vendedoresTab).toContain('header: "Ticket promedio UYU"');
    expect(vendedoresTab).toContain('header: "Ticket promedio USD"');
    expect(vendedoresTab).toContain('header: "Servicio principal"');
    expect(vendedoresTab).toContain('header: "Participación"');
  });

  it("mantiene 'Sin vendedor identificado' y no menciona la pestaña Ejecutivos", () => {
    expect(vendedoresTab).toContain("Sin vendedor identificado");
    expect(vendedoresTab).not.toMatch(/pestaña\s+Ejecutivos/i);
  });

  it("incluye el texto aclaratorio de negocio requerido", () => {
    expect(vendedoresTab).toContain(
      "El vendedor es quien realizó cada comprobante. La asignación es manual por comprobante y es independiente"
    );
  });
});

describe("Clientes / Cliente 360: el Ejecutivo sigue visible y editable (dominio intacto)", () => {
  it("Ventas → Clientes conserva la columna/asignación de Ejecutivo", () => {
    expect(clientesTab).toContain('header: "Ejecutivo"');
    expect(clientesTab).toContain("Sin ejecutivo");
  });

  it("Cliente 360 → Ventas conserva el bloque 'Ejecutivo del cliente'", () => {
    expect(cliente360VentasTab).toContain("Ejecutivo del cliente");
  });
});

describe("Configuración de ventas: conserva el catálogo compartido ejecutivo/vendedor", () => {
  it("sigue explicando ambos roles del mismo equipo de personas", () => {
    expect(configuracionClient).toContain("ejecutivo de un cliente");
    expect(configuracionClient).toContain("vendedor de una operación puntual");
  });
});

describe("Dominio de Ejecutivo: NO se elimina, solo se retira la superficie de Ventas", () => {
  const repo = readFileSync(join(process.cwd(), "lib", "sales", "sales-client-salesperson-repository.ts"), "utf8");
  const dataSource = readFileSync(join(process.cwd(), "lib", "sales", "sales-data-source.ts"), "utf8");

  it("resolveClientSalespersonOnDate sigue existiendo", () => {
    expect(repo).toContain("export function resolveClientSalespersonOnDate");
  });

  it("sales-data-source sigue resolviendo executiveId/executiveName vía resolveClientSalespersonOnDate", () => {
    expect(dataSource).toContain("resolveClientSalespersonOnDate");
  });
});
