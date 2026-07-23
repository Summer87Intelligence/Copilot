"use client";

import Link from "next/link";

import { buildClientBankingHref } from "@/lib/bank-movements/client-banking-navigation";

type Props = {
  clientCompanyId: string;
  clientName: string;
  returnTo?: string | null;
  className?: string;
};

/**
 * Nombre de cliente clickeable → Cliente 360 · Identificación bancaria.
 * Misma pestaña, foco visible, aria-label.
 */
export function BankClientNameLink({
  clientCompanyId,
  clientName,
  returnTo,
  className,
}: Props) {
  const href = buildClientBankingHref({ clientCompanyId, returnTo });
  return (
    <Link
      href={href}
      className={
        className ??
        "font-medium text-[var(--copilot-accent)] underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--copilot-accent)]"
      }
      aria-label={`Abrir identificacion bancaria de ${clientName}`}
    >
      {clientName}
    </Link>
  );
}
