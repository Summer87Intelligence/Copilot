import path from "node:path";
import { fileURLToPath } from "node:url";

import type { NextConfig } from "next";

/** Raíz explícita del app — evita inferencia errónea con lockfiles externos (Vercel modifyConfig). */
const projectRoot = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  /** Alineado con turbopack.root — requerido en monorepos / Vercel adapter. */
  outputFileTracingRoot: projectRoot,
  serverExternalPackages: ["pdf-parse", "pdfjs-dist"],
  outputFileTracingIncludes: {
    "/api/copilot/clientes/[companyId]/account-statement.pdf": [
      "./node_modules/pdfkit/js/**/*",
    ],
    "/api/copilot/treasury/bank-reconciliation-movements/parse": [
      "./node_modules/pdf-parse/**/*",
      "./node_modules/pdfjs-dist/**/*",
    ],
  },
  turbopack: {
    root: projectRoot,
  },
};

export default nextConfig;
