import { NextRequest, NextResponse } from "next/server";

import { parseAndValidateJsonBody } from "@/lib/api/parse-and-validate-json-body";
import {
  requireCopilotModuleAccess,
  requireCopilotModuleWriteAccess,
} from "@/lib/auth/copilot-module-api-auth";
import {
  bankMovementCreateBodySchema,
  buildBankMovementInsert,
} from "@/lib/bank-movements/bank-movements-api";
import {
  isValidBankMovementDirection,
  isValidBankMovementStatus,
  type BankMovement,
} from "@/lib/bank-movements/bank-movements-types";
import { batchDeriveMovementReconciliationLevels } from "@/lib/bank/canonical/movement-reconciliation-level";
import { auditDuplicateBankMovements } from "@/lib/bank/canonical/duplicate-import-audit.server";

export const dynamic = "force-dynamic";

const TABLE_MISSING_CODE = "42P01";

export async function GET(request: NextRequest) {
  const auth = await requireCopilotModuleAccess(request, "bank_movements");
  if (!auth.ok) return auth.response;

  const { supabase, tenantCompanyId } = auth.ctx;
  const params = request.nextUrl.searchParams;

  let query = supabase
    .from("bank_movements")
    .select("*")
    .eq("workspace_id", tenantCompanyId)
    .order("movement_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(2000);

  const status = params.get("status");
  if (status && status !== "all" && isValidBankMovementStatus(status)) {
    query = query.eq("status", status);
  }
  const direction = params.get("direction");
  if (direction && direction !== "all" && isValidBankMovementDirection(direction)) {
    query = query.eq("direction", direction);
  }
  const currency = params.get("currency");
  if (currency && currency !== "all") query = query.eq("currency", currency);
  const importId = params.get("import_id");
  if (importId) query = query.eq("import_id", importId);

  const { data, error } = await query;

  if (error) {
    if (error.code === TABLE_MISSING_CODE) {
      return NextResponse.json({
        ok: true as const,
        data: [] as BankMovement[],
        meta: { total: 0, migration_pending: true },
      });
    }
    return NextResponse.json(
      { ok: false as const, message: "No se pudieron cargar los movimientos bancarios." },
      { status: 500 }
    );
  }

  const rows = (data ?? []) as BankMovement[];

  // FASE BANK-FULL-RECONCILIATION-UI-CORRECTION-001 — nivel real por movimiento
  // (solo ingresos: el triado cliente→recibo→factura no aplica a egresos, que
  // usan el flujo de Tesorería). Batch en 3-4 queries, nunca 1 por fila.
  const inflowRows = rows.filter((r) => r.direction === "inflow" && r.status !== "ignored");
  let levels: Record<string, string> = {};
  if (inflowRows.length > 0) {
    try {
      const levelMap = await batchDeriveMovementReconciliationLevels(
        supabase,
        tenantCompanyId,
        inflowRows.map((r) => ({ id: r.id, currency: r.currency, amount: Number(r.amount) }))
      );
      levels = Object.fromEntries([...levelMap.entries()].map(([id, d]) => [id, d.level]));
    } catch {
      levels = {};
    }
  }

  // FASE BANK-GLOBAL-MOVEMENT-RECEIPT-INVOICE-INTEGRITY-AUDIT-AND-CORRECTION-001
  // Duplicados de importación (misma operación real, distinto parser/archivo)
  // — solo lectura, nunca marca nada en DB. Ver duplicate-import-audit.server.ts.
  let duplicates: Record<string, { canonicalMovementId: string }> = {};
  if (rows.length > 0) {
    try {
      const dates = rows.map((r) => r.movement_date).sort();
      const groups = await auditDuplicateBankMovements(
        supabase,
        tenantCompanyId,
        dates[0]!,
        dates[dates.length - 1]!
      );
      for (const group of groups) {
        for (const duplicateId of group.duplicateMovementIds) {
          duplicates[duplicateId] = { canonicalMovementId: group.canonicalMovementId };
        }
      }
    } catch (err) {
      // Nunca romper la carga de Movimientos por esto, pero nunca tragarse el
      // error en silencio tampoco: sin este log, un fallo de auditDuplicate
      // BankMovements (p. ej. una consulta .in() con demasiados ids) queda
      // invisible en Vercel y el mapa de duplicados se ve vacío sin rastro.
      console.error("bank-movements duplicate audit failed", err);
      duplicates = {};
    }
  }

  return NextResponse.json({
    ok: true as const,
    data: rows,
    meta: { total: rows.length, migration_pending: false },
    levels,
    duplicates,
  });
}

export async function POST(request: NextRequest) {
  const parsed = await parseAndValidateJsonBody(request, bankMovementCreateBodySchema);
  if (!parsed.ok) return parsed.response;

  const auth = await requireCopilotModuleWriteAccess(
    request,
    "bank_movements",
    parsed.data as Record<string, unknown>
  );
  if (!auth.ok) return auth.response;

  const { supabase, tenantCompanyId } = auth.ctx;
  const insert = buildBankMovementInsert(parsed.data, tenantCompanyId);

  const { data, error } = await supabase
    .from("bank_movements")
    .insert(insert)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json(
      { ok: false as const, error: "No se pudo crear el movimiento bancario." },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true as const, data: data as BankMovement }, { status: 201 });
}
