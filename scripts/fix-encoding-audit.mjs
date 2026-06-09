import fs from "node:fs";
import path from "node:path";

const MOJIBAKE = [
  ["Ã¡", "á"],
  ["Ã©", "é"],
  ["Ã­", "í"],
  ["Ã³", "ó"],
  ["Ãº", "ú"],
  ["Ã±", "ñ"],
  ["Ã¼", "ü"],
  ["Ã‰", "É"],
  ["Â¿", "¿"],
  ["Â¡", "¡"],
  ["Â«", "«"],
  ["Â»", "»"],
  ["Â·", "·"],
  ["â€”", "—"],
  ["â€“", "–"],
  ["â€™", "'"],
  ["â€œ", "\u201C"],
  ["â€\u009D", "\u201D"],
  ["â†'", "→"],
  ["â‰ ", "≠"],
  ["â‰¥", "≥"],
  ["âˆ'", "−"],
  ["\u00CE\u201D", "Δ"],
  [" ??? ", " — "],
];

function fixMojibake(text) {
  let out = text;
  for (const [bad, good] of MOJIBAKE) {
    out = out.split(bad).join(good);
  }
  return out;
}

function isValidUtf8(buf) {
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(buf);
    return true;
  } catch {
    return false;
  }
}

function scanFile(filePath) {
  const buf = fs.readFileSync(filePath);
  const text = isValidUtf8(buf) ? buf.toString("utf8") : buf.toString("latin1");
  const before = text;
  const fixed = fixMojibake(text);
  const hits = MOJIBAKE.filter(([bad]) => before.includes(bad)).map(([bad]) => bad);
  return { before, fixed, hits, changed: before !== fixed };
}

const targets = [];
function walk(dir) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === "node_modules" || ent.name === ".next") continue;
      walk(p);
    } else if (/\.(tsx?|jsx?)$/.test(ent.name)) {
      targets.push(p);
    }
  }
}

for (const root of ["components", "app", "lib"]) walk(root);

const changed = [];
for (const file of targets) {
  const { before, fixed, hits, changed: didChange } = scanFile(file);
  if (hits.length === 0) continue;
  if (didChange) {
    fs.writeFileSync(file, fixed, "utf8");
    changed.push({ file: file.replace(/\\/g, "/"), hits });
  }
}

console.log(JSON.stringify(changed, null, 2));
console.log(`\nFixed ${changed.length} files`);

const remaining = [];
for (const file of targets) {
  const text = fs.readFileSync(file, "utf8");
  if (/Ã|â€|Â·|Â¿|Â«|Â»|â€™/.test(text)) {
    remaining.push(file.replace(/\\/g, "/"));
  }
}
if (remaining.length) {
  console.log("\nRemaining files with mojibake:");
  console.log(remaining.join("\n"));
} else {
  console.log("\nNo mojibake patterns remaining in TS/TSX.");
}
