import path from "node:path";
import { fileURLToPath } from "node:url";

import type { NextConfig } from "next";

/** Raíz explícita del app — evita inferencia errónea con lockfiles externos (Vercel modifyConfig). */
const projectRoot = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  /** Alineado con turbopack.root — requerido en monorepos / Vercel adapter. */
  outputFileTracingRoot: projectRoot,
  outputFileTracingIncludes: {
    "/api/copilot/clientes/[companyId]/account-statement.pdf": [
      "./node_modules/pdfkit/js/**/*",
    ],
  },
  turbopack: {
    root: projectRoot,
  },
};

export default nextConfig;
