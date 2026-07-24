import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  classifyCopilotApiRoute,
  isCopilotFinancialApiPath,
} from "@/lib/auth/copilot-api-rbac-registry";

const API_ROOT = path.join(process.cwd(), "app/api/copilot");

function walkRouteFiles(dir: string, acc: string[] = []): string[] {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) walkRouteFiles(full, acc);
    else if (ent.name === "route.ts") acc.push(full);
  }
  return acc;
}

function fileToApiPath(routeFile: string): string {
  const rel = path.relative(API_ROOT, path.dirname(routeFile)).replace(/\\/g, "/");
  return rel ? `/api/copilot/${rel}` : "/api/copilot";
}

function hasModuleAuth(src: string): boolean {
  return (
    src.includes("requireCopilotModuleAccess") ||
    src.includes("requireCopilotModuleWriteAccess") ||
    src.includes("requireCopilotModuleAdminAccess") ||
    src.includes("requireCopilotApiModuleAccess") ||
    // Envuelve requireCopilotModuleAccess("bank_movements") + deniega
    // inflow_readonly para superficies de historial/reconciliación.
    src.includes("requireBankMovementsFullReadAccess")
  );
}

function hasTenantOnlyAuth(src: string): boolean {
  return (
    src.includes("requireCopilotTenantContext") ||
    src.includes("requireCopilotWriteContext")
  );
}

function hasAdminAuth(src: string): boolean {
  return (
    src.includes("requireAdminApiAuth") || src.includes("requireAdminContext")
  );
}

describe("copilot API RBAC coverage", () => {
  const routeFiles = walkRouteFiles(API_ROOT);

  it("escanea todas las rutas bajo app/api/copilot", () => {
    expect(routeFiles.length).toBeGreaterThan(100);
  });

  it("cada route.ts está en la matriz RBAC o allowlist documentada", () => {
    const unmapped: string[] = [];

    for (const file of routeFiles) {
      const apiPath = fileToApiPath(file);
      const classification = classifyCopilotApiRoute(apiPath);
      if (!classification) {
        unmapped.push(apiPath);
      }
    }

    expect(unmapped, `Rutas sin clasificación RBAC:\n${unmapped.join("\n")}`).toEqual([]);
  });

  it("handlers module-mapped usan requireCopilotModule* en el source", () => {
    const violations: string[] = [];

    for (const file of routeFiles) {
      const apiPath = fileToApiPath(file);
      const classification = classifyCopilotApiRoute(apiPath);
      if (classification?.kind !== "module") continue;

      const src = fs.readFileSync(file, "utf8");
      if (!hasModuleAuth(src)) {
        violations.push(`${apiPath} → falta requireCopilotModule*`);
      }
    }

    expect(violations, violations.join("\n")).toEqual([]);
  });

  it("rutas financieras no quedan solo con tenant auth", () => {
    const violations: string[] = [];

    for (const file of routeFiles) {
      const apiPath = fileToApiPath(file);
      if (!isCopilotFinancialApiPath(apiPath)) continue;

      const classification = classifyCopilotApiRoute(apiPath);
      const src = fs.readFileSync(file, "utf8");

      if (classification?.kind === "tenant_only") {
        // Dev tooling documentado — excepción intencional
        if (apiPath.startsWith("/api/copilot/dev-")) continue;
        violations.push(`${apiPath} → financiera en allowlist tenant-only`);
        continue;
      }

      if (classification?.kind === "module" && !hasModuleAuth(src)) {
        violations.push(`${apiPath} → financiera sin module guard en handler`);
        continue;
      }

      if (
        hasTenantOnlyAuth(src) &&
        !hasModuleAuth(src) &&
        classification?.kind !== "public" &&
        classification?.kind !== "admin"
      ) {
        violations.push(`${apiPath} → solo requireCopilotTenantContext`);
      }
    }

    expect(violations, violations.join("\n")).toEqual([]);
  });

  it("allowlist tenant-only (/me, dev-*) mantiene solo tenant auth", () => {
    const violations: string[] = [];

    for (const file of routeFiles) {
      const apiPath = fileToApiPath(file);
      const classification = classifyCopilotApiRoute(apiPath);
      if (classification?.kind !== "tenant_only") continue;

      const src = fs.readFileSync(file, "utf8");
      if (hasModuleAuth(src)) {
        violations.push(`${apiPath} → no debe usar module guard (excepción documentada)`);
      }
      if (!hasTenantOnlyAuth(src)) {
        violations.push(`${apiPath} → debe usar requireCopilotTenantContext`);
      }
    }

    expect(violations, violations.join("\n")).toEqual([]);
  });

  it("admin/* usa requireAdminContext o requireAdminApiAuth", () => {
    const violations: string[] = [];

    for (const file of routeFiles) {
      const apiPath = fileToApiPath(file);
      const classification = classifyCopilotApiRoute(apiPath);
      if (classification?.kind !== "admin") continue;

      const src = fs.readFileSync(file, "utf8");
      if (!hasAdminAuth(src)) {
        violations.push(`${apiPath} → falta requireAdminContext/requireAdminApiAuth`);
      }
    }

    expect(violations, violations.join("\n")).toEqual([]);
  });
});
