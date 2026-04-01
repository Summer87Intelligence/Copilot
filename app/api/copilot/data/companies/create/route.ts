import { NextRequest, NextResponse } from "next/server";

import { MSG_DB_USER } from "@/lib/copilot-data-integrity";
import { nextResponseFromProtoCrud } from "@/lib/copilot-proto-crud-http";
import { protoCreateCompany } from "@/lib/copilot-proto-crud-service";
import type { ProtoCompanyInput } from "@/lib/copilot-proto-crud-types";
import { supabase } from "@/lib/supabase-client";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as unknown;
    if (body == null || typeof body !== "object") {
      return NextResponse.json(
        {
          ok: false as const,
          code: "VALIDATION" as const,
          message: "El cuerpo de la solicitud no es válido. Volvé a intentar desde la pantalla de Datos.",
        },
        { status: 400 }
      );
    }
    const result = await protoCreateCompany(supabase, body as ProtoCompanyInput);
    return nextResponseFromProtoCrud(result);
  } catch {
    return NextResponse.json(
      { ok: false as const, code: "DATABASE" as const, message: MSG_DB_USER },
      { status: 500 }
    );
  }
}
