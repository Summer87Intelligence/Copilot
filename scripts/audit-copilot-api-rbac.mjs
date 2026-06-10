import fs from "node:fs";
import path from "node:path";

function walk(dir, acc = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(full, acc);
    else if (ent.name === "route.ts") acc.push(full);
  }
  return acc;
}

const routes = walk(path.join(process.cwd(), "app/api/copilot"));
const onlyTenant = [];
const moduleRead = [];
const moduleWrite = [];
const admin = [];
const publicR = [];
const other = [];

for (const f of routes) {
  const rel = f.replace(/\\/g, "/");
  const apiPath = "/" + path.dirname(rel).replace(/\\/g, "/");
  const src = fs.readFileSync(f, "utf8");

  if (/\/login(\/|$)/.test(apiPath) || /\/logout(\/|$)/.test(apiPath)) {
    publicR.push(apiPath);
    continue;
  }
  if (apiPath.includes("/admin/")) {
    admin.push(apiPath);
    continue;
  }

  const hasAdmin = src.includes("requireAdminApiAuth");
  const hasWrite =
    src.includes("requireCopilotModuleWriteAccess") ||
    src.includes("requireCopilotWriteContext");
  const hasRead =
    src.includes("requireCopilotModuleAccess") ||
    src.includes("requireCopilotApiModuleAccess");
  const hasTenant =
    src.includes("requireCopilotTenantContext") ||
    src.includes("requireCopilotWriteContext");

  if (hasAdmin) {
    admin.push(apiPath);
    continue;
  }
  if (hasWrite) moduleWrite.push(apiPath);
  else if (hasRead) moduleRead.push(apiPath);
  else if (hasTenant) onlyTenant.push(apiPath);
  else other.push(apiPath);
}

onlyTenant.sort();
console.log(JSON.stringify({ onlyTenant, other, counts: {
  onlyTenant: onlyTenant.length,
  moduleRead: moduleRead.length,
  moduleWrite: moduleWrite.length,
  admin: [...new Set(admin)].length,
  public: [...new Set(publicR)].length,
  other: other.length,
}}, null, 2));
