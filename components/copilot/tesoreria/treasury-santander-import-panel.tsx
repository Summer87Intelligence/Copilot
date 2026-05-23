"use client";

import { useMemo, useState } from "react";
import { Loader2, Upload } from "lucide-react";

import { CopilotGhostButton, CopilotPrimaryButton, CopilotSectionTitle } from "@/components/copilot/copilot-ui";
import { TreasuryFormField, treasuryInputClassName } from "@/components/copilot/tesoreria/treasury-form-fields";
import {
  TESORERIA_TABLE_CLASS,
  TESORERIA_TD_CLASS,
  TESORERIA_TH_CLASS,
} from "@/components/copilot/tesoreria/tesoreria-ui";
import type { TreasuryWorkspace } from "@/hooks/use-treasury-workspace";
import type { BankImportPreviewRow } from "@/lib/treasury/treasury-client";
import { formatTreasuryMoney } from "@/lib/treasury/treasury-dashboard";
import { parseSantanderStatementFile } from "@/lib/treasury/santander-statement-parser";

type Props = {
  workspace: TreasuryWorkspace;
};

function movementTypeLabel(type: string): string {
  const t = type.toLowerCase();
  if (t === "debit") return "Débito";
  if (t === "credit") return "Crédito";
  return type;
}

export function TreasurySantanderImportPanel({ workspace }: Props) {
  const [accountId, setAccountId] = useState("");
  const [parsing, setParsing] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [previewRows, setPreviewRows] = useState<BankImportPreviewRow[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsedRows, setParsedRows] = useState<
    Awaited<ReturnType<typeof parseSantanderStatementFile>>
  >([]);

  const santanderAccounts = useMemo(
    () =>
      workspace.accounts.filter(
        (account) =>
          account.active &&
          (account.bankName?.toLowerCase().includes("santander") || account.type === "bank")
      ),
    [workspace.accounts]
  );

  async function handleFileChange(file: File | null) {
    if (!file) return;
    setParsing(true);
    setFileName(file.name);
    try {
      const rows = await parseSantanderStatementFile(file);
      setParsedRows(rows);
      setPreviewRows([]);
    } finally {
      setParsing(false);
    }
  }

  function buildPayload(apply: boolean) {
    return {
      account_id: accountId,
      apply,
      auto_match: true,
      rows: parsedRows.map((row) => ({
        movement_date: row.movementDate,
        description: row.description,
        amount: row.amount,
        currency_code: row.currencyCode,
        movement_type: row.movementType,
        external_id: row.externalId,
        document_number: row.documentNumber,
        balance_after: row.balanceAfter,
        raw_payload: row.rawPayload,
      })),
    };
  }

  async function handlePreview() {
    if (!accountId || parsedRows.length === 0) return;
    setPreviewing(true);
    const result = await workspace.previewSantanderMovements(buildPayload(false));
    if (result) setPreviewRows(result.preview);
    setPreviewing(false);
  }

  async function handleImport() {
    if (!accountId || parsedRows.length === 0) return;
    setImporting(true);
    await workspace.importSantanderMovements(buildPayload(true));
    setImporting(false);
  }

  return (
    <section className="space-y-3 rounded-2xl border border-[var(--copilot-border)] bg-[var(--copilot-card)] p-4 shadow-[var(--copilot-shadow)]">
      <CopilotSectionTitle
        title="Importador bancario"
        subtitle="Subí un extracto CSV o XLSX para revisar movimientos y posibles coincidencias."
      />
      <p className="text-xs text-[var(--copilot-ink-muted)]">
        Compatible actualmente con extractos Santander.
      </p>

      <TreasuryFormField label="Cuenta destino" htmlFor="import-account">
        <select
          id="import-account"
          className={treasuryInputClassName()}
          value={accountId}
          onChange={(e) => setAccountId(e.target.value)}
        >
          <option value="">Seleccionar cuenta</option>
          {santanderAccounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name} ({account.currencyCode})
            </option>
          ))}
        </select>
      </TreasuryFormField>

      <label className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--copilot-border)] bg-white/50 px-6 py-10 text-center">
        <Upload className="mb-3 h-8 w-8 text-[var(--copilot-ink-muted)]" />
        <span className="text-sm font-medium text-[var(--copilot-ink)]">
          Subí un extracto CSV o XLSX
        </span>
        <span className="mt-1 text-xs text-[var(--copilot-ink-muted)]">
          {fileName ?? "Sin archivo seleccionado"}
        </span>
        <input
          type="file"
          accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="sr-only"
          onChange={(e) => void handleFileChange(e.target.files?.[0] ?? null)}
        />
      </label>

      {parsing ? (
        <p className="flex items-center gap-2 text-sm text-[var(--copilot-ink-muted)]">
          <Loader2 className="h-4 w-4 animate-spin" />
          Parseando archivo…
        </p>
      ) : null}

      {parsedRows.length > 0 ? (
        <p className="text-sm text-[var(--copilot-ink-muted)]">
          {parsedRows.length} movimientos detectados en el archivo.
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <CopilotGhostButton
          type="button"
          disabled={!accountId || parsedRows.length === 0 || previewing}
          onClick={() => void handlePreview()}
        >
          {previewing ? <Loader2 className="h-4 w-4 animate-spin" /> : "Generar preview"}
        </CopilotGhostButton>
        <CopilotPrimaryButton
          type="button"
          disabled={!accountId || parsedRows.length === 0 || importing}
          onClick={() => void handleImport()}
        >
          {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : "Importar movimientos"}
        </CopilotPrimaryButton>
      </div>

      {previewRows.length > 0 ? (
        <div className="overflow-x-auto rounded-2xl border border-[var(--copilot-border)] bg-white/50">
          <table className={TESORERIA_TABLE_CLASS}>
            <thead>
              <tr>
                <th className={TESORERIA_TH_CLASS}>Fecha</th>
                <th className={TESORERIA_TH_CLASS}>Descripción</th>
                <th className={TESORERIA_TH_CLASS}>Monto</th>
                <th className={TESORERIA_TH_CLASS}>Tipo</th>
                <th className={TESORERIA_TH_CLASS}>Duplicado</th>
                <th className={TESORERIA_TH_CLASS}>Match sugerido</th>
              </tr>
            </thead>
            <tbody>
              {previewRows.map((row) => (
                <tr
                  key={row.externalId}
                  className={row.duplicate ? "bg-amber-50/70" : undefined}
                >
                  <td className={TESORERIA_TD_CLASS}>{row.movementDate}</td>
                  <td className={TESORERIA_TD_CLASS}>{row.description}</td>
                  <td className={TESORERIA_TD_CLASS}>
                    {formatTreasuryMoney(row.amount, row.currencyCode as "UYU" | "USD")}
                  </td>
                  <td className={TESORERIA_TD_CLASS}>{movementTypeLabel(row.movementType)}</td>
                  <td className={TESORERIA_TD_CLASS}>{row.duplicate ? "Sí" : "No"}</td>
                  <td className={TESORERIA_TD_CLASS}>
                    {row.suggestion
                      ? `${row.suggestion.confidence}% · Δ ${row.suggestion.amountDelta.toFixed(2)}`
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
