/**
 * One-shot patch: requireCopilotTenantContext → requireCopilotModuleAccess per API prefix.
 * Safe to re-run (skips files already patched).
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

function walkRouteFiles(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...walkRouteFiles(full));
    else if (ent.name === "route.ts") out.push(full);
  }
  return out;
}

const TARGETS = [
  { dir: "app/api/copilot/treasury", moduleKey: "tesoreria" },
  { dir: "app/api/copilot/reports", moduleKey: "reportes" },
  { dir: "app/api/copilot/data", moduleKey: "datos" },
  { dir: "app/api/copilot/dashboard", moduleKey: "hoy" },
  { dir: "app/api/copilot/collection-actions", moduleKey: "cartera" },
  { dir: "app/api/copilot/clients", moduleKey: "clientes" },
  { dir: "app/api/copilot/clientes", moduleKey: "clientes" },
  { dir: "app/api/copilot/actions", moduleKey: "acciones" },
];

const SINGLE_FILES = [
  ["app/api/copilot/financial-reconciliation/route.ts", "finanzas"],
  ["app/api/copilot/financial-snapshot/route.ts", "finanzas"],
  ["app/api/copilot/predictive-financial-dataset/route.ts", "finanzas"],
  ["app/api/copilot/cashflow-dataset/route.ts", "finanzas"],
  ["app/api/copilot/cash-status-amounts/route.ts", "tesoreria"],
  ["app/api/copilot/manual.pdf/route.ts", "manual"],
  ["app/api/copilot/portfolio/route.ts", "cartera"],
  ["app/api/copilot/client-360/route.ts", "clientes"],
  ["app/api/copilot/dataset/route.ts", "datos"],
  ["app/api/copilot/proto-documents/route.ts", "datos"],
];

function patchFile(filePath, moduleKey) {
  let src = fs.readFileSync(filePath, "utf8");
  if (src.includes("requireCopilotModuleAccess")) {
    return false;
  }
  if (
    !src.includes("requireCopilotTenantContext") &&
    !src.includes("requireCopilotWriteContext")
  ) {
    return false;
  }

  src = src.replace(
    /import \{([^}]+)\} from "@\/lib\/copilot-api-auth";/g,
    (match, inner) => {
      const hasTenant = inner.includes("requireCopilotTenantContext");
      const hasWrite = inner.includes("requireCopilotWriteContext");
      if (!hasTenant && !hasWrite) return match;
      const parts = [];
      parts.push("requireCopilotModuleAccess");
      if (hasWrite) parts.push("requireCopilotModuleWriteAccess");
      return `import { ${parts.join(", ")} } from "@/lib/auth/copilot-module-api-auth";`;
    }
  );

  src = src.replace(
    /requireCopilotWriteContext\(\s*request/g,
    `requireCopilotModuleWriteAccess(request, "${moduleKey}"`
  );
  src = src.replace(
    /requireCopilotTenantContext\(\s*request/g,
    `requireCopilotModuleAccess(request, "${moduleKey}"`
  );

  fs.writeFileSync(filePath, src, "utf8");
  return true;
}

let patched = 0;
for (const { dir, moduleKey } of TARGETS) {
  for (const full of walkRouteFiles(path.join(ROOT, dir))) {
    if (patchFile(full, moduleKey)) {
      patched++;
      console.log(`patched ${path.relative(ROOT, full)}`);
    }
  }
}
for (const [rel, moduleKey] of SINGLE_FILES) {
  const full = path.join(ROOT, rel);
  if (patchFile(full, moduleKey)) {
    patched++;
    console.log(`patched ${rel}`);
  }
}
console.log(`Done. Patched ${patched} route files.`);
