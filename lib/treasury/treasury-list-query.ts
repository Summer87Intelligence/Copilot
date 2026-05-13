import type { NextRequest } from "next/server";

import {
  BANK_MATCH_STATUSES,
  BANK_MOVEMENT_TYPES,
  MANUAL_CASH_LEDGER_TYPES,
  MANUAL_CASH_MOVEMENT_TYPES,
  PLANNED_OBLIGATION_DIRECTIONS,
  PLANNED_OBLIGATION_PRIORITIES,
  PLANNED_OBLIGATION_STATUSES,
  PLANNED_OBLIGATION_TYPES,
  TREASURY_CURRENCY_CODES,
} from "@/lib/treasury/treasury-types";
import { parseListLimit, parseYmdQuery } from "@/lib/treasury/treasury-db-helpers";

function pickEnum<T extends string>(
  raw: string | null,
  allowed: readonly T[]
): T | undefined {
  const v = raw?.trim();
  if (!v) return undefined;
  return (allowed as readonly string[]).includes(v) ? (v as T) : undefined;
}

export function parseTreasuryAccountListQuery(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  return {
    currencyCode: pickEnum(params.get("currency_code"), TREASURY_CURRENCY_CODES),
    status: params.get("status")?.trim() || undefined,
    limit: parseListLimit(params.get("limit")),
  };
}

export function parseManualCashListQuery(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  return {
    currencyCode: pickEnum(params.get("currency_code"), TREASURY_CURRENCY_CODES),
    accountId: params.get("account_id")?.trim() || undefined,
    fromDate: parseYmdQuery(params.get("from_date")),
    toDate: parseYmdQuery(params.get("to_date")),
    status: params.get("status")?.trim() || undefined,
    movementType: pickEnum(params.get("movement_type"), MANUAL_CASH_MOVEMENT_TYPES),
    ledgerType: pickEnum(params.get("ledger_type"), MANUAL_CASH_LEDGER_TYPES),
    category: params.get("category")?.trim() || undefined,
    limit: parseListLimit(params.get("limit")),
  };
}

export function parseBankMovementListQuery(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  return {
    currencyCode: pickEnum(params.get("currency_code"), TREASURY_CURRENCY_CODES),
    accountId: params.get("account_id")?.trim() || undefined,
    fromDate: parseYmdQuery(params.get("from_date")),
    toDate: parseYmdQuery(params.get("to_date")),
    movementType: pickEnum(params.get("movement_type"), BANK_MOVEMENT_TYPES),
    matchStatus: pickEnum(params.get("match_status"), BANK_MATCH_STATUSES),
    bankName: params.get("bank_name")?.trim() || undefined,
    limit: parseListLimit(params.get("limit")),
  };
}

export function parsePlannedObligationListQuery(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  return {
    currencyCode: pickEnum(params.get("currency_code"), TREASURY_CURRENCY_CODES),
    accountId: params.get("account_id")?.trim() || undefined,
    fromDate: parseYmdQuery(params.get("from_date")),
    toDate: parseYmdQuery(params.get("to_date")),
    status: pickEnum(params.get("status"), PLANNED_OBLIGATION_STATUSES),
    obligationType: pickEnum(params.get("obligation_type"), PLANNED_OBLIGATION_TYPES),
    priority: pickEnum(params.get("priority"), PLANNED_OBLIGATION_PRIORITIES),
    direction: pickEnum(params.get("direction"), PLANNED_OBLIGATION_DIRECTIONS),
    limit: parseListLimit(params.get("limit")),
  };
}

export function parseUpcomingObligationQuery(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const daysRaw = params.get("days")?.trim();
  const withinDays = daysRaw ? Number.parseInt(daysRaw, 10) : 30;
  return {
    withinDays: Number.isFinite(withinDays) && withinDays > 0 ? withinDays : 30,
    asOfDate: parseYmdQuery(params.get("as_of")) ?? undefined,
    limit: parseListLimit(params.get("limit")),
  };
}

export function parseOverdueObligationQuery(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  return {
    asOfDate: parseYmdQuery(params.get("as_of")) ?? undefined,
    limit: parseListLimit(params.get("limit")),
  };
}

export function parseTreasuryIntelligenceQuery(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const horizonRaw = params.get("horizon_days")?.trim() ?? params.get("days")?.trim();
  const parsed = horizonRaw ? Number.parseInt(horizonRaw, 10) : 30;
  const allowed = new Set([7, 15, 30, 60]);
  return {
    asOfDate: parseYmdQuery(params.get("as_of")) ?? undefined,
    horizonDays: allowed.has(parsed) ? (parsed as 7 | 15 | 30 | 60) : 30,
  };
}
