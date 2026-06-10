/** Fase 4B: mutation handlers → requireCopilotModuleWriteAccess. */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const DIRS = [
  "app/api/copilot/notifications",
  "app/api/copilot/decision-engine",
  "app/api/copilot/decisions",
  "app/api/copilot/initiatives",
  "app/api/copilot/outcomes",
  "app/api/copilot/operational-actions",
  "app/api/copilot/operational-workflows",
  "app/api/copilot/integrations/zeta",
  "app/api/copilot/automation-governance",
  "app/api/copilot/transfer-aliases",
];

function walk(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...walk(full));
    else if (ent.name === "route.ts") out.push(full);
  }
  return out;
}

function patchFile(file) {
  let src = fs.readFileSync(file, "utf8");
  if (!src.includes("requireCopilotModuleAccess")) return false;

  const parts = src.split(/(?=export async function (?:GET|POST|PUT|PATCH|DELETE)\b)/g);
  let changed = false;
  const next = parts.map((chunk) => {
    const m = chunk.match(/^export async function (POST|PUT|PATCH|DELETE)\b/);
    if (!m) return chunk;
    if (!chunk.includes("requireCopilotModuleAccess")) return chunk;
    if (chunk.includes("requireCopilotModuleWriteAccess")) return chunk;
    changed = true;
    return chunk.replace(/requireCopilotModuleAccess/g, "requireCopilotModuleWriteAccess");
  });
  if (!changed) return false;

  let out = next.join("");
  if (
    out.includes("requireCopilotModuleWriteAccess") &&
    !out.match(/import \{[^}]*requireCopilotModuleWriteAccess/)
  ) {
    out = out.replace(
      /import \{ requireCopilotModuleAccess \} from "@\/lib\/auth\/copilot-module-api-auth";/,
      'import { requireCopilotModuleAccess, requireCopilotModuleWriteAccess } from "@/lib/auth/copilot-module-api-auth";'
    );
  }

  fs.writeFileSync(file, out, "utf8");
  return true;
}

let n = 0;
for (const dir of DIRS) {
  for (const f of walk(path.join(ROOT, dir))) {
    if (patchFile(f)) {
      n++;
      console.log(path.relative(ROOT, f));
    }
  }
}
console.log(`Fixed ${n} mutation handlers.`);
