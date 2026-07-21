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
        destination: "/copilot",
        permanent: true,
      },
      {
        source: "/copilot/rutas/:path*",
        destination: "/copilot",
        permanent: true,
      },
      {
        source: "/copilot/personalizacion",
        destination: "/copilot",
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
  // "@napi-rs/canvas" NO es necesario para el camino de extracción de texto (ver
  // lib/treasury/pdf-node-dom-polyfills.server.ts: polyfill puro sin binario nativo,
  // BANK-PDF-IMPORT-SERVERLESS-CANVAS-FIX-001) — se declara igual como external +
  // tracing-include solo para intentar silenciar el warning de pdfjs-dist en los
  // logs de Vercel cuando el binario nativo de la plataforma no resuelve; si esto no
  // alcanza a incluirlo, el import de PDF sigue funcionando igual (el polyfill no
  // depende de que esto tenga éxito).
  serverExternalPackages: ["pdf-parse", "pdfjs-dist", "xlsx", "@napi-rs/canvas"],
  outputFileTracingIncludes: {
    "/api/copilot/clientes/[companyId]/account-statement.pdf": [
      "./node_modules/pdfkit/js/**/*",
    ],
    "/api/copilot/treasury/bank-reconciliation-movements/parse": [
      "./node_modules/pdf-parse/**/*",
      "./node_modules/pdfjs-dist/**/*",
    ],
    "/api/copilot/bank-movements/imports/preview": [
      "./node_modules/xlsx/**/*",
      "./node_modules/pdf-parse/**/*",
      "./node_modules/pdfjs-dist/**/*",
      "./node_modules/@napi-rs/canvas/**/*",
      "./node_modules/@napi-rs/canvas-linux-x64-gnu/**/*",
    ],
    "/api/knowledge/zeta/docs": ["./docs/zeta/markdown/**/*"],
    "/api/knowledge/zeta/doc": ["./docs/zeta/markdown/**/*"],
    "/api/knowledge/zeta/search": ["./docs/zeta/markdown/**/*"],
    "/api/knowledge/zeta/ask": ["./docs/zeta/markdown/**/*"],
  },
  turbopack: {
    root: projectRoot,
  },
};

export default nextConfig;
