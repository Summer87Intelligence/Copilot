/**
 * Fase 4B: patch rutas legacy → requireCopilotModuleAccess.
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
  { dir: "app/api/copilot/notifications", moduleKey: "hoy" },
  { dir: "app/api/copilot/decision-engine", moduleKey: "acciones" },
  { dir: "app/api/copilot/decisions", moduleKey: "acciones" },
  { dir: "app/api/copilot/initiatives", moduleKey: "acciones" },
  { dir: "app/api/copilot/outcomes", moduleKey: "acciones" },
  { dir: "app/api/copilot/operational-actions", moduleKey: "acciones" },
  { dir: "app/api/copilot/operational-events", moduleKey: "hoy" },
  { dir: "app/api/copilot/operational-feed", moduleKey: "hoy" },
  { dir: "app/api/copilot/operational-health", moduleKey: "hoy" },
  { dir: "app/api/copilot/operational-intelligence", moduleKey: "hoy" },
  { dir: "app/api/copilot/operational-memory", moduleKey: "hoy" },
  { dir: "app/api/copilot/operational-workflows", moduleKey: "hoy" },
  { dir: "app/api/copilot/integrations/zeta", moduleKey: "datos" },
];

const SINGLE_FILES = [
  ["app/api/copilot/automation-governance/route.ts", "acciones"],
  ["app/api/copilot/enterprise-sync-health/route.ts", "hoy"],
  ["app/api/copilot/executive-briefing/route.ts", "finanzas"],
  ["app/api/copilot/insight-engine-dataset/route.ts", "finanzas"],
  ["app/api/copilot/intelligence-bundle/route.ts", "agentes"],
  ["app/api/copilot/llm-briefing/route.ts", "agentes"],
  ["app/api/copilot/pipeline-health/route.ts", "hoy"],
  ["app/api/copilot/real-insights/route.ts", "finanzas"],
  ["app/api/copilot/rutas-hub/route.ts", "finanzas"],
  ["app/api/copilot/rutas-snapshot/route.ts", "finanzas"],
  ["app/api/copilot/strategic-recommendations/route.ts", "agentes"],
  ["app/api/copilot/transfer-aliases/route.ts", "clientes"],
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
      const parts = ["requireCopilotModuleAccess"];
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
  if (fs.existsSync(full) && patchFile(full, moduleKey)) {
    patched++;
    console.log(`patched ${rel}`);
  }
}
console.log(`Done. Patched ${patched} route files.`);
