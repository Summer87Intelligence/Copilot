// eslint-disable-next-line @typescript-eslint/no-require-imports
const PDFDocument = require("pdfkit/js/pdfkit.standalone.js") as new (
  opts?: PDFKit.PDFDocumentOptions
) => PDFKit.PDFDocument;

import type { DashboardSummaryPdfModel } from "./build-dashboard-summary-pdf-model";
import { COLLECTION_RATE_METRICS, METRIC_LABEL } from "@/lib/copilot-financial-metrics-contract";

// ── Constants ──────────────────────────────────────────────────────────────

const COLORS = {
  ink: "#1a1a1a",
  muted: "#6b7280",
  accent: "#1a5fa8",
  border: "#d1d5db",
  rowAlt: "#f8fafc",
  headerBg: "#e8f0f8",
  sectionBg: "#f1f5f9",
  okBg: "#f0fdf4",
  okBorder: "#bbf7d0",
  okText: "#14532d",
  attnBg: "#fffbeb",
  attnBorder: "#fde68a",
  attnText: "#78350f",
  critBg: "#fff1f2",
  critBorder: "#fecdd3",
  critText: "#881337",
  amberText: "#b45309",
  redText: "#be123c",
  greenText: "#15803d",
};

const PAGE = { margin: 52, width: 595, height: 842 };
const FOOTER_RESERVE = 44;
const MAX_Y = PAGE.height - PAGE.margin - FOOTER_RESERVE;
const CONTENT_W = PAGE.width - PAGE.margin * 2; // 491

// ── Formatters ─────────────────────────────────────────────────────────────

