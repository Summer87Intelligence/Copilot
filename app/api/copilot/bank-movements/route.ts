import { NextRequest, NextResponse } from "next/server";

import { parseAndValidateJsonBody } from "@/lib/api/parse-and-validate-json-body";
import {
  getCopilotModuleAccessLevel,
  requireCopilotModuleAccess,
  requireCopilotModuleWriteAccess,
} from "@/lib/auth/copilot-module-api-auth";
import { bankMovementsScopeFromAccessLevel, mustForceBankInflowOnly } from "@/lib/auth/bank-movements-scope";
import {
  bankMovementCreateBodySchema,
  buildBankMovementInsert,
} from "@/lib/bank-movements/bank-movements-api";
import {
  isValidBankMovementDirection,
  isValidBankMovementStatus,
  type BankMovement,
} from "@/lib/bank-movements/bank-movements-types";
import { isBankMovementUiHidden } from "@/lib/bank-movements/bank-movement-visibility";
import { batchDeriveMovementReconciliationLevels } from "@/lib/bank/canonical/movement-reconciliation-level";
import { auditDuplicateBankMovements } from "@/lib/bank/canonical/duplicate-import-audit.server";

export const dynamic = "force-dynamic";

const TABLE_MISSING_CODE = "42P01";

export async function GET(request: NextRequest) {
  const auth = await requireCopilotModuleAccess(request, "bank_movements");
  if (!auth.ok) return auth.response;

  const { supabase, tenantCompanyId } = auth.ctx;
  const params = request.nextUrl.searchParams;

  // FASE BANK-RECONCILIATION-END-TO-END-STABILIZATION-001 — `inflow_readonly`
  // ve SOLO ingresos, sin excepción. El filtro se fuerza server-side; el
  // parámetro `direction` del cliente se ignora por completo en ese caso
  // (nunca confiar en el request para decidir qué egresos exponer).
  const accessLevel = await getCopilotModuleAccessLevel(auth.ctx, "bank_movements");
  const scope = bankMovementsScopeFromAccessLevel(accessLevel);
  const forceInflowOnly = mustForceBankInflowOnly(scope);

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
  if (forceInflowOnly) {
    query = query.eq("direction", "inflow");
  } else {
    const direction = params.get("direction");
    if (direction && direction !== "all" && isValidBankMovementDirection(direction)) {
      query = query.eq("direction", direction);
    }
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

  let rows = (data ?? []) as BankMovement[];

  // `inflow_readonly` es una vista acotada y de solo lectura: los movimientos
  // ocultados manualmente por Banco no aportan valor a ese lector y podrían
  // confundir (aparecen "sueltos" sin las acciones de gestión). Se excluyen
  // acá porque `metadata.ui_hidden` no es un filtro trivial de Postgrest.
  if (forceInflowOnly) {
    rows = rows.filter((r) => !isBankMovementUiHidden((r as { metadata?: Record<string, unknown> | null }).metadata));
  }

  // FASE BANK-FULL-RECONCILIATION-UI-CORRECTION-001 — nivel real por movimiento
  // (solo ingresos: el triado cliente→recibo→factura no aplica a egresos, que
  // usan el flujo de Tesorería). Batch en 3-4 queries, nunca 1 por fila.
  const inflowRows = rows.filter((r) => r.direction === "inflow" && r.status !== "ignored");
  let levels: Record<string, string> = {};
  // FASE BANK-SIMPLE-FLOW-COMPLETION-001 — la columna "Cliente" de la lista
  // simple (Movimientos/Conciliación) necesita el nombre, no solo el id;
  // resuelto en un batch adicional (nunca 1 query por fila).
  let clients: Record<string, { clientCompanyId: string; clientName: string | null }> = {};
  if (inflowRows.length > 0) {
    try {
      const levelMap = await batchDeriveMovementReconciliationLevels(
        supabase,
        tenantCompanyId,
        inflowRows.map((r) => ({ id: r.id, currency: r.currency, amount: Number(r.amount) }))
      );
      levels = Object.fromEntries([...levelMap.entries()].map(([id, d]) => [id, d.level]));
      const clientIds = Array.from(
        new Set([...levelMap.values()].map((d) => d.clientCompanyId).filter((id): id is string => Boolean(id)))
      );
      if (clientIds.length > 0) {
        const { data: clientRows } = await supabase
          .from("proto_companies")
          .select("id, name")
          .in("id", clientIds);
        const nameById = new Map((clientRows ?? []).map((c) => [(c as { id: string }).id, (c as { name: string }).name]));
        for (const [movementId, detail] of levelMap.entries()) {
          if (detail.clientCompanyId) {
            clients[movementId] = {
              clientCompanyId: detail.clientCompanyId,
              clientName: nameById.get(detail.clientCompanyId) ?? null,
            };
          }
        }
      }
    } catch {
      levels = {};
      clients = {};
    }
  }

  // FASE BANK-GLOBAL-MOVEMENT-RECEIPT-INVOICE-INTEGRITY-AUDIT-AND-CORRECTION-001
  // + BANK-IDEMPOTENT-IMPORT: duplicados de importación (metadata o columnas).
  const duplicates: Record<string, { canonicalMovementId: string }> = {};
  for (const row of rows) {
    const meta = (row.metadata ?? {}) as Record<string, unknown>;
    const excluded =
      row.excluded_from_operations === true || meta.duplicate_status === "duplicate_of_import";
    const duplicateOf =
      (typeof row.duplicate_of === "string" && row.duplicate_of) ||
      (typeof meta.duplicate_of === "string" ? meta.duplicate_of : null);
    if (excluded && duplicateOf) {
      duplicates[row.id] = { canonicalMovementId: duplicateOf };
    }
  }
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
          if (!duplicates[duplicateId]) {
            duplicates[duplicateId] = { canonicalMovementId: group.canonicalMovementId };
          }
        }
      }
    } catch (err) {
      console.error("bank-movements duplicate audit failed", err);
    }
  }

  return NextResponse.json({
    ok: true as const,
    data: rows,
    meta: { total: rows.length, migration_pending: false },
    levels,
    duplicates,
    clients,
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
