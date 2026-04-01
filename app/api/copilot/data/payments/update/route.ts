import { NextRequest, NextResponse } from "next/server";

import { MSG_DB_USER } from "@/lib/copilot-data-integrity";
import { nextResponseFromProtoCrud } from "@/lib/copilot-proto-crud-http";
import { protoUpdatePayment } from "@/lib/copilot-proto-crud-service";
import type { ProtoPaymentPatch } from "@/lib/copilot-proto-crud-types";
import { supabase } from "@/lib/supabase-client";

export async function PATCH(request: NextRequest) {
  try {
    const body = (await request.json()) as unknown;
    if (body == null || typeof body !== "object") {
      return NextResponse.json(
        {
          ok: false as const,
          code: "VALIDATION" as const,
          message: "El cuerpo de la solicitud no es válido.",
        },
        { status: 400 }
      );
    }
    const raw = body as { id?: string } & ProtoPaymentPatch;
    const { id: rowId, ...patch } = raw;
    const id = String(rowId ?? "").trim();
    if (!id) {
      return NextResponse.json(
        {
          ok: false as const,
          code: "VALIDATION" as const,
          message: "Falta el identificador del pago a editar.",
        },
        { status: 400 }
      );
    }
    const result = await protoUpdatePayment(supabase, id, patch);
    return nextResponseFromProtoCrud(result);
  } catch {
    return NextResponse.json(
      { ok: false as const, code: "DATABASE" as const, message: MSG_DB_USER },
      { status: 500 }
    );
  }
}
