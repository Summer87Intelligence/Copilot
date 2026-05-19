import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json(
    {
      ok: false,
      code: "DEPRECATED",
      message: "Use /api/cron/zeta-sync-saldos",
    },
    { status: 410 }
  );
}
