"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { CopilotDataTrainingBlock } from "@/components/copilot/copilot-data-training-block";
import {
  CopilotGhostButton,
  CopilotGhostLink,
} from "@/components/copilot/copilot-ui";
import {
  getProtoInvoicesByCompany,
  type DataRow,
} from "@/lib/copilot-data";
import { companyPrimaryLabel } from "@/lib/copilot-datos-company-display";
import {
  DATA_TRAINING,
  operationalPaymentObligationAmountHint,
} from "@/lib/copilot-data-integrity";
import {
  getInvoiceStatusOptions,
  mapPaymentStatus,
  mapReceiptStatus,
  mapTaxObligationStatus,
  mapTaxTypeLabel,
} from "@/lib/copilot-format";
import { copilotApiFetch } from "@/lib/copilot-fetch";
import type { ProtoCrudResult } from "@/lib/copilot-proto-crud-types";
import {
  COPILOT_DATA_API,
  PROTO_COMPANY_RISK_LEVELS,
  PROTO_COMPANY_STATUSES,
  PROTO_PAYMENT_CATEGORY_SUGGESTIONS,
  PROTO_PAYMENT_STATUSES,
  PROTO_RECEIPT_STATUSES,
  PROTO_TAX_OBLIGATION_STATUSES,
  PROTO_TAX_PRIORITIES,
  PROTO_TAX_TYPES,
  type ProtoCrudEntity,
} from "@/lib/copilot-proto-crud-types";
import { matchTaxObligationForPayment } from "@/lib/copilot-tax-matching";
import {
  getProtoTaxObligations,
  isTaxObligationOpenForLink,
  type ProtoTaxObligation,
} from "@/lib/copilot-tax-data";

function toYmd(v: unknown): string {
  const s = String(v ?? "").trim();
  if (s.length >= 10 && /^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }
  return "";
}

