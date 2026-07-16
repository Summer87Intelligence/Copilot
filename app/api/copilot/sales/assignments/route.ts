import { NextRequest, NextResponse } from "next/server";

import { requireCopilotModuleWriteAccess } from "@/lib/auth/copilot-module-api-auth";

/**
 * LEGADO (FASE 9E) — Asignación comercial POR DOCUMENTO.
 *
 * La atribución comercial canónica es POR CLIENTE con vigencia temporal
 * (`sales_client_salespersons`, endpoint `/api/copilot/sales/client-assignments`).
 * `sales_document_salespersons` quedó como legado técnico y NO participa de
 * analytics (Resumen, Clientes, Detalle, Comparativo, Comerciales, Cliente 360,
 * Hoy ni Dashboard).
 *
 * Este endpoint permitía crear filas por documento que serían IGNORADAS por
 * analytics — una fuente de datos huérfanos. Se deshabilitan las NUEVAS
 * escrituras con 410 Gone. La tabla legada no se elimina y su lectura histórica
 * puede mantenerse por otras vías. Se mantiene el guard RBAC del módulo para no
 * exponer el estado del endpoint a llamadas no autorizadas.
 */

export const dynamic = "force-dynamic";

const DEPRECATION_MESSAGE =
  "La asignación comercial se administra por cliente. Usá /api/copilot/sales/client-assignments.";

export async function POST(request: NextRequest) {
  const auth = await requireCopilotModuleWriteAccess(request, "ventas");
  if (!auth.ok) return auth.response;

  return NextResponse.json(
    { ok: false as const, code: "GONE", message: DEPRECATION_MESSAGE },
    {
      status: 410,
      headers: {
        Deprecation: "true",
        Link: '</api/copilot/sales/client-assignments>; rel="successor-version"',
      },
    }
  );
}
