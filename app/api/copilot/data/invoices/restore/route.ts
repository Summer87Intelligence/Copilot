import { NextRequest, NextResponse } from "next/server";

import { MSG_DB_USER } from "@/lib/copilot-data-integrity";
import { nextResponseFromProtoCrud } from "@/lib/copilot-proto-crud-http";
import { protoRestoreInvoice } from "@/lib/copilot-proto-crud-service";
import { supabase } from "@/lib/supabase-client";

export async function POST(request: NextRequest) {
  try {
    let body: { id?: string };
    try {
      body = (await request.json()) as { id?: string };
    } catch {
      return NextResponse.json(
        {
          ok: false as const,
          code: "VALIDATION" as const,
          message: "Cuerpo JSON inválido.",
        },
        { status: 400 }
      );
    }
    const id = body.id?.trim() ?? "";
    if (!id) {
      return NextResponse.json(
        {
          ok: false as const,
          code: "VALIDATION" as const,
          message: "Falta el identificador de la factura.",
        },
        { status: 400 }
      );
    }
    const result = await protoRestoreInvoice(supabase, id);
    return nextResponseFromProtoCrud(result);
  } catch {
    return NextResponse.json(
      { ok: false as const, code: "DATABASE" as const, message: MSG_DB_USER },
      { status: 500 }
    );
  }
}
