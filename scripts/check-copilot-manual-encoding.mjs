/**
 * Lint rápido anti-mojibake para lib/copilot-manual/sections.generated.ts
 * Run: node scripts/check-copilot-manual-encoding.mjs
 */
import { runManualEncodingCheck } from "./copilot-manual-encoding-guard.mjs";

process.exit(runManualEncodingCheck());