function fmtMoney(amount: number, currency: "UYU" | "USD"): string {
  if (currency === "USD") {
    return `U$S ${amount.toLocaleString("es-UY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  return `$ ${Math.round(amount).toLocaleString("es-UY", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function fmtDate(d: string): string {
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

function fmtDatetime(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString("es-UY", { day: "2-digit", month: "2-digit", year: "numeric" });
  const time = d.toLocaleTimeString("es-UY", { hour: "2-digit", minute: "2-digit" });
  return `${date} ${time}`;
}

function truncate(doc: PDFKit.PDFDocument, text: string, width: number): string {
  if (doc.widthOfString(text) <= width) return text;
  let t = text;
  while (t.length > 1 && doc.widthOfString(`${t}…`) > width) t = t.slice(0, -1);
  return `${t}…`;
}

// ── Main renderer ──────────────────────────────────────────────────────────

export function renderDashboardSummaryPdf(model: DashboardSummaryPdfModel): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: PAGE.margin, bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    let y = PAGE.margin;
    let pageNum = 1;

    // ── Helpers ──────────────────────────────────────────────────────────────

    const renderFooter = () => {
      const fy = PAGE.height - PAGE.margin - 26;
      doc.strokeColor(COLORS.border).lineWidth(0.3)
        .moveTo(PAGE.margin, fy - 5).lineTo(PAGE.margin + CONTENT_W, fy - 5).stroke();
      doc.fillColor(COLORS.muted).font("Helvetica").fontSize(7)
        .text(`Página ${pageNum}`, PAGE.margin, fy, { width: CONTENT_W, align: "right" });
      doc.text("Documento informativo generado por Summer87 Copilot", PAGE.margin, fy + 10, {
        width: CONTENT_W, align: "center",
      });
    };

    const breakPage = () => {
      renderFooter();
      doc.addPage();
      pageNum += 1;
      y = PAGE.margin;
    };

    const ensureSpace = (needed: number) => {
      if (y + needed > MAX_Y) breakPage();
    };

    const sectionTitle = (title: string) => {
      ensureSpace(30);
      doc.fillColor(COLORS.accent).font("Helvetica-Bold").fontSize(9).text(title, PAGE.margin, y);
      y += 4;
      doc.strokeColor(COLORS.border).lineWidth(0.3)
        .moveTo(PAGE.margin, y).lineTo(PAGE.margin + CONTENT_W, y).stroke();
      y += 9;
    };

    // ── [1] Title block ───────────────────────────────────────────────────────
    doc.fillColor(COLORS.muted).font("Helvetica").fontSize(8)
      .text("Summer87 Copilot", PAGE.margin, y);
    y += 13;

    doc.fillColor(COLORS.accent).font("Helvetica-Bold").fontSize(16)
      .text("Dashboard Resumen Ejecutivo", PAGE.margin, y);
    y += 22;

    const currLabel =
      model.currency === "all" ? "UYU + USD (separado)"
      : model.currency === "UYU" ? "Pesos uruguayos (UYU)"
      : model.currency === "USD_consolidated" ? "USD consolidado"
      : "Dólares (USD)";

    const metaLines = [
      `Período: ${fmtDate(model.period.from)} → ${fmtDate(model.period.to)}`,
      `Moneda: ${currLabel}`,
      model.currency === "USD_consolidated" && model.exchangeRateUyuPerUsd
        ? `Tipo de cambio usado: 1 USD = ${model.exchangeRateUyuPerUsd.toLocaleString("es-UY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} UYU`
        : null,
      `Generado: ${fmtDatetime(model.generatedAt)}`,
      model.issuerName ? `Empresa: ${model.issuerName}` : null,
    ].filter(Boolean) as string[];

    doc.fillColor(COLORS.muted).font("Helvetica").fontSize(8.5);
    for (const line of metaLines) {
      doc.text(line, PAGE.margin, y);
      y += 12;
    }
    y += 8;

    // ── [2] Executive summary banner ──────────────────────────────────────────
    const stateMap = {
      ok: { label: "Estable", bg: COLORS.okBg, border: COLORS.okBorder, text: COLORS.okText },
      attention: { label: "Atención", bg: COLORS.attnBg, border: COLORS.attnBorder, text: COLORS.attnText },
      critical: { label: "Crítico", bg: COLORS.critBg, border: COLORS.critBorder, text: COLORS.critText },
    };
    const st = stateMap[model.dashboardState];

    ensureSpace(28);
    const bannerH = 24;
    doc.fillColor(st.bg).rect(PAGE.margin, y, CONTENT_W, bannerH).fill();
    doc.strokeColor(st.border).lineWidth(0.5)
      .rect(PAGE.margin, y, CONTENT_W, bannerH).stroke();
    doc.fillColor(st.text).font("Helvetica-Bold").fontSize(9)
      .text(`Estado financiero: ${st.label}`, PAGE.margin + 10, y + 7, { width: CONTENT_W - 20 });
    y += bannerH + 14;

    // ── KPI cards (2-column grid) ─────────────────────────────────────────────
    const uyu = model.currencyData.find((d) => d.currency === "UYU");
    const usd = model.currencyData.find((d) => d.currency === "USD");
    const showUYU = model.currency !== "USD" && model.currency !== "USD_consolidated" && !!uyu;
    const showUSD = (model.currency !== "UYU") && !!usd;
    const showBoth = showUYU && showUSD;

    const kpiRows = [
      { label: METRIC_LABEL.facturado_periodo, uyuVal: uyu?.facturado, usdVal: usd?.facturado },
      { label: METRIC_LABEL.cobrado_aplicado,   uyuVal: uyu?.cobrado,   usdVal: usd?.cobrado },
      { label: METRIC_LABEL.pendiente_periodo, uyuVal: uyu?.pendientePeriodo, usdVal: usd?.pendientePeriodo },
      { label: METRIC_LABEL.deuda_activa,      uyuVal: uyu?.deudaActiva, usdVal: usd?.deudaActiva },
      { label: METRIC_LABEL.deuda_vencida,     uyuVal: uyu?.deudaVencida, usdVal: usd?.deudaVencida, warn: true },
      { label: METRIC_LABEL.caja_disponible,   uyuVal: uyu?.cajaDisponible, usdVal: usd?.cajaDisponible },
      { label: METRIC_LABEL.caja_despues_pagos, uyuVal: uyu?.cajaDespPagos, usdVal: usd?.cajaDespPagos },
    ];

    const cardW = 240;
    const cardGap = CONTENT_W - cardW * 2;
    const cardH = showBoth ? 52 : 44;

    const renderKpiCard = (
      item: typeof kpiRows[0],
      xOffset: number
    ) => {
      const cx = PAGE.margin + xOffset;
      doc.fillColor(COLORS.sectionBg).rect(cx, y, cardW, cardH).fill();
      doc.strokeColor(COLORS.border).lineWidth(0.3).rect(cx, y, cardW, cardH).stroke();
      doc.fillColor(COLORS.muted).font("Helvetica").fontSize(7)
        .text(item.label, cx + 6, y + 5, { width: cardW - 12 });
      if (showBoth) {
        if (showUYU) {
          const val = item.uyuVal ?? 0;
          const color = item.warn && val > 0 ? COLORS.amberText : COLORS.ink;
          doc.fillColor(color).font(item.warn ? "Helvetica-Bold" : "Helvetica").fontSize(9)
            .text(fmtMoney(val, "UYU"), cx + 6, y + 18, { width: cardW - 12 });
        }
        if (showUSD) {
          const val = item.usdVal ?? 0;
          const color = item.warn && val > 0 ? COLORS.amberText : COLORS.ink;
          doc.fillColor(color).font(item.warn ? "Helvetica-Bold" : "Helvetica").fontSize(9)
            .text(fmtMoney(val, "USD"), cx + 6, y + 31, { width: cardW - 12 });
        }
      } else if (showUYU) {
        const val = item.uyuVal ?? 0;
        const color = item.warn && val > 0 ? COLORS.amberText : COLORS.ink;
        doc.fillColor(color).font(item.warn ? "Helvetica-Bold" : "Helvetica").fontSize(11)
          .text(fmtMoney(val, "UYU"), cx + 6, y + 19, { width: cardW - 12 });
      } else if (showUSD) {
        const val = item.usdVal ?? 0;
        const color = item.warn && val > 0 ? COLORS.amberText : COLORS.ink;
        doc.fillColor(color).font(item.warn ? "Helvetica-Bold" : "Helvetica").fontSize(11)
          .text(fmtMoney(val, "USD"), cx + 6, y + 19, { width: cardW - 12 });
      }
    };

    for (let i = 0; i < kpiRows.length; i += 2) {
      ensureSpace(cardH + 6);
      renderKpiCard(kpiRows[i]!, 0);
      if (kpiRows[i + 1]) renderKpiCard(kpiRows[i + 1]!, cardW + cardGap);
      y += cardH + 6;
    }
    y += 8;

    // ── [3] Cobranza efectiva aplicada ────────────────────────────────────────
    if (model.currencyData.some((d) => d.efectividad !== null)) {
      sectionTitle(`${COLLECTION_RATE_METRICS.applied_collection_rate.label} del período`);
      for (const d of model.currencyData) {
        if (d.efectividad === null) continue;
        ensureSpace(14);
        const pct = Math.round(d.efectividad * 100);
        const color = pct >= 80 ? COLORS.greenText : pct >= 50 ? COLORS.amberText : COLORS.redText;
        doc.fillColor(COLORS.muted).font("Helvetica").fontSize(8)
          .text(`${d.currency}:`, PAGE.margin + 4, y);
        doc.fillColor(color).font("Helvetica-Bold").fontSize(8)
          .text(`${pct}%`, PAGE.margin + 35, y);
        y += 13;
      }
      y += 4;
    }

    // ── [4] Tendencia mensual ─────────────────────────────────────────────────
    if (model.monthlyData.length > 0) {
      sectionTitle("Tendencia mensual del período");

      const hasUYU = showUYU && model.monthlyData.some((m) => m.issuedUYU > 0 || m.collectedUYU > 0);
      const hasUSD = showUSD && model.monthlyData.some((m) => m.issuedUSD > 0 || m.collectedUSD > 0);

      if (hasUYU || hasUSD) {
        const colDefs: { label: string; key: keyof typeof model.monthlyData[0]; currency: "UYU" | "USD" }[] = [];
        if (hasUYU) {
          colDefs.push({ label: "Facturado UYU", key: "issuedUYU", currency: "UYU" });
          colDefs.push({ label: "Cobrado UYU", key: "collectedUYU", currency: "UYU" });
        }
        if (hasUSD) {
          colDefs.push({ label: "Facturado USD", key: "issuedUSD", currency: "USD" });
          colDefs.push({ label: "Cobrado USD", key: "collectedUSD", currency: "USD" });
        }

        const monthColW = 38;
        const dataColW = Math.floor((CONTENT_W - monthColW) / colDefs.length);
        const tW = monthColW + dataColW * colDefs.length;
        const tRowH = 18;

        ensureSpace(tRowH + model.monthlyData.length * tRowH + 8);

        doc.fillColor(COLORS.headerBg).rect(PAGE.margin, y, tW, tRowH).fill();
        doc.fillColor(COLORS.accent).font("Helvetica-Bold").fontSize(7)
          .text("Mes", PAGE.margin + 4, y + 6, { width: monthColW - 8 });
        let hx = PAGE.margin + monthColW;
        for (const col of colDefs) {
          doc.text(col.label, hx + 2, y + 6, { width: dataColW - 4, align: "right" });
          hx += dataColW;
        }
        y += tRowH;

        for (let i = 0; i < model.monthlyData.length; i++) {
          const m = model.monthlyData[i]!;
          ensureSpace(tRowH);
          if (i % 2 === 1) doc.fillColor(COLORS.rowAlt).rect(PAGE.margin, y, tW, tRowH).fill();
          doc.fillColor(COLORS.ink).font("Helvetica").fontSize(7)
            .text(m.monthLabel, PAGE.margin + 4, y + 6, { width: monthColW - 8 });
          let dx = PAGE.margin + monthColW;
          for (const col of colDefs) {
            const val = m[col.key] as number;
            doc.fillColor(val > 0 ? COLORS.ink : COLORS.muted)
              .text(val > 0 ? fmtMoney(val, col.currency) : "—", dx + 2, y + 6, {
                width: dataColW - 4, align: "right",
              });
            dx += dataColW;
          }
          y += tRowH;
        }
        y += 10;
      }
    }

    // ── [5] Deuda por antigüedad ──────────────────────────────────────────────
    const agingKeys = ["0-30", "31-60", "61-90", "90+"] as const;
    const agingLabels: Record<string, string> = {
      "0-30": "0–30 días", "31-60": "31–60 días", "61-90": "61–90 días", "90+": "+90 días",
    };
    const agingDataUYU = uyu?.aging ?? [];
    const agingDataUSD = usd?.aging ?? [];

    const hasAging =
      (showUYU && agingDataUYU.some((b) => b.amount > 0)) ||
      (showUSD && agingDataUSD.some((b) => b.amount > 0));

    if (hasAging) {
      sectionTitle("Deuda por antigüedad (basado en fecha de vencimiento)");

      const renderAgingBlock = (label: string, data: typeof agingDataUYU, currency: "UYU" | "USD") => {
        const rows = agingKeys.map((k) => ({
          label: agingLabels[k]!,
          amount: data.find((b) => b.label === k)?.amount ?? 0,
        }));
        if (rows.every((r) => r.amount === 0)) return;

        const colW = { bucket: 120, amount: CONTENT_W - 120 };
        const tW = CONTENT_W;
        const tRowH = 18;

        ensureSpace(tRowH + rows.length * tRowH + 18);

        doc.fillColor(COLORS.muted).font("Helvetica-Bold").fontSize(7.5)
          .text(label, PAGE.margin, y);
        y += 11;

        doc.fillColor(COLORS.headerBg).rect(PAGE.margin, y, tW, tRowH).fill();
        doc.fillColor(COLORS.accent).font("Helvetica-Bold").fontSize(7)
          .text("Antigüedad", PAGE.margin + 4, y + 6, { width: colW.bucket - 8 })
          .text("Monto", PAGE.margin + colW.bucket + 4, y + 6, { width: colW.amount - 8, align: "right" });
        y += tRowH;

        for (let i = 0; i < rows.length; i++) {
          const r = rows[i]!;
          if (i % 2 === 1) doc.fillColor(COLORS.rowAlt).rect(PAGE.margin, y, tW, tRowH).fill();
          doc.fillColor(COLORS.muted).font("Helvetica").fontSize(7.5)
            .text(r.label, PAGE.margin + 4, y + 6, { width: colW.bucket - 8 });
          doc.fillColor(r.amount > 0 ? COLORS.ink : COLORS.muted).font("Helvetica").fontSize(7.5)
            .text(r.amount > 0 ? fmtMoney(r.amount, currency) : "—",
              PAGE.margin + colW.bucket + 4, y + 6, { width: colW.amount - 8, align: "right" });
          y += tRowH;
        }
        y += 8;
      };

      if (showUYU) renderAgingBlock("UYU — Pesos uruguayos", agingDataUYU, "UYU");
      if (showUSD) renderAgingBlock("USD — Dólares", agingDataUSD, "USD");
    }

    // ── [6] Top 10 deudores ───────────────────────────────────────────────────
    const renderTopDebtorsBlock = (
      label: string,
      items: { name: string; value: number }[],
      currency: "UYU" | "USD",
      top10Pct: number | null
    ) => {
      if (items.length === 0) return;
      ensureSpace(30 + items.length * 18 + 20);
      sectionTitle(label);

      if (top10Pct !== null) {
        doc.fillColor(COLORS.muted).font("Helvetica").fontSize(7.5)
          .text(`Concentran el ${top10Pct}% de la deuda ${currency} total.`, PAGE.margin, y);
        y += 11;
      }

      const colW = { rank: 24, client: 310, debt: CONTENT_W - 24 - 310 };
      const tW = CONTENT_W;
      const tRowH = 18;

      doc.fillColor(COLORS.headerBg).rect(PAGE.margin, y, tW, tRowH).fill();
      doc.fillColor(COLORS.accent).font("Helvetica-Bold").fontSize(7.5);
      doc.text("#", PAGE.margin + 4, y + 6, { width: colW.rank - 8, align: "center" });
      doc.text("Cliente", PAGE.margin + colW.rank + 4, y + 6, { width: colW.client - 8 });
      doc.text(`Deuda ${currency}`, PAGE.margin + colW.rank + colW.client + 4, y + 6, {
        width: colW.debt - 8, align: "right",
      });
      y += tRowH;

      for (let i = 0; i < items.length; i++) {
        const item = items[i]!;
        ensureSpace(tRowH);
        if (i % 2 === 1) doc.fillColor(COLORS.rowAlt).rect(PAGE.margin, y, tW, tRowH).fill();
        doc.fillColor(COLORS.ink).font("Helvetica").fontSize(7.5);
        doc.text(String(i + 1), PAGE.margin + 4, y + 6, { width: colW.rank - 8, align: "center" });
        doc.text(truncate(doc, item.name, colW.client - 8), PAGE.margin + colW.rank + 4, y + 6, {
          width: colW.client - 8,
        });
        doc.text(fmtMoney(item.value, currency),
          PAGE.margin + colW.rank + colW.client + 4, y + 6,
          { width: colW.debt - 8, align: "right" });
        y += tRowH;
      }
      y += 10;
    };

    renderTopDebtorsBlock("Top 10 deudores UYU", model.top10DebtorsUYU, "UYU", model.uyuTop10Pct);
    renderTopDebtorsBlock("Top 10 deudores USD", model.top10DebtorsUSD, "USD", model.usdTop10Pct);

    // ── [7] Top 10 facturación neta histórica ─────────────────────────────────
    const renderTopBillingBlock = (
      label: string,
      items: { name: string; value: number }[],
      currency: "UYU" | "USD"
    ) => {
      if (items.length === 0) return;
      ensureSpace(30 + items.length * 18 + 20);
      sectionTitle(label);
      doc.fillColor(COLORS.muted).font("Helvetica").fontSize(7.5)
        .text("Facturas activas menos notas de crédito · desde enero 2026.", PAGE.margin, y);
      y += 11;

      const colW = { rank: 24, client: 320, billing: CONTENT_W - 24 - 320 };
      const tW = CONTENT_W;
      const tRowH = 18;

      doc.fillColor(COLORS.headerBg).rect(PAGE.margin, y, tW, tRowH).fill();
      doc.fillColor(COLORS.accent).font("Helvetica-Bold").fontSize(7.5);
      doc.text("#", PAGE.margin + 4, y + 6, { width: colW.rank - 8, align: "center" });
      doc.text("Cliente", PAGE.margin + colW.rank + 4, y + 6, { width: colW.client - 8 });
      doc.text(`Facturación ${currency}`, PAGE.margin + colW.rank + colW.client + 4, y + 6, {
        width: colW.billing - 8, align: "right",
      });
      y += tRowH;

      for (let i = 0; i < items.length; i++) {
        const item = items[i]!;
        ensureSpace(tRowH);
        if (i % 2 === 1) doc.fillColor(COLORS.rowAlt).rect(PAGE.margin, y, tW, tRowH).fill();
        doc.fillColor(COLORS.ink).font("Helvetica").fontSize(7.5);
        doc.text(String(i + 1), PAGE.margin + 4, y + 6, { width: colW.rank - 8, align: "center" });
        doc.text(truncate(doc, item.name, colW.client - 8), PAGE.margin + colW.rank + 4, y + 6, {
          width: colW.client - 8,
        });
        doc.text(fmtMoney(item.value, currency),
          PAGE.margin + colW.rank + colW.client + 4, y + 6,
          { width: colW.billing - 8, align: "right" });
        y += tRowH;
      }
      y += 10;
    };

    renderTopBillingBlock("Top 10 facturación neta histórica UYU", model.top10BillingUYU, "UYU");
    renderTopBillingBlock("Top 10 facturación neta histórica USD", model.top10BillingUSD, "USD");

    // ── [8] Estado de cartera ─────────────────────────────────────────────────
    ensureSpace(60);
    sectionTitle("Estado de cartera");
    doc.fillColor(COLORS.muted).font("Helvetica").fontSize(7.5)
      .text(
        "Los clientes se cuentan una sola vez aunque tengan deuda en más de una moneda.",
        PAGE.margin, y
      );
    y += 11;

    const cs = model.clientStates;
    // CLIENT-DEBT-SEMANTICS-001 Etapa C: nueva taxonomía oficial.
    // "Al día" = sin deuda (único caso). El resto se distribuye en buckets
    // por días desde emisión.
    const stateGrid = [
      { label: "Clientes activos", value: cs.total, color: COLORS.ink },
      { label: "Al día", value: cs.sinDeuda, color: COLORS.greenText },
      { label: "Con deuda (0–30 días)", value: cs.conDeuda, color: COLORS.ink },
      { label: "Atrasado / Crítico", value: cs.atrasado + cs.critico, color: COLORS.amberText },
    ];

    const gridColW = Math.floor(CONTENT_W / 2) - 3;
    const gridRowH = 28;

    for (let i = 0; i < stateGrid.length; i += 2) {
      ensureSpace(gridRowH + 4);
      const left = stateGrid[i]!;
      const right = stateGrid[i + 1];

      const renderGridCell = (item: typeof left, xOffset: number) => {
        const cx = PAGE.margin + xOffset;
        doc.fillColor(COLORS.sectionBg).rect(cx, y, gridColW, gridRowH).fill();
        doc.strokeColor(COLORS.border).lineWidth(0.3).rect(cx, y, gridColW, gridRowH).stroke();
        doc.fillColor(COLORS.muted).font("Helvetica").fontSize(7).text(item.label, cx + 6, y + 5, {
          width: gridColW - 12,
        });
        doc.fillColor(item.color).font("Helvetica-Bold").fontSize(13).text(String(item.value), cx + 6, y + 13, {
          width: gridColW - 12,
        });
      };

      renderGridCell(left, 0);
      if (right) renderGridCell(right, gridColW + 6);
      y += gridRowH + 4;
    }

    ensureSpace(26);
    y += 4;
    if (showUYU && uyu) {
      doc.fillColor(COLORS.muted).font("Helvetica").fontSize(8)
        .text(`${METRIC_LABEL.deuda_activa} UYU:`, PAGE.margin, y);
      doc.fillColor(COLORS.ink).font("Helvetica-Bold").fontSize(8)
        .text(fmtMoney(uyu.deudaActiva, "UYU"), PAGE.margin + 100, y);
      y += 13;
    }
    if (showUSD && usd) {
      doc.fillColor(COLORS.muted).font("Helvetica").fontSize(8)
        .text(`${METRIC_LABEL.deuda_activa} USD:`, PAGE.margin, y);
      doc.fillColor(COLORS.ink).font("Helvetica-Bold").fontSize(8)
        .text(fmtMoney(usd.deudaActiva, "USD"), PAGE.margin + 100, y);
      y += 13;
    }
    y += 8;

    // ── [9] Clientes con deuda activa ─────────────────────────────────────────
    if (model.activeDebtRows.length > 0) {
      sectionTitle("Clientes con deuda activa");

      const colW = { client: 160, cur: 36, debt: 90, overdue: 90, days: 44, status: CONTENT_W - 160 - 36 - 90 - 90 - 44 };
      const tW = CONTENT_W;
      const tRowH = 18;

      const renderTableHeader = () => {
        ensureSpace(tRowH);
        doc.fillColor(COLORS.headerBg).rect(PAGE.margin, y, tW, tRowH).fill();
        doc.fillColor(COLORS.accent).font("Helvetica-Bold").fontSize(7);
        let hx = PAGE.margin;
        const headers: [string, "left" | "right" | "center", number][] = [
          ["Cliente", "left", colW.client],
          ["Mon.", "center", colW.cur],
          [METRIC_LABEL.deuda_activa, "right", colW.debt],
          ["Deuda atrasada", "right", colW.overdue],
          ["Días atraso", "right", colW.days],
          ["Estado", "left", colW.status],
        ];
        for (const [label, align, w] of headers) {
          doc.text(label, hx + 3, y + 6, { width: w - 6, align });
          hx += w;
        }
        y += tRowH;
      };

      renderTableHeader();

      for (let i = 0; i < model.activeDebtRows.length; i++) {
        const r = model.activeDebtRows[i]!;
        ensureSpace(tRowH + 2);

        if (y === PAGE.margin) renderTableHeader();

        if (i % 2 === 1) doc.fillColor(COLORS.rowAlt).rect(PAGE.margin, y, tW, tRowH).fill();
        doc.fillColor(COLORS.ink).font("Helvetica").fontSize(7);

        let rx = PAGE.margin;
        doc.text(truncate(doc, r.name, colW.client - 6), rx + 3, y + 6, { width: colW.client - 6 });
        rx += colW.client;
        doc.fillColor(COLORS.muted).text(r.currency, rx + 3, y + 6, { width: colW.cur - 6, align: "center" });
        rx += colW.cur;
        doc.fillColor(COLORS.amberText).font("Helvetica-Bold")
          .text(fmtMoney(r.activeDebt, r.currency), rx + 3, y + 6, { width: colW.debt - 6, align: "right" });
        rx += colW.debt;
        doc.fillColor(r.overdueDebt > 0 ? COLORS.redText : COLORS.muted).font("Helvetica")
          .text(r.overdueDebt > 0 ? fmtMoney(r.overdueDebt, r.currency) : "—",
            rx + 3, y + 6, { width: colW.overdue - 6, align: "right" });
        rx += colW.overdue;
        doc.fillColor(COLORS.muted)
          .text(r.overdueDebt > 0 && r.overdueDays ? `${r.overdueDays}d` : "—",
            rx + 3, y + 6, { width: colW.days - 6, align: "right" });
        rx += colW.days;

        // CLIENT-DEBT-SEMANTICS-001 Etapa C: matcher de la nueva taxonomía.
        const statusColor =
          r.status === "Crítico" || r.status === "Riesgo alto" ? COLORS.redText
          : r.status === "Atrasado" ? COLORS.amberText
          : r.status === "Con deuda" ? COLORS.ink
          : COLORS.greenText; // "Al día" — único caso verde
        doc.fillColor(statusColor).font("Helvetica").fontSize(7)
          .text(r.status, rx + 3, y + 6, { width: colW.status - 6 });

        y += tRowH;
      }
      y += 10;
    }

    // ── [10] Movimientos recientes ────────────────────────────────────────────
    const maxMovements = 20;
    const movements = model.recentMovements.slice(0, maxMovements);

    if (movements.length > 0) {
      const totalCount = model.recentMovements.length;
      const titleSuffix = totalCount > maxMovements ? ` (últimos ${maxMovements})` : "";
      sectionTitle(`Movimientos recientes del período${titleSuffix}`);

      // Columns: date | type | clientRef (2-line) | cur | debe | haber | saldo
      // Sum: 50+50+165+28+72+72+54 = 491
      const colW = { date: 50, type: 50, clientRef: 165, cur: 28, debe: 72, haber: 72, saldo: 54 };
      const tW = CONTENT_W;
      const tRowH = 26;

      const renderMvtHeader = () => {
        ensureSpace(tRowH);
        doc.fillColor(COLORS.headerBg).rect(PAGE.margin, y, tW, tRowH).fill();
        doc.fillColor(COLORS.accent).font("Helvetica-Bold").fontSize(6.5);
        let hx = PAGE.margin;
        const hdrs: [string, "left" | "right" | "center", number][] = [
          ["Fecha", "left", colW.date],
          ["Tipo", "left", colW.type],
          ["Cliente / Comprobante", "left", colW.clientRef],
          ["Mon.", "center", colW.cur],
          ["Debe", "right", colW.debe],
          ["Haber", "right", colW.haber],
          ["Saldo pend.", "right", colW.saldo],
        ];
        for (const [label, align, w] of hdrs) {
          doc.text(label, hx + 2, y + 9, { width: w - 4, align });
          hx += w;
        }
        y += tRowH;
      };

      renderMvtHeader();

      const typeLabel = { factura: "Factura", recibo: "Recibo", nota_credito: "Nota crédito" };

      for (let i = 0; i < movements.length; i++) {
        const m = movements[i]!;
        ensureSpace(tRowH + 2);
        if (y === PAGE.margin) renderMvtHeader();

        if (i % 2 === 1) doc.fillColor(COLORS.rowAlt).rect(PAGE.margin, y, tW, tRowH).fill();

        const debe = m.type === "factura" ? fmtMoney(m.amount, m.currency as "UYU" | "USD") : "—";
        const haber = m.type !== "factura" ? fmtMoney(m.amount, m.currency as "UYU" | "USD") : "—";
        const saldo = m.type === "factura" && m.balance > 0 ? fmtMoney(m.balance, m.currency as "UYU" | "USD") : "—";

        // Single-line columns: vertically centered in 26pt row
        const rowMid = y + 9;

        let mx = PAGE.margin;
        doc.fillColor(COLORS.muted).font("Helvetica").fontSize(6.5)
          .text(fmtDate(m.date), mx + 2, rowMid, { width: colW.date - 4 });
        mx += colW.date;
        doc.fillColor(COLORS.ink)
          .text(typeLabel[m.type] ?? m.type, mx + 2, rowMid, { width: colW.type - 4 });
        mx += colW.type;

        // clientRef: client on line 1, reference on line 2
        doc.fillColor(COLORS.ink).font("Helvetica").fontSize(6.5)
          .text(truncate(doc, m.clientName, colW.clientRef - 4), mx + 2, y + 5, { width: colW.clientRef - 4 });
        if (m.reference) {
          doc.fillColor(COLORS.muted).font("Helvetica").fontSize(6)
            .text(truncate(doc, m.reference, colW.clientRef - 4), mx + 2, y + 16, { width: colW.clientRef - 4 });
        }
        mx += colW.clientRef;

        doc.fillColor(COLORS.muted).font("Helvetica").fontSize(6.5)
          .text(m.currency, mx + 2, rowMid, { width: colW.cur - 4, align: "center" });
        mx += colW.cur;
        doc.fillColor(debe === "—" ? COLORS.muted : COLORS.ink)
          .text(debe, mx + 2, rowMid, { width: colW.debe - 4, align: "right" });
        mx += colW.debe;
        doc.fillColor(haber === "—" ? COLORS.muted : COLORS.greenText)
          .text(haber, mx + 2, rowMid, { width: colW.haber - 4, align: "right" });
        mx += colW.haber;
        doc.fillColor(saldo === "—" ? COLORS.muted : COLORS.amberText)
          .text(saldo, mx + 2, rowMid, { width: colW.saldo - 4, align: "right" });

        y += tRowH;
      }
      y += 10;
    }

    // ── Final footer and close ────────────────────────────────────────────────
    renderFooter();
    doc.end();
  });
}
