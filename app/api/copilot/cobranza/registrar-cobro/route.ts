import { type NextRequest, NextResponse } from "next/server";

import { requireCopilotModuleWriteAccess } from "@/lib/auth/copilot-module-api-auth";

export async function POST(req: NextRequest) {
  const auth = await requireCopilotModuleWriteAccess(req, "cobranza");
  if (!auth.ok) return auth.response;

  return NextResponse.json(
    {
      ok: false,
      code: "COBRANZA_MANUAL_REGISTRATION_DISABLED",
      message:
        "Los cobros se registran exclusivamente en Zeta y se sincronizan automáticamente.",
    },
    { status: 410 }
  );
}
