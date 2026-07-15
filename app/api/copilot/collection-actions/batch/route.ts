/**
 * POST /api/copilot/collection-actions/batch
 *
 * Batch read-only endpoint for collection action timelines by company.
 * Replaces N parallel `GET /collection-actions?company_id=...` calls with
 * one authenticated request and one Supabase `.in("company_id", ids)` query.
 */

import { performance } from "node:perf_hooks";

import { NextRequest, NextResponse } from "next/server";

import { requireCopilotModuleAccessAny } from "@/lib/auth/copilot-module-api-auth";
import { parseJsonBody } from "@/lib/api/parse-json-body";
import { collectionGetByCompanies } from "@/lib/copilot-collection-service";

const MAX_COMPANIES_PER_BATCH = 100;

function readCompanyIds(value: unknown): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const raw = (value as Record<string, unknown>).company_ids;
  if (!Array.isArray(raw)) return [];
  return Array.from(
    new Set(
      raw
        .filter((v): v is string => typeof v === "string")
        .map((v) => v.trim())
        .filter(Boolean)
    )
  ).slice(0, MAX_COMPANIES_PER_BATCH);
}

export async function POST(request: NextRequest) {
  const started = performance.now();
  const parsed = await parseJsonBody(request);
  if (!parsed.ok) return parsed.response;

  const auth = await requireCopilotModuleAccessAny(
    request,
    ["cobranza", "cartera", "clientes", "acciones"],
    parsed.value
  );
  if (!auth.ok) return auth.response;

  const companyIds = readCompanyIds(parsed.value);
  if (companyIds.length === 0) {
    return NextResponse.json(
      {
        ok: false,
        code: "INVALID_PAYLOAD",
        message: "company_ids debe ser un array no vacío de strings.",
      },
      { status: 400 }
    );
  }

  const { supabase, tenantCompanyId } = auth.ctx;
  const byCompany = await collectionGetByCompanies(
    supabase,
    companyIds,
    tenantCompanyId
  );

  const actionsByCompany: Record<string, unknown[]> = {};
  let actionCount = 0;
  for (const id of companyIds) {
    const actions = byCompany.get(id) ?? [];
    actionsByCompany[id] = actions;
    actionCount += actions.length;
  }

  console.info(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      source: "collection_actions",
      kind: "collection_actions_batch",
      workspace_id: tenantCompanyId,
      company_count: companyIds.length,
      action_count: actionCount,
      duration_ms: Math.round((performance.now() - started) * 100) / 100,
    })
  );

  return NextResponse.json({
    ok: true,
    actionsByCompany,
    companyCount: companyIds.length,
    actionCount,
  });
}
