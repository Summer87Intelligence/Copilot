#!/usr/bin/env node
/**
 * One-off: replace hardcoded light surfaces with semantic Copilot tokens.
 * Safe patterns only — does not touch text-white on accent buttons.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const TARGET_DIRS = [
  "components/copilot",
  "app/copilot",
];

const REPLACEMENTS = [
  [/bg-\[rgba\(255,255,255,0\.95\)\]/g, "bg-[var(--copilot-tab-bg)]"],
  [/bg-\[rgba\(255,255,255,0\.92\)\]/g, "bg-[var(--copilot-table-header-bg)]"],
  [/bg-\[rgba\(255,255,255,0\.65\)\]/g, "bg-[var(--copilot-table-header-bg)]"],
  [/bg-\[rgba\(255,255,255,0\.5\)\]/g, "bg-[var(--copilot-soft-bg)]"],
  [/bg-\[rgba\(255,255,255,0\.55\)\]/g, "bg-[var(--copilot-soft-bg)]"],
  [/hover:bg-slate-50/g, "hover:bg-[var(--copilot-soft-bg)]"],
  [/hover:bg-white\/80/g, "hover:bg-[var(--copilot-panel-bg)]"],
  [/hover:bg-white\/70/g, "hover:bg-[var(--copilot-panel-bg)]"],
  [/hover:bg-white/g, "hover:bg-[var(--copilot-panel-bg)]"],
  [/bg-white\/95/g, "bg-[var(--copilot-card-bg)]/95"],
  [/bg-white\/90/g, "bg-[var(--copilot-card-bg)]/90"],
  [/bg-white\/85/g, "bg-[var(--copilot-card-bg)]/85"],
  [/bg-white\/80/g, "bg-[var(--copilot-card-bg)]/80"],
  [/bg-white\/75/g, "bg-[var(--copilot-card-bg)]/75"],
  [/bg-white\/70/g, "bg-[var(--copilot-card-bg)]/70"],
  [/bg-white\/65/g, "bg-[var(--copilot-card-bg)]/65"],
  [/bg-white\/60/g, "bg-[var(--copilot-card-bg)]/60"],
  [/bg-white\/55/g, "bg-[var(--copilot-card-bg)]/55"],
  [/bg-white\/50/g, "bg-[var(--copilot-card-bg)]/50"],
  [/bg-white\/40/g, "bg-[var(--copilot-card-bg)]/40"],
  [/bg-white\/30/g, "bg-[var(--copilot-card-bg)]/30"],
  [/bg-white\/25/g, "bg-[var(--copilot-card-bg)]/25"],
  [/bg-white\/20/g, "bg-[var(--copilot-card-bg)]/20"],
  [/from-white/g, "from-[var(--copilot-card-bg)]"],
  [/to-slate-50\/40/g, "to-[var(--copilot-tone-neutral-bg)]"],
  [/to-slate-50\/60/g, "to-[var(--copilot-tone-neutral-bg)]"],
  [/disabled:opacity-50/g, "disabled:opacity-100 disabled:bg-[var(--copilot-disabled-bg)] disabled:text-[var(--copilot-disabled-text)]"],
  [/disabled:opacity-60/g, "disabled:opacity-100 disabled:bg-[var(--copilot-disabled-bg)] disabled:text-[var(--copilot-disabled-text)]"],
  [/disabled:opacity-40/g, "disabled:opacity-100 disabled:bg-[var(--copilot-disabled-bg)] disabled:text-[var(--copilot-disabled-text)]"],
  [/bg-white(?![\w-/])/g, "bg-[var(--copilot-card-bg)]"],
];

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === "node_modules" || ent.name === ".next") continue;
      walk(p, out);
    } else if (/\.(tsx|ts|jsx|js)$/.test(ent.name)) {
      out.push(p);
    }
  }
  return out;
}

let filesChanged = 0;
for (const rel of TARGET_DIRS) {
  const dir = path.join(ROOT, rel);
  if (!fs.existsSync(dir)) continue;
  for (const file of walk(dir)) {
    if (file.includes("fix-dark-mode-surfaces")) continue;
    let src = fs.readFileSync(file, "utf8");
    const before = src;
    for (const [re, rep] of REPLACEMENTS) {
      src = src.replace(re, rep);
    }
    if (src !== before) {
      fs.writeFileSync(file, src, "utf8");
      filesChanged++;
    }
  }
}
console.log(`Updated ${filesChanged} files`);
