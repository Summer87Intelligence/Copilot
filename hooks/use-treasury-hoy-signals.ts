"use client";

import { useCallback, useEffect, useState } from "react";

import type { TreasuryAlert } from "@/lib/treasury/treasury-alert-engine";
import type { TreasuryCashProjectionResult } from "@/lib/treasury/treasury-cash-projection";
import {
  fetchTreasuryAlerts,
  fetchTreasuryProjection,
  fetchTreasuryUpcomingObligations,
  treasuryErrorMessage,
} from "@/lib/treasury/treasury-client";
import type { PlannedCashObligation } from "@/lib/treasury/treasury-types";

const HORIZON_DAYS = 30;
const UPCOMING_DAYS = 7;

export type TreasuryHoySignals = {
  projection: TreasuryCashProjectionResult | null;
  upcoming7: PlannedCashObligation[];
  alerts: TreasuryAlert[];
  upcomingOutflowUyu: number;
  criticalAlertCount: number;
  warningAlertCount: number;
};

export type TreasuryHoyLoadState = {
  loading: boolean;
  error: string | null;
  signals: TreasuryHoySignals | null;
  hasOperationalData: boolean;
};

function obligationOutflowAmount(obligation: PlannedCashObligation): number {
  return obligation.amountFinal ?? obligation.amountEstimated;
}

function sumUpcomingOutflowUyu(obligations: readonly PlannedCashObligation[]): number {
  let total = 0;
  for (const obligation of obligations) {
    if (obligation.currencyCode !== "UYU") continue;
    total += obligationOutflowAmount(obligation);
  }
  return total;
}

function sumNearTermProjectionOutflows(projection: TreasuryCashProjectionResult): number {
  let total = 0;
  for (const snapshot of projection.snapshots.slice(0, UPCOMING_DAYS)) {
    total += snapshot.outflowsUyu;
  }
  return total;
}

function hasTreasuryOperationalData(signals: TreasuryHoySignals): boolean {
  if (signals.upcoming7.length > 0) return true;
  if (signals.criticalAlertCount > 0 || signals.warningAlertCount > 0) return true;
  if (signals.projection?.runwayDays != null) return true;
  if (signals.projection?.riskLevel !== "healthy") return true;
  if (signals.upcomingOutflowUyu > 0) return true;
  if (sumNearTermProjectionOutflows(signals.projection ?? { snapshots: [], runwayDays: null, riskLevel: "healthy" }) > 0) {
    return true;
  }
  return false;
}

export function useTreasuryHoySignals(): TreasuryHoyLoadState {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [signals, setSignals] = useState<TreasuryHoySignals | null>(null);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const [projectionRes, upcomingRes, alertsRes] = await Promise.all([
        fetchTreasuryProjection(HORIZON_DAYS),
        fetchTreasuryUpcomingObligations(UPCOMING_DAYS),
        fetchTreasuryAlerts(HORIZON_DAYS),
      ]);

      if (!projectionRes.ok) {
        setSignals(null);
        setError(treasuryErrorMessage(projectionRes));
        return;
      }
      if (!upcomingRes.ok) {
        setSignals(null);
        setError(treasuryErrorMessage(upcomingRes));
        return;
      }
      if (!alertsRes.ok) {
        setSignals(null);
        setError(treasuryErrorMessage(alertsRes));
        return;
      }

      const projection = projectionRes.data;
      const upcoming7 = upcomingRes.data.items;
      const alerts = alertsRes.data;
      const upcomingOutflowUyu = sumUpcomingOutflowUyu(upcoming7);
      const criticalAlertCount = alerts.filter((a) => a.severity === "critical").length;
      const warningAlertCount = alerts.filter((a) => a.severity === "warning").length;

      const next: TreasuryHoySignals = {
        projection,
        upcoming7,
        alerts,
        upcomingOutflowUyu,
        criticalAlertCount,
        warningAlertCount,
      };
      setSignals(next);
    } catch {
      setSignals(null);
      setError("No se pudo leer la presión de caja manual.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const hasOperationalData = signals != null && hasTreasuryOperationalData(signals);

  return { loading, error, signals, hasOperationalData };
}
