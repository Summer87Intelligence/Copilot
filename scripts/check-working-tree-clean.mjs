import { spawnSync } from "node:child_process";

const IGNORED_PREFIXES = [".next/", "test-results/", "playwright-report/"];

function isIgnoredPath(path) {
  const normalized = path.replace(/\\/g, "/");
  return IGNORED_PREFIXES.some(
    (prefix) => normalized === prefix.slice(0, -1) || normalized.startsWith(prefix)
  );
}

function parsePorcelainLine(line) {
  if (!line.trim()) return null;
  const status = line.slice(0, 2);
  let path = line.slice(3).trim();
  if (path.includes(" -> ")) {
    path = path.split(" -> ").pop() ?? path;
  }
  return { status, path };
}

function isBlockingStatus(status) {
  if (status === "??") return true;
  if (status.includes("M")) return true;
  if (status.includes("D")) return true;
  if (status.includes("A")) return true;
  if (status.includes("R")) return true;
  if (status.includes("C")) return true;
  if (status.includes("U")) return true;
  return false;
}

const result = spawnSync("git", ["status", "--porcelain"], {
  encoding: "utf8",
  shell: process.platform === "win32",
});

if (result.status !== 0) {
  console.error("check-working-tree-clean: no se pudo ejecutar git status.");
  process.exit(result.status ?? 1);
}

const blocking = [];
for (const line of result.stdout.split(/\r?\n/)) {
  const entry = parsePorcelainLine(line);
  if (!entry) continue;
  if (!isBlockingStatus(entry.status)) continue;
  if (isIgnoredPath(entry.path)) continue;
  blocking.push(`${entry.status} ${entry.path}`);
}

if (blocking.length > 0) {
  console.error("check-working-tree-clean: working tree con cambios relevantes sin commitear:");
  for (const line of blocking) {
    console.error(`  ${line}`);
  }
  console.error("Ignorados solo artefactos locales: .next/, test-results/, playwright-report/");
  process.exit(1);
}

console.log("check-working-tree-clean: OK (sin cambios relevantes pendientes).");
