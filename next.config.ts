import path from "node:path";
import { fileURLToPath } from "node:url";

import type { NextConfig } from "next";

/** Raíz explícita del app — evita inferencia errónea con lockfiles externos (Vercel modifyConfig). */
const projectRoot = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: "/copilot/insights",
        destination: "/copilot/dashboard",
        permanent: true,
      },
      {
        source: "/copilot/gestion-ia",
        destination: "/copilot/agentes",
        permanent: true,
      },
      {
        source: "/copilot/rutas",
        destination: "/copilot/hoy",
        permanent: true,
      },
      {
        source: "/copilot/rutas/:path*",
        destination: "/copilot/hoy",
        permanent: true,
      },
      {
        source: "/copilot/personalizacion",
        destination: "/copilot/hoy",
        permanent: true,
      },
      {
        source: "/copilot/operacional",
        destination: "/copilot/alertas",
        permanent: true,
      },
      {
        source: "/copilot/operacional/:path*",
        destination: "/copilot/alertas",
        permanent: true,
      },
    ];
  },
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
