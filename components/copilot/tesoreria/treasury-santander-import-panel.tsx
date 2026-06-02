"use client";

import { useMemo, useState } from "react";
import { ChevronDown, Loader2, Upload, X } from "lucide-react";
import { useCopilotPermissions } from "@/lib/auth/copilot-permissions-context";

import { CopilotGhostButton, CopilotPrimaryButton, CopilotSectionTitle } from "@/components/copilot/copilot-ui";
import { PermissionButton } from "@/components/copilot/permission-button";
import { TreasuryFormField, treasuryInputClassName } from "@/components/copilot/tesoreria/treasury-form-fields";
import {
  TESORERIA_TABLE_CLASS,
  TESORERIA_TD_CLASS,
  TESORERIA_TH_CLASS,
} from "@/components/copilot/tesoreria/tesoreria-ui";
import type { TreasuryWorkspace } from "@/hooks/use-treasury-workspace";
import type { BankImportPreviewRow, BankImportResult, SantanderImportSummary } from "@/lib/treasury/treasury-client";
import { treasuryParseBankStatement } from "@/lib/treasury/treasury-client";
import { getBankImportFileType } from "@/lib/treasury/santander-bank-import-file-type";
import {
  buildSantanderImportSummary,
  SANTANDER_STATUS_LABELS,
  type SantanderReconciliationStatus,
} from "@/lib/treasury/santander-import-reconciliation";
import { formatTreasuryMoney } from "@/lib/treasury/treasury-dashboard";
import {
  parseSantanderStatementFile,
  SantanderStatementParseError,
} from "@/lib/treasury/santander-statement-parser";

type Props = {
  workspace: TreasuryWorkspace;
  embedded?: boolean;
};

function movementTypeLabel(type: string): string {
  const t = type.toLowerCase();
  if (t === "debit") return "Débito";
  if (t === "credit") return "Crédito";
  return type;
}

function statusBadgeClass(status: SantanderReconciliationStatus): string {
  switch (status) {
    case "matched":
      return "bg-emerald-100 text-emerald-900";
    case "possible":
      return "bg-sky-100 text-sky-900";
    case "missing_copilot":
    case "missing_zeta":
      return "bg-amber-100 text-amber-900";
    case "amount_diff":
      return "bg-rose-100 text-rose-900";
    case "duplicate":
    case "ignored":
    case "unknown":
    default:
      return "bg-slate-100 text-slate-700";
  }
}

function applyLocalIgnores(
  rows: BankImportPreviewRow[],
  ignored: ReadonlySet<string>
): BankImportPreviewRow[] {
  if (ignored.size === 0) return rows;
  return rows.map((row) =>
    ignored.has(row.externalId)
      ? {
          ...row,
          status: "ignored" as const,
          statusLabel: SANTANDER_STATUS_LABELS.ignored,
          suggestedAction: "Ignorar",
          decisionHint: "Marcado para ignorar en esta revisión.",
          confidence: null,
        }
      : row
  );
}

function formatCurrencyTotals(totals: Partial<Record<"UYU" | "USD", number>>): string {
  const parts: string[] = [];
  for (const code of ["UYU", "USD"] as const) {
    const v = totals[code];
    if (v != null && v > 0) parts.push(formatTreasuryMoney(v, code));
  }
  return parts.length > 0 ? parts.join(" · ") : "—";
}

