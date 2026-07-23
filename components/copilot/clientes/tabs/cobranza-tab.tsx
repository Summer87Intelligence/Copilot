"use client";

import { CollectionMessageAssistant } from "@/components/copilot/clientes/collection-message-assistant";
import { CollectionFollowupForm } from "@/components/copilot/clientes/collection-followup-form";
import type { Client360Payload } from "@/lib/copilot-client-360";
import type { CollectionFollowupInitialValues } from "@/lib/account-statement/build-account-statement-followup-prefill";

export function CobranzaTab({
  data,
  collectionPrefill,
  collectionPrefillKey,
}: {
  data: Client360Payload;
  collectionPrefill: CollectionFollowupInitialValues | null;
  collectionPrefillKey: number;
}) {
  if (data.summary.is_active === false) {
    return (
      <div className="px-5 py-4">
        <div className="rounded-xl border border-[var(--copilot-warning-border)] bg-[var(--copilot-card-bg)] px-4 py-3 text-sm text-[var(--copilot-warning-text-strong)]">
          Cliente inactivo: acciones operativas deshabilitadas.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 px-5 py-4">
      <CollectionMessageAssistant
        companyId={data.summary.company_id}
        clientName={data.summary.nombre_visible}
        debtUyu={data.debt_uyu}
        debtUsd={data.debt_usd}
        overdueUyu={data.overdue_uyu}
        overdueUsd={data.overdue_usd}
        contactEmail={data.contacts.find((c) => c.email != null)?.email ?? null}
        phone={data.summary.phone}
      />
      <CollectionFollowupForm
        companyId={data.summary.company_id}
        initialValues={collectionPrefill}
        prefillKey={collectionPrefillKey}
      />
      <p className="text-xs text-[var(--copilot-muted)]">
        La identificación bancaria (alias, conceptos e historial de movimientos asociados) está en la
        pestaña Identificación bancaria.
      </p>
    </div>
  );
}
