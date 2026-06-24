"use client";

import type { CollectionAgenda, AgendaClientInfo } from "@/lib/collection/build-collection-agenda";
import { CollectionAgendaSection } from "@/components/copilot/acciones/collection-agenda-section";
import type { ClientPortfolioRow } from "@/lib/copilot-clients-portfolio";
import type { CollectionAction } from "@/lib/copilot-collection-types";
import { buildCollectionAgenda } from "@/lib/collection/build-collection-agenda";
import { useMemo } from "react";

export function CobranzaAgenda({
  portfolioRows,
  collectionActions,
  loading,
}: {
  portfolioRows: ClientPortfolioRow[];
  collectionActions: CollectionAction[];
  loading: boolean;
}) {
  const agenda: CollectionAgenda | null = useMemo(() => {
    if (loading) return null;
    const clients: AgendaClientInfo[] = portfolioRows.map((r) => ({
      companyId: r.company_id,
      name: r.name,
      debtUyu: r.debt_uyu ?? 0,
      debtUsd: r.debt_usd ?? 0,
      overdueUyu: r.overdue_uyu ?? 0,
      overdueUsd: r.overdue_usd ?? 0,
    }));
    return buildCollectionAgenda({ actions: collectionActions, clients });
  }, [portfolioRows, collectionActions, loading]);

  return (
    <div id="cobranza-agenda" className="rounded-2xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)] px-4 py-4 shadow-sm sm:px-5">
      <CollectionAgendaSection agenda={agenda} loading={loading} />
    </div>
  );
}