export function TreasurySantanderImportPanel({ workspace, embedded = false }: Props) {
  const { canWrite } = useCopilotPermissions();
  const [accountId, setAccountId] = useState("");
  const [formatOpen, setFormatOpen] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [previewResult, setPreviewResult] = useState<BankImportResult | null>(null);
  const [ignoredIds, setIgnoredIds] = useState<Set<string>>(() => new Set());
  const [detailRow, setDetailRow] = useState<BankImportPreviewRow | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
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

  const displayRows = useMemo(() => {
    if (!previewResult?.preview.length) return [];
    return applyLocalIgnores(previewResult.preview, ignoredIds);
  }, [previewResult, ignoredIds]);

  const summary: SantanderImportSummary | null = useMemo(() => {
    if (displayRows.length === 0) return previewResult?.summary ?? null;
    return buildSantanderImportSummary(displayRows);
  }, [displayRows, previewResult?.summary]);

  const hasValidPreview = previewResult != null && displayRows.length > 0;

  const currencyMismatch = useMemo(() => {
    if (!accountId || parsedRows.length === 0) return null;
    const account = santanderAccounts.find((a) => a.id === accountId);
    if (!account?.currencyCode) return null;
    const statementCurrency = parsedRows[0]?.currencyCode;
    if (!statementCurrency || statementCurrency === account.currencyCode) return null;
    return { accountCurrency: account.currencyCode, statementCurrency };
  }, [accountId, parsedRows, santanderAccounts]);

  async function handleFileChange(file: File | null) {
    if (!file) return;
    setParsing(true);
    setSelectedFile(file);
    setFileError(null);
    setParsedRows([]);
    setPreviewResult(null);
    setIgnoredIds(new Set());
    try {
      const fileType = getBankImportFileType(file);
      if (fileType === "pdf") {
        const result = await treasuryParseBankStatement(file);
        if (!result.ok) {
          setFileError(result.message);
          return;
        }
        setParsedRows(result.data.movements);
        return;
      }
      const rows = await parseSantanderStatementFile(file);
      setParsedRows(rows);
    } catch (error) {
      setParsedRows([]);
      if (error instanceof SantanderStatementParseError) {
        setFileError(error.message);
      } else {
        setFileError("No pudimos leer el archivo. Revisá el formato e intentá de nuevo.");
      }
    } finally {
      setParsing(false);
    }
  }

  function buildPayload(apply: boolean): Record<string, unknown> {
    const payload: Record<string, unknown> = {
      apply,
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
    if (accountId) payload.account_id = accountId;
    return payload;
  }

  async function handlePreview() {
    if (parsedRows.length === 0) return;
    setPreviewing(true);
    const result = await workspace.previewSantanderMovements(buildPayload(false));
    if (result) setPreviewResult(result);
    setPreviewing(false);
  }

  async function handleImport() {
    if (!hasValidPreview || !accountId) return;
    setImporting(true);
    const result = await workspace.importSantanderMovements(buildPayload(true));
    if (result) {
      setPreviewResult(result);
    }
    setImporting(false);
  }

  function toggleIgnore(externalId: string) {
    setIgnoredIds((prev) => {
      const next = new Set(prev);
      if (next.has(externalId)) next.delete(externalId);
      else next.add(externalId);
      return next;
    });
    setDetailRow((row) => (row?.externalId === externalId ? null : row));
  }

  const reviewCount =
    summary != null
      ? summary.missingCopilot +
        summary.missingZeta +
        summary.possible +
        summary.unknown +
        summary.amountDiff
      : 0;

  return (
    <section
      className={
        embedded
          ? "space-y-4"
          : "space-y-4 rounded-2xl border border-[var(--copilot-border)] bg-[var(--copilot-card)] p-4 shadow-[var(--copilot-shadow)]"
      }
    >
      {embedded ? null : (
        <CopilotSectionTitle
          title="Importador bancario"
          subtitle="Subí movimientos de Santander para compararlos con Copilot."
        />
      )}

      <p className="text-sm text-[var(--copilot-ink-muted)]">
        Sirve para detectar cobros o gastos que están en el banco pero todavía no están
        registrados en Tesorería o Zeta.{" "}
        <strong className="font-medium text-[var(--copilot-ink)]">
          No modifica caja automáticamente.
        </strong>
      </p>

      <TreasuryFormField label="Cuenta destino (opcional en preview)" htmlFor="import-account">
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
        {santanderAccounts.length === 0 ? (
          <p className="mt-1 text-xs text-amber-800">
            No hay cuentas bancarias cargadas. Podés generar el preview igual; para guardar
            movimientos importados necesitás elegir una cuenta.
          </p>
        ) : null}
      </TreasuryFormField>

      <label className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--copilot-border)] bg-white/50 px-6 py-10 text-center">
        <Upload className="mb-3 h-8 w-8 text-[var(--copilot-ink-muted)]" />
        <span className="text-sm font-medium text-[var(--copilot-ink)]">
          Subí un extracto bancario
        </span>
        <span className="mt-1 text-xs text-[var(--copilot-ink-muted)]">
          Compatible con CSV, Excel o PDF exportado desde Santander.
        </span>
        <span className="mt-2 text-xs text-[var(--copilot-ink-muted)]">
          {selectedFile?.name ?? "Sin archivo seleccionado"}
        </span>
        <input
          type="file"
          accept=".csv,.xlsx,.xls,.pdf,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,application/pdf"
          className="sr-only"
          onChange={(e) => void handleFileChange(e.target.files?.[0] ?? null)}
        />
      </label>

      {fileError ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900" role="alert">
          {fileError}
        </p>
      ) : null}

      {currencyMismatch ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900" role="alert">
          La cuenta seleccionada es{" "}
          <strong className="font-semibold">{currencyMismatch.accountCurrency}</strong>, pero el
          extracto detectado es{" "}
          <strong className="font-semibold">{currencyMismatch.statementCurrency}</strong>. Elegí la
          cuenta correcta antes de guardar.
        </p>
      ) : null}

      <div className="rounded-xl border border-[var(--copilot-border)] bg-white/40">
        <button
          type="button"
          className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm"
          onClick={() => setFormatOpen((v) => !v)}
          aria-expanded={formatOpen}
        >
          <span className="font-medium text-[var(--copilot-ink)]">Formato esperado</span>
          <ChevronDown
            className={`h-4 w-4 text-[var(--copilot-ink-muted)] transition ${formatOpen ? "rotate-180" : ""}`}
          />
        </button>
        {formatOpen ? (
          <div className="border-t border-[var(--copilot-border)] px-3 pb-3 text-xs text-[var(--copilot-ink-muted)]">
            <p className="pt-2">
              El archivo debe incluir fecha, descripción y monto. Si el banco separa créditos y
              débitos en columnas distintas, Copilot los normaliza.
            </p>
            <p className="mt-2 font-medium text-[var(--copilot-ink)]">Columnas aceptadas:</p>
            <p className="mt-1">
              Fecha · Descripción / Concepto / Detalle · Importe / Monto · Débito · Crédito ·
              Moneda · Saldo · Referencia
            </p>
            <p className="mt-2">
              PDF Santander: Copilot intenta leer automáticamente extractos con tabla Fecha /
              Referencia / Descripción / Débito / Crédito / Saldo. Para mejor precisión, CSV o Excel
              suelen ser más confiables.
            </p>
          </div>
        ) : null}
      </div>

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
          disabled={!selectedFile || parsedRows.length === 0 || previewing || parsing}
          onClick={() => void handlePreview()}
        >
          {previewing ? <Loader2 className="h-4 w-4 animate-spin" /> : "Generar preview"}
        </CopilotGhostButton>
        {canWrite ? (
          <CopilotPrimaryButton
            type="button"
            disabled={!hasValidPreview || !accountId || importing || !!currencyMismatch}
            title={
              currencyMismatch
                ? `Moneda del extracto (${currencyMismatch.statementCurrency}) no coincide con la cuenta (${currencyMismatch.accountCurrency})`
                : !accountId
                  ? "Seleccioná una cuenta para guardar movimientos importados"
                  : !hasValidPreview
                    ? "Generá un preview válido antes de guardar"
                    : undefined
            }
            onClick={() => void handleImport()}
          >
            {importing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              "Guardar movimientos importados"
            )}
          </CopilotPrimaryButton>
        ) : (
          <PermissionButton
            lockedLabel="Vista previa permitida. Guardar requiere superadmin."
          >
            Guardar movimientos importados
          </PermissionButton>
        )}
      </div>

      <p className="text-xs text-[var(--copilot-ink-muted)]">
        {canWrite
          ? "Guardar solo registra el extracto bancario para conciliación. La caja cambia únicamente si confirmás un movimiento de Tesorería por separado."
          : "Vista previa permitida. Guardar requiere superadmin. El preview no modifica caja ni deuda."}
      </p>

      {summary ? (
        <div className="space-y-2 rounded-2xl border border-[var(--copilot-border)] bg-white/50 p-3">
          <p className="text-sm font-medium text-[var(--copilot-ink)]">
            Copilot encontró {summary.matched} coincidencias y {reviewCount} movimientos para
            revisar.
          </p>
          <div className="grid gap-2 text-xs text-[var(--copilot-ink-muted)] sm:grid-cols-2 lg:grid-cols-4">
            <span>Leídos: {summary.total}</span>
            <span>Coinciden: {summary.matched}</span>
            <span>Posibles: {summary.possible}</span>
            <span>Faltan en Copilot: {summary.missingCopilot}</span>
            <span>Faltan en Zeta: {summary.missingZeta}</span>
            <span>No identificados: {summary.unknown}</span>
            <span>Duplicados: {summary.duplicate}</span>
            <span>Ignorados: {summary.ignored}</span>
          </div>
          <div className="grid gap-1 text-xs sm:grid-cols-2">
            <span>Créditos: {formatCurrencyTotals(summary.creditsByCurrency)}</span>
            <span>Débitos: {formatCurrencyTotals(summary.debitsByCurrency)}</span>
          </div>
        </div>
      ) : null}

      {displayRows.length > 0 ? (
        <div className="overflow-x-auto rounded-2xl border border-[var(--copilot-border)] bg-white/50">
          <table className={TESORERIA_TABLE_CLASS}>
            <thead>
              <tr>
                <th className={TESORERIA_TH_CLASS}>Fecha</th>
                <th className={TESORERIA_TH_CLASS}>Descripción</th>
                <th className={TESORERIA_TH_CLASS}>Tipo</th>
                <th className={TESORERIA_TH_CLASS}>Moneda</th>
                <th className={TESORERIA_TH_CLASS}>Importe</th>
                <th className={TESORERIA_TH_CLASS}>Coincidencia</th>
                <th className={TESORERIA_TH_CLASS}>Confianza</th>
                <th className={TESORERIA_TH_CLASS}>Acción</th>
              </tr>
            </thead>
            <tbody>
              {displayRows.map((row) => (
                <tr key={row.externalId}>
                  <td className={TESORERIA_TD_CLASS}>{row.movementDate}</td>
                  <td className={`${TESORERIA_TD_CLASS} max-w-[200px] truncate`} title={row.description}>
                    {row.description}
                  </td>
                  <td className={TESORERIA_TD_CLASS}>{movementTypeLabel(row.movementType)}</td>
                  <td className={TESORERIA_TD_CLASS}>{row.currencyCode}</td>
                  <td className={TESORERIA_TD_CLASS}>
                    {formatTreasuryMoney(row.amount, row.currencyCode)}
                  </td>
                  <td className={TESORERIA_TD_CLASS}>
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusBadgeClass(row.status)}`}
                    >
                      {row.statusLabel}
                    </span>
                  </td>
                  <td className={TESORERIA_TD_CLASS}>
                    {row.confidence != null ? `${row.confidence}%` : "—"}
                  </td>
                  <td className={TESORERIA_TD_CLASS}>
                    <div className="flex flex-wrap gap-1">
                      <CopilotGhostButton
                        type="button"
                        className="!px-2 !py-1 text-xs"
                        onClick={() => setDetailRow(row)}
                      >
                        Ver detalle
                      </CopilotGhostButton>
                      <CopilotGhostButton
                        type="button"
                        className="!px-2 !py-1 text-xs"
                        onClick={() => toggleIgnore(row.externalId)}
                      >
                        {ignoredIds.has(row.externalId) ? "Desmarcar" : "Ignorar"}
                      </CopilotGhostButton>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {detailRow ? (
        <div className="fixed inset-0 z-40 flex justify-end bg-black/30">
          <div className="h-full w-full max-w-lg overflow-y-auto bg-[var(--copilot-card)] p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-lg font-semibold text-[var(--copilot-ink)]">Detalle del movimiento</h3>
              <button
                type="button"
                className="rounded-lg p-1 text-[var(--copilot-ink-muted)] hover:bg-black/5"
                onClick={() => setDetailRow(null)}
                aria-label="Cerrar"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <dl className="mt-4 space-y-2 text-sm">
              <div>
                <dt className="text-[var(--copilot-ink-muted)]">Fecha</dt>
                <dd>{detailRow.movementDate}</dd>
              </div>
              <div>
                <dt className="text-[var(--copilot-ink-muted)]">Descripción</dt>
                <dd>{detailRow.description}</dd>
              </div>
              <div>
                <dt className="text-[var(--copilot-ink-muted)]">Tipo</dt>
                <dd>{movementTypeLabel(detailRow.movementType)}</dd>
              </div>
              <div>
                <dt className="text-[var(--copilot-ink-muted)]">Moneda / Importe</dt>
                <dd>
                  {formatTreasuryMoney(detailRow.amount, detailRow.currencyCode)}
                </dd>
              </div>
              {detailRow.balanceAfter != null ? (
                <div>
                  <dt className="text-[var(--copilot-ink-muted)]">Saldo</dt>
                  <dd>
                    {formatTreasuryMoney(detailRow.balanceAfter, detailRow.currencyCode)}
                  </dd>
                </div>
              ) : null}
              {detailRow.documentNumber ? (
                <div>
                  <dt className="text-[var(--copilot-ink-muted)]">Referencia</dt>
                  <dd>{detailRow.documentNumber}</dd>
                </div>
              ) : null}
            </dl>

            <div className="mt-4 rounded-xl border border-[var(--copilot-border)] p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                Decisión sugerida
              </p>
              <p className="mt-1 text-sm text-[var(--copilot-ink)]">{detailRow.decisionHint}</p>
              <p className="mt-2 text-xs text-[var(--copilot-ink-muted)]">
                Estado: {detailRow.statusLabel}
                {detailRow.confidence != null ? ` · Confianza ${detailRow.confidence}%` : ""}
              </p>
            </div>

            {detailRow.matches.length > 0 ? (
              <div className="mt-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                  Coincidencias detectadas
                </p>
                <ul className="mt-2 space-y-2 text-sm">
                  {detailRow.matches.map((m) => (
                    <li
                      key={`${m.source}-${m.id}`}
                      className="rounded-lg border border-[var(--copilot-border)] px-3 py-2"
                    >
                      <span className="font-medium text-[var(--copilot-ink)]">{m.label}</span>
                      <span className="mt-0.5 block text-xs text-[var(--copilot-ink-muted)]">
                        {m.source === "treasury_manual"
                          ? "Movimiento Tesorería"
                          : m.source === "zeta_receipt"
                            ? "Recibo Zeta"
                            : "Cliente"}
                        {" · "}
                        {m.confidence}% · Δ monto {m.amountDelta.toFixed(2)} · Δ días {m.dayDelta}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="mt-4 text-sm text-[var(--copilot-ink-muted)]">
                No se encontraron coincidencias en Tesorería, Zeta ni por nombre de cliente.
              </p>
            )}

            <div className="mt-6 flex gap-2">
              <CopilotGhostButton type="button" onClick={() => toggleIgnore(detailRow.externalId)}>
                {ignoredIds.has(detailRow.externalId) ? "Desmarcar ignorado" : "Ignorar"}
              </CopilotGhostButton>
              <CopilotGhostButton type="button" onClick={() => setDetailRow(null)}>
                Cerrar
              </CopilotGhostButton>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
