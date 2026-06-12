"use client";

import type { ReactNode } from "react";

import { TESORERIA_FIELD_CLASS } from "@/components/copilot/tesoreria/tesoreria-ui";

type Props = {
  label: string;
  htmlFor: string;
  error?: string;
  children: ReactNode;
};

export function TreasuryFormField({ label, htmlFor, error, children }: Props) {
  return (
    <label className="block text-sm" htmlFor={htmlFor}>
      <span className="mb-1 block text-sm font-medium text-[var(--copilot-ink)]">{label}</span>
      {children}
      {error ? (
        <span className="mt-1 block text-xs text-[var(--copilot-danger-text)]" role="alert">
          {error}
        </span>
      ) : null}
    </label>
  );
}

export function treasuryInputClassName(error?: string) {
  return `${TESORERIA_FIELD_CLASS}${error ? " border-[var(--copilot-danger-border)] ring-rose-100" : ""}`;
}
