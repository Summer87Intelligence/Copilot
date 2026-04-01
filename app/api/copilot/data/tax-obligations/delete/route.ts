import { NextRequest, NextResponse } from "next/server";

import { MSG_DB_USER } from "@/lib/copilot-data-integrity";
import { nextResponseFromProtoCrud } from "@/lib/copilot-proto-crud-http";
import { protoDeleteTaxObligation } from "@/lib/copilot-proto-crud-service";
import { supabase } from "@/lib/supabase-client";

export async function DELETE(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get("id")?.trim() ?? "";
    if (!id) {
      return NextResponse.json(
        {
          ok: false as const,
          code: "VALIDATION" as const,
          message: "Falta el identificador de la obligación fiscal a eliminar.",
        },
        { status: 400 }
      );
    }
    const result = await protoDeleteTaxObligation(supabase, id);
    return nextResponseFromProtoCrud(result);
  } catch {
    return NextResponse.json(
      { ok: false as const, code: "DATABASE" as const, message: MSG_DB_USER },
      { status: 500 }
    );
  }
}