function todayYmd(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function numStr(v: unknown): string {
  if (v == null || v === "") return "";
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? String(n) : "";
}

type DrawerFeedback = { kind: "ok" | "err"; text: string } | null;

export function CopilotProtoCrudDrawer({
  open,
  mode,
  entity,
  initialRow,
  companies,
  createTitle,
  variant = "drawer",
  onClose,
  onSaved,
}: {
  open: boolean;
  mode: "create" | "edit";
  entity: ProtoCrudEntity;
  initialRow: DataRow | null;
  companies: DataRow[];
  /** Título del encabezado en modo alta (p. ej. flujo guiado desde Finanzas). */
  createTitle?: string;
  /** `page`: formulario embebido sin overlay (flujo guiado); `drawer`: panel lateral. */
  variant?: "drawer" | "page";
  onClose: () => void;
  onSaved: (message: string, warning?: string) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<DrawerFeedback>(null);
  const [forceDuplicate, setForceDuplicate] = useState(false);
  const [duplicateAwaiting, setDuplicateAwaiting] = useState(false);

  const [invCompany, setInvCompany] = useState("");
  const [invNumber, setInvNumber] = useState("");
  const [invIssue, setInvIssue] = useState(todayYmd());
  const [invDue, setInvDue] = useState(todayYmd());
  const [invTotal, setInvTotal] = useState("");
  const [invBalance, setInvBalance] = useState("");
  const [invProb, setInvProb] = useState("0.6");
  const [invStatus, setInvStatus] = useState("issued");
  const [invCategory, setInvCategory] = useState("");
  const [invNotes, setInvNotes] = useState("");

  const [recCompany, setRecCompany] = useState("");
  const [recInvoice, setRecInvoice] = useState("");
  const [recNumber, setRecNumber] = useState("");
  const [recDate, setRecDate] = useState(todayYmd());
  const [recAmount, setRecAmount] = useState("");
  const [recMethod, setRecMethod] = useState("");
  const [recStatus, setRecStatus] = useState("paid");
  const [recRef, setRecRef] = useState("");
  const [recNotes, setRecNotes] = useState("");
  const [invoiceOptions, setInvoiceOptions] = useState<DataRow[]>([]);
  const [loadingInvoices, setLoadingInvoices] = useState(false);

  const [payCompany, setPayCompany] = useState("");
  const [payNumber, setPayNumber] = useState("");
  const [payDate, setPayDate] = useState(todayYmd());
  const [payAmount, setPayAmount] = useState("");
  const [payCategory, setPayCategory] = useState("");
  const [payVendor, setPayVendor] = useState("");
  const [payStatus, setPayStatus] = useState("paid");
  const [payRef, setPayRef] = useState("");
  const [payNotes, setPayNotes] = useState("");
  const [payObligation, setPayObligation] = useState("");
  const [taxObligationsAll, setTaxObligationsAll] = useState<ProtoTaxObligation[]>(
    []
  );
  const [loadingTaxObligations, setLoadingTaxObligations] = useState(false);
  const payObligationManualOverrideRef = useRef(false);
  const autoSuggestedObligationIdRef = useRef<string | null>(null);
  const payObligationRef = useRef("");
  payObligationRef.current = payObligation;
  const [autoObligationHint, setAutoObligationHint] = useState<string | null>(null);

  const onPayObligationUserInteract = useCallback(() => {
    payObligationManualOverrideRef.current = true;
    autoSuggestedObligationIdRef.current = null;
    setAutoObligationHint(null);
  }, []);

  const [taxType, setTaxType] = useState<(typeof PROTO_TAX_TYPES)[number]>("iva");
  const [taxPeriod, setTaxPeriod] = useState("");
  const [taxDue, setTaxDue] = useState(todayYmd());
  const [taxEst, setTaxEst] = useState("");
  const [taxConf, setTaxConf] = useState("");
  const [taxStatus, setTaxStatus] = useState("scheduled");
  const [taxPriority, setTaxPriority] = useState("medium");
  const [taxNotes, setTaxNotes] = useState("");

  const [coName, setCoName] = useState("");
  const [coIndustry, setCoIndustry] = useState("");
  const [coCity, setCoCity] = useState("");
  const [coStatus, setCoStatus] = useState("active");
  const [coRisk, setCoRisk] = useState("medium");

  const resetFromRow = useCallback(() => {
    setFeedback(null);
    setForceDuplicate(false);
    setDuplicateAwaiting(false);
    if (!open) return;

    if (entity === "companies") {
      const r = initialRow;
      if (mode === "edit" && r) {
        setCoName(String(r.name ?? ""));
        setCoIndustry(String(r.industry ?? ""));
        setCoCity(String(r.city ?? ""));
        const st = String(r.status ?? "active").toLowerCase();
        setCoStatus(
          PROTO_COMPANY_STATUSES.includes(st as (typeof PROTO_COMPANY_STATUSES)[number])
            ? st
            : "active"
        );
        const rk = String(r.risk_level ?? "medium").toLowerCase();
        setCoRisk(
          PROTO_COMPANY_RISK_LEVELS.includes(rk as (typeof PROTO_COMPANY_RISK_LEVELS)[number])
            ? rk
            : "medium"
        );
      } else {
        setCoName("");
        setCoIndustry("");
        setCoCity("");
        setCoStatus("active");
        setCoRisk("medium");
      }
    }

    if (entity === "invoices") {
      const r = initialRow;
      if (mode === "edit" && r) {
        setInvCompany(String(r.company_id ?? ""));
        setInvNumber(String(r.invoice_number ?? ""));
        setInvIssue(toYmd(r.issue_date) || todayYmd());
        setInvDue(toYmd(r.due_date) || todayYmd());
        setInvTotal(numStr(r.total_amount));
        setInvBalance(numStr(r.balance_amount));
        setInvProb(numStr(r.collection_probability) || "0.6");
        setInvStatus(String(r.status ?? "issued"));
        setInvCategory(String(r.category ?? ""));
        setInvNotes(String(r.notes ?? ""));
      } else {
        setInvCompany(companies[0]?.id ? String(companies[0].id) : "");
        setInvNumber("");
        setInvIssue(todayYmd());
        setInvDue(todayYmd());
        setInvTotal("");
        setInvBalance("");
        setInvProb("0.6");
        setInvStatus("issued");
        setInvCategory("");
        setInvNotes("");
      }
    }

    if (entity === "receipts") {
      const r = initialRow;
      if (mode === "edit" && r) {
        setRecCompany(String(r.company_id ?? ""));
        setRecInvoice(r.invoice_id ? String(r.invoice_id) : "");
        setRecNumber(String(r.receipt_number ?? ""));
        setRecDate(toYmd(r.receipt_date) || todayYmd());
        setRecAmount(numStr(r.amount));
        setRecMethod(String(r.payment_method ?? ""));
        setRecStatus(String(r.status ?? "paid"));
        setRecRef(String(r.reference ?? ""));
        setRecNotes(String(r.notes ?? ""));
      } else {
        setRecCompany(companies[0]?.id ? String(companies[0].id) : "");
        setRecInvoice("");
        setRecNumber("");
        setRecDate(todayYmd());
        setRecAmount("");
        setRecMethod("");
        setRecStatus("paid");
        setRecRef("");
        setRecNotes("");
      }
    }

    if (entity === "payments") {
      const r = initialRow;
      if (mode === "edit" && r) {
        setPayCompany(String(r.company_id ?? ""));
        setPayNumber(String(r.payment_number ?? ""));
        setPayDate(toYmd(r.payment_date) || todayYmd());
        setPayAmount(numStr(r.amount));
        setPayCategory(String(r.category ?? ""));
        setPayVendor(String(r.vendor_name ?? ""));
        setPayStatus(String(r.status ?? "paid"));
        setPayRef(String(r.reference ?? ""));
        setPayNotes(String(r.notes ?? ""));
        setPayObligation(r.obligation_id ? String(r.obligation_id) : "");
      } else {
        const r = initialRow;
        const preObl =
          r && r.obligation_id != null && String(r.obligation_id).trim() !== ""
            ? String(r.obligation_id).trim()
            : "";
        const preCo =
          r && r.company_id != null && String(r.company_id).trim() !== ""
            ? String(r.company_id).trim()
            : "";
        setPayCompany(
          preCo || (companies[0]?.id ? String(companies[0].id) : "")
        );
        setPayNumber("");
        setPayDate(todayYmd());
        setPayAmount("");
        setPayCategory("");
        setPayVendor("");
        setPayStatus("paid");
        setPayRef("");
        setPayNotes("");
        setPayObligation(preObl);
      }
    }

    if (entity === "tax_obligations") {
      const r = initialRow;
      if (mode === "edit" && r) {
        const tt = String(r.tax_type ?? "iva").toLowerCase();
        setTaxType(
          PROTO_TAX_TYPES.includes(tt as (typeof PROTO_TAX_TYPES)[number])
            ? (tt as (typeof PROTO_TAX_TYPES)[number])
            : "otros"
        );
        setTaxPeriod(String(r.period_label ?? ""));
        setTaxDue(toYmd(r.due_date) || todayYmd());
        setTaxEst(numStr(r.estimated_amount));
        setTaxConf(r.confirmed_amount != null ? numStr(r.confirmed_amount) : "");
        setTaxStatus(String(r.status ?? "scheduled"));
        setTaxPriority(String(r.priority ?? "medium"));
        setTaxNotes(String(r.notes ?? ""));
      } else {
        setTaxType("iva");
        setTaxPeriod("");
        setTaxDue(todayYmd());
        setTaxEst("");
        setTaxConf("");
        setTaxStatus("scheduled");
        setTaxPriority("medium");
        setTaxNotes("");
      }
    }
  }, [open, mode, entity, initialRow, companies]);

  useEffect(() => {
    resetFromRow();
  }, [resetFromRow]);

  useEffect(() => {
    if (!open || entity !== "payments") return;
    let cancelled = false;
    setLoadingTaxObligations(true);
    void getProtoTaxObligations()
      .then((list) => {
        if (!cancelled) setTaxObligationsAll(list);
      })
      .catch(() => {
        if (!cancelled) setTaxObligationsAll([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingTaxObligations(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, entity]);

  useEffect(() => {
    if (!open || entity !== "payments") return;
    if (mode === "create") {
      const prefilled =
        initialRow != null &&
        initialRow.obligation_id != null &&
        String(initialRow.obligation_id).trim() !== "";
      payObligationManualOverrideRef.current = !!prefilled;
      if (!prefilled) {
        autoSuggestedObligationIdRef.current = null;
        setAutoObligationHint(null);
      }
    } else {
      payObligationManualOverrideRef.current = true;
      setAutoObligationHint(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: optional chaining on initialRow avoids stale closure; full object dep would cause extra runs
  }, [open, entity, mode, initialRow?.id, initialRow?.obligation_id]);

  useEffect(() => {
    if (!open || entity !== "payments") return;

    const timerId = window.setTimeout(() => {
      if (payObligationManualOverrideRef.current) return;

      const companyId = payCompany.trim();
      const amount = Number(payAmount.replace(",", "."));
      if (!companyId || !Number.isFinite(amount) || amount <= 0) {
        const cur = payObligationRef.current;
        const autoId = autoSuggestedObligationIdRef.current;
        if (autoId != null && cur === autoId) {
          setPayObligation("");
          autoSuggestedObligationIdRef.current = null;
          setAutoObligationHint(null);
        }
        return;
      }

      const result = matchTaxObligationForPayment({
        amount,
        date: payDate,
        category: payCategory,
        company_id: companyId,
        obligations: taxObligationsAll,
      });

      if (result.obligation_id != null && result.score >= 50) {
        setPayObligation(result.obligation_id);
        autoSuggestedObligationIdRef.current = result.obligation_id;
        setAutoObligationHint(
          "Sugerido automáticamente (coincidencia de monto/fecha)"
        );
        return;
      }

      const cur = payObligationRef.current;
      const autoId = autoSuggestedObligationIdRef.current;
      if (autoId != null && cur === autoId) {
        setPayObligation("");
        autoSuggestedObligationIdRef.current = null;
      }
      setAutoObligationHint(null);
    }, 420);

    return () => window.clearTimeout(timerId);
  }, [
    open,
    entity,
    payAmount,
    payDate,
    payCategory,
    payCompany,
    taxObligationsAll,
  ]);

  useEffect(() => {
    if (!open || entity !== "receipts") return;
    const cid = recCompany.trim();
    if (!cid) {
      setInvoiceOptions([]);
      return;
    }
    let cancelled = false;
    setLoadingInvoices(true);
    void getProtoInvoicesByCompany(cid)
      .then((list) => {
        if (!cancelled) setInvoiceOptions(list);
      })
      .catch(() => {
        if (!cancelled) setInvoiceOptions([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingInvoices(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, entity, recCompany]);

  async function parseJsonResult(
    res: Response
  ): Promise<ProtoCrudResult<Record<string, unknown>>> {
    const j = (await res.json()) as ProtoCrudResult<Record<string, unknown>>;
    return j;
  }

  const submitCompany = async () => {
    const payload = {
      name: coName.trim(),
      industry: coIndustry.trim() || null,
      city: coCity.trim() || null,
      status: coStatus,
      risk_level: coRisk,
    };
    const ep = COPILOT_DATA_API.companies;
    const res =
      mode === "create"
        ? await copilotApiFetch(ep.create, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
        : await copilotApiFetch(ep.update, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              id: String(initialRow?.id ?? ""),
              ...payload,
            }),
          });
    return parseJsonResult(res);
  };

  const submitInvoice = async () => {
    const total = Number(invTotal.replace(",", "."));
    const balance =
      invBalance.trim() === "" ? total : Number(invBalance.replace(",", "."));
    const payload = {
      company_id: invCompany,
      invoice_number: invNumber.trim(),
      issue_date: invIssue,
      due_date: invDue,
      total_amount: total,
      balance_amount: balance,
      collection_probability: Number(invProb.replace(",", ".")),
      status: invStatus,
      category: invCategory.trim() || null,
      notes: invNotes.trim() || null,
    };
    const ep = COPILOT_DATA_API.invoices;
    const res =
      mode === "create"
        ? await copilotApiFetch(ep.create, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
        : await copilotApiFetch(ep.update, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              id: String(initialRow?.id ?? ""),
              ...payload,
            }),
          });
    return parseJsonResult(res);
  };

  const submitReceipt = async () => {
    const payload = {
      company_id: recCompany,
      invoice_id: recInvoice.trim() ? recInvoice.trim() : null,
      receipt_number: recNumber.trim(),
      receipt_date: recDate,
      amount: Number(recAmount.replace(",", ".")),
      payment_method: recMethod.trim() || null,
      status: recStatus,
      reference: recRef.trim() || null,
      notes: recNotes.trim() || null,
    };
    const ep = COPILOT_DATA_API.receipts;
    const res =
      mode === "create"
        ? await copilotApiFetch(ep.create, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
        : await copilotApiFetch(ep.update, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              id: String(initialRow?.id ?? ""),
              ...payload,
            }),
          });
    return parseJsonResult(res);
  };

  const submitPayment = async () => {
    const payload = {
      company_id: payCompany,
      payment_number: payNumber.trim(),
      payment_date: payDate,
      amount: Number(payAmount.replace(",", ".")),
      category: payCategory.trim(),
      vendor_name: payVendor.trim() || null,
      status: payStatus,
      reference: payRef.trim() || null,
      notes: payNotes.trim() || null,
      obligation_id: payObligation.trim() ? payObligation.trim() : null,
    };
    const ep = COPILOT_DATA_API.payments;
    const res =
      mode === "create"
        ? await copilotApiFetch(ep.create, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
        : await copilotApiFetch(ep.update, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              id: String(initialRow?.id ?? ""),
              ...payload,
            }),
          });
    return parseJsonResult(res);
  };

  const submitTax = async (confirmDup: boolean) => {
    const payload = {
      tax_type: taxType,
      period_label: taxPeriod.trim(),
      due_date: taxDue,
      estimated_amount: Number(taxEst.replace(",", ".")),
      confirmed_amount:
        taxConf.trim() === "" ? null : Number(taxConf.replace(",", ".")),
      status: taxStatus,
      priority: taxPriority,
      notes: taxNotes.trim() || null,
      confirm_duplicate: confirmDup,
    };
    const ep = COPILOT_DATA_API.tax_obligations;
    const res =
      mode === "create"
        ? await copilotApiFetch(ep.create, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
        : await copilotApiFetch(ep.update, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              id: String(initialRow?.id ?? ""),
              ...payload,
            }),
          });
    return parseJsonResult(res);
  };

  const handleSubmit = async () => {
    setSaving(true);
    if (!duplicateAwaiting) setFeedback(null);
    try {
      const confirmDup = forceDuplicate && duplicateAwaiting;
      let result: ProtoCrudResult<Record<string, unknown>>;
      if (entity === "companies") result = await submitCompany();
      else if (entity === "invoices") result = await submitInvoice();
      else if (entity === "receipts") result = await submitReceipt();
      else if (entity === "payments") result = await submitPayment();
      else result = await submitTax(confirmDup);

      if (result.ok) {
        setForceDuplicate(false);
        setDuplicateAwaiting(false);
        onSaved(result.message, result.warning);
        if (variant !== "page") onClose();
        return;
      }
      if (result.code === "DUPLICATE_TAX_PERIOD") {
        setDuplicateAwaiting(true);
        setFeedback({
          kind: "err",
          text: result.message,
        });
        return;
      }
      setDuplicateAwaiting(false);
      setFeedback({
        kind: "err",
        text: result.message,
      });
    } catch (e) {
      setFeedback({
        kind: "err",
        text: e instanceof Error ? e.message : "Error de red.",
      });
    } finally {
      setSaving(false);
    }
  };

  const title =
    mode === "create"
      ? createTitle?.trim()
        ? createTitle.trim()
        : `Nuevo · ${entityLabel(entity)}`
      : `Editar · ${entityLabel(entity)}`;

  if (!open) return null;

  const pageShell =
    variant === "page"
      ? "flex w-full max-w-2xl flex-col rounded-2xl border border-[var(--copilot-border)] bg-[var(--copilot-card)] shadow-sm"
      : "fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col border-l border-[var(--copilot-border)] bg-[var(--copilot-card)] shadow-2xl";

  return (
    <>
      {variant === "drawer" ? (
        <button
          type="button"
          className="fixed inset-0 z-[45] bg-[rgba(19,23,22,0.28)]"
          aria-label="Cerrar"
          onClick={onClose}
        />
      ) : null}
      <aside className={pageShell} aria-label={title}>
        {variant === "page" ? (
          <div className="flex items-center justify-end gap-3 border-b border-[var(--copilot-border)] px-5 py-3">
            <CopilotGhostLink href="/copilot/datos" className="text-sm font-semibold">
              Salir sin guardar
            </CopilotGhostLink>
          </div>
        ) : (
          <div className="flex items-start justify-between gap-3 border-b border-[var(--copilot-border)] px-5 py-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                Gestión de datos
              </p>
              <h3 className="mt-1 text-lg font-semibold text-[var(--copilot-ink)]">{title}</h3>
              <p className="mt-2 max-w-md text-xs leading-relaxed text-[var(--copilot-ink-muted)]">
                Los datos que guardes impactan cartera, caja y lecturas fiscales en el resto del Copilot.
                Leé el bloque de orientación antes de confirmar.
              </p>
            </div>
            <CopilotGhostButton type="button" onClick={onClose} className="px-3 py-1.5">
              Cerrar
            </CopilotGhostButton>
          </div>
        )}

        <div className="flex-1 space-y-4 overflow-auto px-5 py-4">
          {entity === "companies" ? (
            <CopilotDataTrainingBlock
              severity={DATA_TRAINING.companies.severity}
              paragraphs={DATA_TRAINING.companies.paragraphs}
            />
          ) : null}
          {entity === "invoices" ? (
            <CopilotDataTrainingBlock
              severity={DATA_TRAINING.invoices.severity}
              paragraphs={DATA_TRAINING.invoices.paragraphs}
            />
          ) : null}
          {entity === "receipts" ? (
            <CopilotDataTrainingBlock
              severity={DATA_TRAINING.receipts.severity}
              paragraphs={DATA_TRAINING.receipts.paragraphs}
            />
          ) : null}
          {entity === "payments" ? (
            <CopilotDataTrainingBlock
              severity={DATA_TRAINING.payments.severity}
              paragraphs={DATA_TRAINING.payments.paragraphs}
            />
          ) : null}
          {entity === "payments" ? (
            <CopilotDataTrainingBlock
              severity={DATA_TRAINING.payments_fiscal_link.severity}
              paragraphs={DATA_TRAINING.payments_fiscal_link.paragraphs}
            />
          ) : null}
          {entity === "payments" ? (
            <CopilotDataTrainingBlock
              severity={DATA_TRAINING.payments_auto_obligation.severity}
              paragraphs={DATA_TRAINING.payments_auto_obligation.paragraphs}
            />
          ) : null}
          {entity === "tax_obligations" ? (
            <CopilotDataTrainingBlock
              severity={DATA_TRAINING.tax_obligations.severity}
              paragraphs={DATA_TRAINING.tax_obligations.paragraphs}
            />
          ) : null}

          {feedback?.kind === "err" ? (
            <div className="rounded-xl border border-orange-200 bg-orange-50 px-3 py-2 text-sm text-orange-950">
              <p className="font-semibold text-orange-900">Revisá los datos</p>
              <p className="mt-1">{feedback.text}</p>
            </div>
          ) : null}

          {entity === "tax_obligations" && duplicateAwaiting ? (
            <CopilotDataTrainingBlock
              title="Duplicado fiscal detectado"
              severity={DATA_TRAINING.tax_duplicate_confirm.severity}
              paragraphs={DATA_TRAINING.tax_duplicate_confirm.paragraphs}
            />
          ) : null}

          {entity === "companies" ? (
            <CompanyFields
              coName={coName}
              setCoName={setCoName}
              coIndustry={coIndustry}
              setCoIndustry={setCoIndustry}
              coCity={coCity}
              setCoCity={setCoCity}
              coStatus={coStatus}
              setCoStatus={setCoStatus}
              coRisk={coRisk}
              setCoRisk={setCoRisk}
            />
          ) : null}

          {entity === "invoices" ? (
            <InvoiceFields
              companies={companies}
              invCompany={invCompany}
              setInvCompany={setInvCompany}
              invNumber={invNumber}
              setInvNumber={setInvNumber}
              invIssue={invIssue}
              setInvIssue={setInvIssue}
              invDue={invDue}
              setInvDue={setInvDue}
              invTotal={invTotal}
              setInvTotal={setInvTotal}
              invBalance={invBalance}
              setInvBalance={setInvBalance}
              invProb={invProb}
              setInvProb={setInvProb}
              invStatus={invStatus}
              setInvStatus={setInvStatus}
              invCategory={invCategory}
              setInvCategory={setInvCategory}
              invNotes={invNotes}
              setInvNotes={setInvNotes}
            />
          ) : null}

          {entity === "receipts" ? (
            <ReceiptFields
              companies={companies}
              recCompany={recCompany}
              setRecCompany={setRecCompany}
              invoiceOptions={invoiceOptions}
              loadingInvoices={loadingInvoices}
              recInvoice={recInvoice}
              setRecInvoice={setRecInvoice}
              recNumber={recNumber}
              setRecNumber={setRecNumber}
              recDate={recDate}
              setRecDate={setRecDate}
              recAmount={recAmount}
              setRecAmount={setRecAmount}
              recMethod={recMethod}
              setRecMethod={setRecMethod}
              recStatus={recStatus}
              setRecStatus={setRecStatus}
              recRef={recRef}
              setRecRef={setRecRef}
              recNotes={recNotes}
              setRecNotes={setRecNotes}
            />
          ) : null}

          {entity === "payments" ? (
            <PaymentFields
              companies={companies}
              payCompany={payCompany}
              setPayCompany={setPayCompany}
              payNumber={payNumber}
              setPayNumber={setPayNumber}
              payDate={payDate}
              setPayDate={setPayDate}
              payAmount={payAmount}
              setPayAmount={setPayAmount}
              payCategory={payCategory}
              setPayCategory={setPayCategory}
              payVendor={payVendor}
              setPayVendor={setPayVendor}
              payStatus={payStatus}
              setPayStatus={setPayStatus}
              payRef={payRef}
              setPayRef={setPayRef}
              payNotes={payNotes}
              setPayNotes={setPayNotes}
              payObligation={payObligation}
              setPayObligation={setPayObligation}
              taxObligationsAll={taxObligationsAll}
              loadingTaxObligations={loadingTaxObligations}
              onPayObligationUserInteract={onPayObligationUserInteract}
              autoObligationHint={autoObligationHint}
            />
          ) : null}

          {entity === "tax_obligations" ? (
            <TaxFields
              taxType={taxType}
              setTaxType={setTaxType}
              taxPeriod={taxPeriod}
              setTaxPeriod={setTaxPeriod}
              taxDue={taxDue}
              setTaxDue={setTaxDue}
              taxEst={taxEst}
              setTaxEst={setTaxEst}
              taxConf={taxConf}
              setTaxConf={setTaxConf}
              taxStatus={taxStatus}
              setTaxStatus={setTaxStatus}
              taxPriority={taxPriority}
              setTaxPriority={setTaxPriority}
              taxNotes={taxNotes}
              setTaxNotes={setTaxNotes}
            />
          ) : null}

          {entity === "tax_obligations" && duplicateAwaiting ? (
            <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/80 p-3 text-sm text-[var(--copilot-ink)]">
              <input
                type="checkbox"
                checked={forceDuplicate}
                onChange={(e) => setForceDuplicate(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                Confirmo que quiero guardar aunque exista otra obligación con el mismo impuesto y
                período.
              </span>
            </label>
          ) : null}
        </div>

        <div
          className={`flex flex-wrap gap-2 border-t border-[var(--copilot-border)] px-5 py-4 ${
            variant === "page" ? "justify-end" : ""
          }`}
        >
          {variant === "drawer" ? (
            <CopilotGhostButton type="button" onClick={onClose} disabled={saving}>
              Cancelar
            </CopilotGhostButton>
          ) : null}
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={
              saving ||
              (entity === "tax_obligations" && duplicateAwaiting && !forceDuplicate)
            }
            className="rounded-xl bg-[var(--copilot-accent)] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:opacity-95 disabled:opacity-100 disabled:bg-[var(--copilot-disabled-bg)] disabled:text-[var(--copilot-disabled-text)]"
          >
            {saving ? "Guardando…" : duplicateAwaiting ? "Confirmar y guardar" : "Guardar"}
          </button>
        </div>
      </aside>
    </>
  );
}

function entityLabel(e: ProtoCrudEntity): string {
  switch (e) {
    case "companies":
      return "Cliente";
    case "invoices":
      return "Factura";
    case "receipts":
      return "Recibo";
    case "payments":
      return "Pago";
    case "tax_obligations":
      return "Obligación fiscal";
    default:
      return e;
  }
}

function fieldClass() {
  return "mt-1 w-full rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)] px-3 py-2 text-sm text-[var(--copilot-ink)] outline-none focus:border-[var(--copilot-accent)]";
}

function labelClass() {
  return "block text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]";
}

function CompanyFields({
  coName,
  setCoName,
  coIndustry,
  setCoIndustry,
  coCity,
  setCoCity,
  coStatus,
  setCoStatus,
  coRisk,
  setCoRisk,
}: {
  coName: string;
  setCoName: (v: string) => void;
  coIndustry: string;
  setCoIndustry: (v: string) => void;
  coCity: string;
  setCoCity: (v: string) => void;
  coStatus: string;
  setCoStatus: (v: string) => void;
  coRisk: string;
  setCoRisk: (v: string) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="sm:col-span-2">
        <span className={labelClass()}>Nombre o razón social</span>
        <input
          type="text"
          value={coName}
          onChange={(e) => setCoName(e.target.value)}
          className={fieldClass()}
          autoComplete="organization"
        />
      </label>
      <label>
        <span className={labelClass()}>Industria</span>
        <input
          type="text"
          value={coIndustry}
          onChange={(e) => setCoIndustry(e.target.value)}
          className={fieldClass()}
        />
      </label>
      <label>
        <span className={labelClass()}>Ciudad</span>
        <input
          type="text"
          value={coCity}
          onChange={(e) => setCoCity(e.target.value)}
          className={fieldClass()}
        />
      </label>
      <label>
        <span className={labelClass()}>Estado</span>
        <select
          value={coStatus}
          onChange={(e) => setCoStatus(e.target.value)}
          className={fieldClass()}
        >
          {PROTO_COMPANY_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s === "active" ? "Activa" : s === "inactive" ? "Inactiva" : "Prospecto"}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span className={labelClass()}>Riesgo</span>
        <select
          value={coRisk}
          onChange={(e) => setCoRisk(e.target.value)}
          className={fieldClass()}
        >
          {PROTO_COMPANY_RISK_LEVELS.map((r) => (
            <option key={r} value={r}>
              {r === "low"
                ? "Bajo"
                : r === "medium"
                  ? "Medio"
                  : r === "high"
                    ? "Alto"
                    : "Crítico"}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

function InvoiceFields({
  companies,
  invCompany,
  setInvCompany,
  invNumber,
  setInvNumber,
  invIssue,
  setInvIssue,
  invDue,
  setInvDue,
  invTotal,
  setInvTotal,
  invBalance,
  setInvBalance,
  invProb,
  setInvProb,
  invStatus,
  setInvStatus,
  invCategory,
  setInvCategory,
  invNotes,
  setInvNotes,
}: {
  companies: DataRow[];
  invCompany: string;
  setInvCompany: (v: string) => void;
  invNumber: string;
  setInvNumber: (v: string) => void;
  invIssue: string;
  setInvIssue: (v: string) => void;
  invDue: string;
  setInvDue: (v: string) => void;
  invTotal: string;
  setInvTotal: (v: string) => void;
  invBalance: string;
  setInvBalance: (v: string) => void;
  invProb: string;
  setInvProb: (v: string) => void;
  invStatus: string;
  setInvStatus: (v: string) => void;
  invCategory: string;
  setInvCategory: (v: string) => void;
  invNotes: string;
  setInvNotes: (v: string) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="sm:col-span-2">
        <span className={labelClass()}>Cliente</span>
        <select
          value={invCompany}
          onChange={(e) => setInvCompany(e.target.value)}
          className={fieldClass()}
        >
          <option value="">Seleccionar…</option>
          {companies.map((c) => (
            <option key={String(c.id)} value={String(c.id)}>
              {companyPrimaryLabel(c)}
            </option>
          ))}
        </select>
      </label>
      <label className="sm:col-span-2">
        <span className={labelClass()}>Número de factura</span>
        <input
          className={fieldClass()}
          value={invNumber}
          onChange={(e) => setInvNumber(e.target.value)}
        />
      </label>
      <label>
        <span className={labelClass()}>Emisión</span>
        <input
          type="date"
          className={fieldClass()}
          value={invIssue}
          onChange={(e) => setInvIssue(e.target.value)}
        />
      </label>
      <label>
        <span className={labelClass()}>Vencimiento</span>
        <input
          type="date"
          className={fieldClass()}
          value={invDue}
          onChange={(e) => setInvDue(e.target.value)}
        />
      </label>
      <label>
        <span className={labelClass()}>Importe total</span>
        <input
          className={fieldClass()}
          inputMode="decimal"
          value={invTotal}
          onChange={(e) => setInvTotal(e.target.value)}
        />
      </label>
      <label>
        <span className={labelClass()}>Saldo (opcional)</span>
        <input
          className={fieldClass()}
          inputMode="decimal"
          value={invBalance}
          onChange={(e) => setInvBalance(e.target.value)}
          placeholder="Por defecto = total"
        />
      </label>
      <label>
        <span className={labelClass()}>Prob. cobro (0–1)</span>
        <input
          className={fieldClass()}
          inputMode="decimal"
          value={invProb}
          onChange={(e) => setInvProb(e.target.value)}
        />
      </label>
      <label>
        <span className={labelClass()}>Estado</span>
        <select
          value={invStatus}
          onChange={(e) => setInvStatus(e.target.value)}
          className={fieldClass()}
        >
          {getInvoiceStatusOptions().map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      <label className="sm:col-span-2">
        <span className={labelClass()}>Categoría (opcional)</span>
        <input
          className={fieldClass()}
          value={invCategory}
          onChange={(e) => setInvCategory(e.target.value)}
        />
      </label>
      <label className="sm:col-span-2">
        <span className={labelClass()}>Notas</span>
        <textarea
          className={`${fieldClass()} min-h-[72px]`}
          value={invNotes}
          onChange={(e) => setInvNotes(e.target.value)}
        />
      </label>
    </div>
  );
}

function ReceiptFields({
  companies,
  recCompany,
  setRecCompany,
  invoiceOptions,
  loadingInvoices,
  recInvoice,
  setRecInvoice,
  recNumber,
  setRecNumber,
  recDate,
  setRecDate,
  recAmount,
  setRecAmount,
  recMethod,
  setRecMethod,
  recStatus,
  setRecStatus,
  recRef,
  setRecRef,
  recNotes,
  setRecNotes,
}: {
  companies: DataRow[];
  recCompany: string;
  setRecCompany: (v: string) => void;
  invoiceOptions: DataRow[];
  loadingInvoices: boolean;
  recInvoice: string;
  setRecInvoice: (v: string) => void;
  recNumber: string;
  setRecNumber: (v: string) => void;
  recDate: string;
  setRecDate: (v: string) => void;
  recAmount: string;
  setRecAmount: (v: string) => void;
  recMethod: string;
  setRecMethod: (v: string) => void;
  recStatus: string;
  setRecStatus: (v: string) => void;
  recRef: string;
  setRecRef: (v: string) => void;
  recNotes: string;
  setRecNotes: (v: string) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="sm:col-span-2">
        <span className={labelClass()}>Cliente</span>
        <select
          value={recCompany}
          onChange={(e) => setRecCompany(e.target.value)}
          className={fieldClass()}
        >
          <option value="">Seleccionar…</option>
          {companies.map((c) => (
            <option key={String(c.id)} value={String(c.id)}>
              {companyPrimaryLabel(c)}
            </option>
          ))}
        </select>
      </label>
      <label className="sm:col-span-2">
        <span className={labelClass()}>
          Factura vinculada (opcional){" "}
          {loadingInvoices ? <span className="font-normal">— cargando…</span> : null}
        </span>
        <select
          value={recInvoice}
          onChange={(e) => setRecInvoice(e.target.value)}
          className={fieldClass()}
        >
          <option value="">Sin factura</option>
          {invoiceOptions.map((inv) => (
            <option key={String(inv.id)} value={String(inv.id)}>
              {String(inv.invoice_number ?? inv.id)} · ${numStr(inv.total_amount)}
            </option>
          ))}
        </select>
      </label>
      <label className="sm:col-span-2">
        <span className={labelClass()}>Número de recibo</span>
        <input
          className={fieldClass()}
          value={recNumber}
          onChange={(e) => setRecNumber(e.target.value)}
        />
      </label>
      <label>
        <span className={labelClass()}>Fecha</span>
        <input
          type="date"
          className={fieldClass()}
          value={recDate}
          onChange={(e) => setRecDate(e.target.value)}
        />
      </label>
      <label className="sm:col-span-2">
        <span className={labelClass()}>Monto</span>
        <input
          className={fieldClass()}
          inputMode="decimal"
          value={recAmount}
          onChange={(e) => setRecAmount(e.target.value)}
        />
        <p className="mt-1 text-xs leading-relaxed text-[var(--copilot-ink-muted)]">
          No puede superar lo pendiente de la factura vinculada; el sistema lo valida antes de
          guardar.
        </p>
      </label>
      <label>
        <span className={labelClass()}>Método de pago</span>
        <input
          className={fieldClass()}
          value={recMethod}
          onChange={(e) => setRecMethod(e.target.value)}
        />
      </label>
      <label>
        <span className={labelClass()}>Estado</span>
        <select
          value={recStatus}
          onChange={(e) => setRecStatus(e.target.value)}
          className={fieldClass()}
        >
          {PROTO_RECEIPT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {mapReceiptStatus(s)}
            </option>
          ))}
        </select>
      </label>
      <label className="sm:col-span-2">
        <span className={labelClass()}>Referencia</span>
        <input
          className={fieldClass()}
          value={recRef}
          onChange={(e) => setRecRef(e.target.value)}
        />
      </label>
      <label className="sm:col-span-2">
        <span className={labelClass()}>Notas</span>
        <textarea
          className={`${fieldClass()} min-h-[72px]`}
          value={recNotes}
          onChange={(e) => setRecNotes(e.target.value)}
        />
      </label>
    </div>
  );
}

function formatPaymentObligationOptionLabel(o: ProtoTaxObligation): string {
  const tax = mapTaxTypeLabel(o.tax_type);
  const money = o.estimated_amount.toLocaleString("es-UY", {
    maximumFractionDigits: 0,
  });
  return `${tax} · ${o.period_label} · $${money}`;
}

function PaymentFields({
  companies,
  payCompany,
  setPayCompany,
  payNumber,
  setPayNumber,
  payDate,
  setPayDate,
  payAmount,
  setPayAmount,
  payCategory,
  setPayCategory,
  payVendor,
  setPayVendor,
  payStatus,
  setPayStatus,
  payRef,
  setPayRef,
  payNotes,
  setPayNotes,
  payObligation,
  setPayObligation,
  taxObligationsAll,
  loadingTaxObligations,
  onPayObligationUserInteract,
  autoObligationHint,
}: {
  companies: DataRow[];
  payCompany: string;
  setPayCompany: (v: string) => void;
  payNumber: string;
  setPayNumber: (v: string) => void;
  payDate: string;
  setPayDate: (v: string) => void;
  payAmount: string;
  setPayAmount: (v: string) => void;
  payCategory: string;
  setPayCategory: (v: string) => void;
  payVendor: string;
  setPayVendor: (v: string) => void;
  payStatus: string;
  setPayStatus: (v: string) => void;
  payRef: string;
  setPayRef: (v: string) => void;
  payNotes: string;
  setPayNotes: (v: string) => void;
  payObligation: string;
  setPayObligation: (v: string) => void;
  taxObligationsAll: ProtoTaxObligation[];
  loadingTaxObligations: boolean;
  onPayObligationUserInteract: () => void;
  autoObligationHint: string | null;
}) {
  const obligationOptions = useMemo(() => {
    return taxObligationsAll.filter((o) => {
      if (isTaxObligationOpenForLink(o)) return true;
      return payObligation !== "" && o.id === payObligation;
    });
  }, [taxObligationsAll, payObligation]);

  const selectedObligation = useMemo(() => {
    if (!payObligation) return null;
    return taxObligationsAll.find((o) => o.id === payObligation) ?? null;
  }, [taxObligationsAll, payObligation]);

  const amountMismatchHint = useMemo(() => {
    if (!selectedObligation || !payAmount.trim()) return null;
    const payN = Number(payAmount.replace(",", "."));
    if (!Number.isFinite(payN) || payN <= 0) return null;
    const conf =
      selectedObligation.confirmed_amount != null
        ? Number(selectedObligation.confirmed_amount)
        : null;
    return operationalPaymentObligationAmountHint(
      selectedObligation.estimated_amount,
      conf,
      payN
    );
  }, [selectedObligation, payAmount]);

  const openCount = taxObligationsAll.filter((o) => isTaxObligationOpenForLink(o)).length;

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="sm:col-span-2">
        <span className={labelClass()}>Cliente</span>
        <select
          value={payCompany}
          onChange={(e) => setPayCompany(e.target.value)}
          className={fieldClass()}
        >
          <option value="">Seleccionar…</option>
          {companies.map((c) => (
            <option key={String(c.id)} value={String(c.id)}>
              {companyPrimaryLabel(c)}
            </option>
          ))}
        </select>
      </label>
      <label className="sm:col-span-2">
        <span className={labelClass()}>Identificador de pago</span>
        <input
          className={fieldClass()}
          value={payNumber}
          onChange={(e) => setPayNumber(e.target.value)}
        />
      </label>
      <label>
        <span className={labelClass()}>Fecha</span>
        <input
          type="date"
          className={fieldClass()}
          value={payDate}
          onChange={(e) => setPayDate(e.target.value)}
        />
      </label>
      <label>
        <span className={labelClass()}>Monto</span>
        <input
          className={fieldClass()}
          inputMode="decimal"
          value={payAmount}
          onChange={(e) => setPayAmount(e.target.value)}
        />
      </label>
      <label className="sm:col-span-2">
        <span className={labelClass()}>Categoría (obligatoria)</span>
        <input
          className={fieldClass()}
          value={payCategory}
          onChange={(e) => setPayCategory(e.target.value)}
          list="copilot-payment-categories"
        />
        <datalist id="copilot-payment-categories">
          {PROTO_PAYMENT_CATEGORY_SUGGESTIONS.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </label>
      <label className="sm:col-span-2">
        <span className={labelClass()}>Obligación fiscal (opcional)</span>
        <select
          value={payObligation}
          onChange={(e) => {
            onPayObligationUserInteract();
            setPayObligation(e.target.value);
          }}
          className={fieldClass()}
          disabled={loadingTaxObligations}
        >
          <option value="">
            Sin vínculo — el pago solo baja caja; la obligación puede seguir pendiente
          </option>
          {obligationOptions.map((o) => (
            <option key={o.id} value={o.id}>
              {formatPaymentObligationOptionLabel(o)}
            </option>
          ))}
        </select>
        {loadingTaxObligations ? (
          <p className="mt-1.5 text-xs text-[var(--copilot-ink-muted)]">
            Cargando obligaciones fiscales…
          </p>
        ) : null}
        {!loadingTaxObligations && taxObligationsAll.length === 0 ? (
          <p className="mt-1.5 text-xs leading-relaxed text-[var(--copilot-ink-muted)]">
            No hay obligaciones en la base. Podés cargarlas en la entidad Obligaciones fiscales
            o dejar este pago sin vínculo.
          </p>
        ) : null}
        {!loadingTaxObligations && taxObligationsAll.length > 0 && openCount === 0 ? (
          <p className="mt-1.5 text-xs leading-relaxed text-[var(--copilot-ink-muted)]">
            No quedan obligaciones abiertas para vincular. Si editás un pago ya asociado, seguirás
            viendo esa obligación aunque esté pagada.
          </p>
        ) : null}
        {autoObligationHint ? (
          <p
            className="mt-2 rounded-lg border border-[rgba(31,107,74,0.2)] bg-[var(--copilot-accent-soft)]/50 px-3 py-2 text-xs font-medium text-[var(--copilot-ink)]"
            role="status"
          >
            {autoObligationHint}
          </p>
        ) : null}
      </label>
      {amountMismatchHint ? (
        <div
          className="sm:col-span-2 rounded-xl border border-amber-200/90 bg-amber-50/85 px-3 py-2 text-xs leading-relaxed text-amber-950"
          role="status"
        >
          <span className="font-semibold">Revisión sugerida · </span>
          {amountMismatchHint}
        </div>
      ) : null}
      <label className="sm:col-span-2">
        <span className={labelClass()}>Proveedor / beneficiario</span>
        <input
          className={fieldClass()}
          value={payVendor}
          onChange={(e) => setPayVendor(e.target.value)}
        />
      </label>
      <label>
        <span className={labelClass()}>Estado</span>
        <select
          value={payStatus}
          onChange={(e) => setPayStatus(e.target.value)}
          className={fieldClass()}
        >
          {PROTO_PAYMENT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {mapPaymentStatus(s)}
            </option>
          ))}
        </select>
      </label>
      <label className="sm:col-span-2">
        <span className={labelClass()}>Referencia</span>
        <input
          className={fieldClass()}
          value={payRef}
          onChange={(e) => setPayRef(e.target.value)}
        />
      </label>
      <label className="sm:col-span-2">
        <span className={labelClass()}>Notas</span>
        <textarea
          className={`${fieldClass()} min-h-[72px]`}
          value={payNotes}
          onChange={(e) => setPayNotes(e.target.value)}
        />
      </label>
    </div>
  );
}

function TaxFields({
  taxType,
  setTaxType,
  taxPeriod,
  setTaxPeriod,
  taxDue,
  setTaxDue,
  taxEst,
  setTaxEst,
  taxConf,
  setTaxConf,
  taxStatus,
  setTaxStatus,
  taxPriority,
  setTaxPriority,
  taxNotes,
  setTaxNotes,
}: {
  taxType: (typeof PROTO_TAX_TYPES)[number];
  setTaxType: (v: (typeof PROTO_TAX_TYPES)[number]) => void;
  taxPeriod: string;
  setTaxPeriod: (v: string) => void;
  taxDue: string;
  setTaxDue: (v: string) => void;
  taxEst: string;
  setTaxEst: (v: string) => void;
  taxConf: string;
  setTaxConf: (v: string) => void;
  taxStatus: string;
  setTaxStatus: (v: string) => void;
  taxPriority: string;
  setTaxPriority: (v: string) => void;
  taxNotes: string;
  setTaxNotes: (v: string) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label>
        <span className={labelClass()}>Impuesto</span>
        <select
          value={taxType}
          onChange={(e) =>
            setTaxType(e.target.value as (typeof PROTO_TAX_TYPES)[number])
          }
          className={fieldClass()}
        >
          {PROTO_TAX_TYPES.map((t) => (
            <option key={t} value={t}>
              {mapTaxTypeLabel(t)}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span className={labelClass()}>Período (etiqueta)</span>
        <input
          className={fieldClass()}
          value={taxPeriod}
          onChange={(e) => setTaxPeriod(e.target.value)}
          placeholder="ej. Marzo 2026"
        />
      </label>
      <label>
        <span className={labelClass()}>Vencimiento</span>
        <input
          type="date"
          className={fieldClass()}
          value={taxDue}
          onChange={(e) => setTaxDue(e.target.value)}
        />
      </label>
      <label>
        <span className={labelClass()}>Monto estimado</span>
        <input
          className={fieldClass()}
          inputMode="decimal"
          value={taxEst}
          onChange={(e) => setTaxEst(e.target.value)}
        />
      </label>
      <label>
        <span className={labelClass()}>Monto confirmado (opcional)</span>
        <input
          className={fieldClass()}
          inputMode="decimal"
          value={taxConf}
          onChange={(e) => setTaxConf(e.target.value)}
        />
      </label>
      <label>
        <span className={labelClass()}>Estado</span>
        <select
          value={taxStatus}
          onChange={(e) => setTaxStatus(e.target.value)}
          className={fieldClass()}
        >
          {PROTO_TAX_OBLIGATION_STATUSES.map((s) => (
            <option key={s} value={s}>
              {mapTaxObligationStatus(s)}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span className={labelClass()}>Prioridad</span>
        <select
          value={taxPriority}
          onChange={(e) => setTaxPriority(e.target.value)}
          className={fieldClass()}
        >
          {PROTO_TAX_PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </label>
      <label className="sm:col-span-2">
        <span className={labelClass()}>Notas</span>
        <textarea
          className={`${fieldClass()} min-h-[72px]`}
          value={taxNotes}
          onChange={(e) => setTaxNotes(e.target.value)}
        />
      </label>
    </div>
  );
}
