// eslint-disable-next-line @typescript-eslint/no-require-imports
const PDFDocument = require("pdfkit/js/pdfkit.standalone.js") as new (
  opts?: PDFKit.PDFDocumentOptions
) => PDFKit.PDFDocument;

import type { ExecutiveMonthlyReportModel } from "./build-executive-monthly-report-model";

const COLORS = {
  ink: "#1a1a1a",
  muted: "#6b7280",
  accent: "#1a5fa8",
  border: "#d1d5db",
  rowAlt: "#f8fafc",
  headerBg: "#e8f0f8",
  sectionBg: "#f1f5f9",
  riskAlto: "#be123c",
  riskMedio: "#b45309",
  riskBajo: "#15803d",
  criticalBg: "#fff1f2",
  atencionBg: "#fffbeb",
};

const PAGE = { margin: 48, width: 595, height: 842 };
const FOOTER_RESERVE = 48;
const MAX_Y = PAGE.height - PAGE.margin - FOOTER_RESERVE;
const CONTENT_W = PAGE.width - PAGE.margin * 2; // 499

function formatMoney(amount: number, currency: "UYU" | "USD"): string {
  if (currency === "USD") {
    const n = amount.toLocaleString("es-UY", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    return `U$S ${n}`;
  }
  const n = Math.round(amount).toLocaleString("es-UY", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
  return `$ ${n}`;
}

function formatPercent(n: number): string {
  return `${n.toFixed(1)}%`;
}

function riskColor(risk: string): string {
  if (risk === "Alto") return COLORS.riskAlto;
  if (risk === "Medio") return COLORS.riskMedio;
  return COLORS.riskBajo;
}

function riskLevelColor(level: string): string {
  if (level === "Crítico") return COLORS.riskAlto;
  if (level === "Atención") return COLORS.riskMedio;
  return COLORS.riskBajo;
}

function truncate(doc: PDFKit.PDFDocument, text: string, width: number): string {
  if (doc.widthOfString(text) <= width) return text;
  let t = text;
  while (t.length > 1 && doc.widthOfString(`${t}…`) > width) {
    t = t.slice(0, -1);
  }
  return `${t}…`;
}

export type RenderExecutiveMonthlyReportPdfOptions = {
  model: ExecutiveMonthlyReportModel;
};

export function renderExecutiveMonthlyReportPdf(
  options: RenderExecutiveMonthlyReportPdfOptions
): Promise<Buffer> {
  const { model } = options;

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margin: PAGE.margin,
      bufferPages: true,
    });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    let y = PAGE.margin;
    let pageNum = 1;

    const renderFooter = () => {
      const fy = PAGE.height - PAGE.margin - 28;
      doc
        .strokeColor(COLORS.border)
        .lineWidth(0.35)
        .moveTo(PAGE.margin, fy - 6)
        .lineTo(PAGE.margin + CONTENT_W, fy - 6)
        .stroke();
      doc
        .fillColor(COLORS.muted)
        .font("Helvetica")
        .fontSize(7)
        .text(`Página ${pageNum}`, PAGE.margin, fy, { width: CONTENT_W, align: "right" });
      doc.text(
        "Documento informativo generado por Summer87 Copilot",
        PAGE.margin,
        fy + 11,
        { width: CONTENT_W, align: "center" }
      );
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
      ensureSpace(32);
      doc.fillColor(COLORS.accent).font("Helvetica-Bold").fontSize(9).text(title, PAGE.margin, y);
      y += 5;
      doc
        .strokeColor(COLORS.accent)
        .lineWidth(0.5)
        .moveTo(PAGE.margin, y)
        .lineTo(PAGE.margin + CONTENT_W, y)
        .stroke();
      y += 8;
    };

    // ── TITLE ──────────────────────────────────────────────
    doc
      .fillColor(COLORS.accent)
      .font("Helvetica-Bold")
      .fontSize(17)
      .text("Reporte Ejecutivo Mensual", PAGE.margin, y);
    y += 26;

    doc
      .fillColor(COLORS.ink)
      .font("Helvetica-Bold")
      .fontSize(10)
      .text(`${model.currency} — ${model.period.label}`, PAGE.margin, y);
    y += 16;

    const emitDate = new Date(model.generatedAt).toLocaleDateString("es-UY", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
    doc.fillColor(COLORS.muted).font("Helvetica").fontSize(8.5);
    doc.text(`Emisión: ${emitDate}`, PAGE.margin, y);
    y += 12;
    if (model.issuerName) {
      doc.text(`Empresa: ${model.issuerName}`, PAGE.margin, y);
      y += 12;
    }
    y += 6;

    // ── RISK BANNER ────────────────────────────────────────
    const riskBannerBg =
      model.riskLevel === "Crítico"
        ? COLORS.criticalBg
        : model.riskLevel === "Atención"
        ? COLORS.atencionBg
        : COLORS.sectionBg;
    const bannerH = 30;
    doc.fillColor(riskBannerBg).rect(PAGE.margin, y, CONTENT_W, bannerH).fill();
    doc
      .fillColor(riskLevelColor(model.riskLevel))
      .font("Helvetica-Bold")
      .fontSize(9)
      .text(`Nivel de riesgo: ${model.riskLevel}`, PAGE.margin + 10, y + 10, {
        width: CONTENT_W - 20,
      });
    y += bannerH + 12;

    // ── KEY METRICS GRID (2 columns) ──────────────────────
    sectionTitle("Indicadores clave del período");

    const metrics = [
      { label: "Ventas", value: formatMoney(model.keyMetrics.netSales, model.currency) },
      { label: "Saldo de caja", value: formatMoney(model.keyMetrics.cashClosingBalance, model.currency) },
      {
        label: "Variación de caja",
        value: formatMoney(
          model.keyMetrics.cashIncome - model.keyMetrics.cashExpense,
          model.currency
        ),
      },
      { label: "Deuda actual", value: formatMoney(model.keyMetrics.totalDebt, model.currency) },
      { label: "Deuda vencida", value: formatMoney(model.keyMetrics.overdueDebt, model.currency) },
      { label: "Clientes activos", value: String(model.keyMetrics.activeClients) },
    ];

    const cellW = Math.floor(CONTENT_W / 2) - 4;
    const cellH = 28;

    for (let i = 0; i < metrics.length; i += 2) {
      ensureSpace(cellH + 4);
      const left = metrics[i]!;
      const right = metrics[i + 1];

      const renderMetricCell = (
        m: { label: string; value: string },
        xOffset: number
      ) => {
        const cx = PAGE.margin + xOffset;
        doc.fillColor(COLORS.sectionBg).rect(cx, y, cellW, cellH).fill();
        doc
          .fillColor(COLORS.muted)
          .font("Helvetica")
          .fontSize(7)
          .text(m.label, cx + 6, y + 5, { width: cellW - 12 });
        doc
          .fillColor(COLORS.ink)
          .font("Helvetica-Bold")
          .fontSize(9)
          .text(m.value, cx + 6, y + 14, { width: cellW - 12 });
      };

      renderMetricCell(left, 0);
      if (right) renderMetricCell(right, cellW + 8);

      y += cellH + 4;
    }
    y += 8;

    // ── ALERTS ────────────────────────────────────────────
    if (model.alerts.length > 0) {
      ensureSpace(14 + model.alerts.length * 13);
      sectionTitle("Alertas");
      doc.fillColor(COLORS.ink).font("Helvetica").fontSize(8.5);
      for (const alert of model.alerts) {
        doc.text(`• ${alert}`, PAGE.margin + 6, y);
        y += 13;
      }
      y += 6;
    }

    // ── TOP 5 CLIENTES ────────────────────────────────────
    if (model.top5Clients.length > 0) {
      ensureSpace(30 + model.top5Clients.length * 20 + 30);
      sectionTitle("Top 5 clientes por facturación");

      const colW = { rank: 25, client: 240, sales: 150, share: 84 };
      const tW = colW.rank + colW.client + colW.sales + colW.share;
      const rowH = 20;

      doc.fillColor(COLORS.headerBg).rect(PAGE.margin, y, tW, rowH).fill();
      doc.fillColor(COLORS.accent).font("Helvetica-Bold").fontSize(7.5);
      let cx = PAGE.margin;
      const topH: Array<[string, "left" | "right" | "center", number]> = [
        ["#", "center", colW.rank],
        ["Cliente", "left", colW.client],
        ["Facturación", "right", colW.sales],
        ["Part.%", "right", colW.share],
      ];
      for (const [label, align, w] of topH) {
        doc.text(label, cx + 4, y + 6, { width: w - 8, align });
        cx += w;
      }
      y += rowH + 2;

      for (let i = 0; i < model.top5Clients.length; i++) {
        const r = model.top5Clients[i]!;
        if (i % 2 === 1) doc.fillColor(COLORS.rowAlt).rect(PAGE.margin, y, tW, rowH).fill();
        doc.fillColor(COLORS.ink).font("Helvetica").fontSize(7.5);
        cx = PAGE.margin;
        doc.text(String(r.rank), cx + 4, y + 6, { width: colW.rank - 8, align: "center" });
        cx += colW.rank;
        doc.text(truncate(doc, r.clientName, colW.client - 8), cx + 4, y + 6, { width: colW.client - 8 });
        cx += colW.client;
        doc.text(formatMoney(r.netSales, model.currency), cx + 4, y + 6, { width: colW.sales - 8, align: "right" });
        cx += colW.sales;
        doc.text(formatPercent(r.sharePercent), cx + 4, y + 6, { width: colW.share - 8, align: "right" });
        doc
          .strokeColor(COLORS.border)
          .lineWidth(0.25)
          .moveTo(PAGE.margin, y + rowH)
          .lineTo(PAGE.margin + tW, y + rowH)
          .stroke();
        y += rowH;
      }
      y += 12;
    }

    // ── TOP 5 DEUDORES ────────────────────────────────────
    if (model.top5Debtors.length > 0) {
      ensureSpace(30 + model.top5Debtors.length * 20 + 30);
      sectionTitle("Top 5 deudores");

      const colW = { rank: 25, client: 180, debt: 110, overdue: 110, risk: 74 };
      const tW = colW.rank + colW.client + colW.debt + colW.overdue + colW.risk;
      const rowH = 20;

      doc.fillColor(COLORS.headerBg).rect(PAGE.margin, y, tW, rowH).fill();
      doc.fillColor(COLORS.accent).font("Helvetica-Bold").fontSize(7.5);
      let cx = PAGE.margin;
      const dH: Array<[string, "left" | "right" | "center", number]> = [
        ["#", "center", colW.rank],
        ["Cliente", "left", colW.client],
        ["Deuda actual", "right", colW.debt],
        ["Deuda vencida", "right", colW.overdue],
        ["Riesgo", "center", colW.risk],
      ];
      for (const [label, align, w] of dH) {
        doc.text(label, cx + 4, y + 6, { width: w - 8, align });
        cx += w;
      }
      y += rowH + 2;

      for (let i = 0; i < model.top5Debtors.length; i++) {
        const r = model.top5Debtors[i]!;
        if (i % 2 === 1) doc.fillColor(COLORS.rowAlt).rect(PAGE.margin, y, tW, rowH).fill();
        doc.fillColor(COLORS.ink).font("Helvetica").fontSize(7.5);
        cx = PAGE.margin;
        doc.text(String(r.rank), cx + 4, y + 6, { width: colW.rank - 8, align: "center" });
        cx += colW.rank;
        doc.text(truncate(doc, r.clientName, colW.client - 8), cx + 4, y + 6, { width: colW.client - 8 });
        cx += colW.client;
        doc.text(formatMoney(r.debtAmount, model.currency), cx + 4, y + 6, { width: colW.debt - 8, align: "right" });
        cx += colW.debt;
        doc.text(
          r.overdueAmount > 0 ? formatMoney(r.overdueAmount, model.currency) : "—",
          cx + 4,
          y + 6,
          { width: colW.overdue - 8, align: "right" }
        );
        cx += colW.overdue;
        doc.fillColor(riskColor(r.risk));
        doc.text(r.risk, cx + 4, y + 6, { width: colW.risk - 8, align: "center" });
        doc.fillColor(COLORS.ink);
        doc
          .strokeColor(COLORS.border)
          .lineWidth(0.25)
          .moveTo(PAGE.margin, y + rowH)
          .lineTo(PAGE.margin + tW, y + rowH)
          .stroke();
        y += rowH;
      }
      y += 12;
    }

    // ── CAJA ──────────────────────────────────────────────
    ensureSpace(60);
    sectionTitle("Caja del período");
    const cajaLines = [
      `Saldo inicial: ${formatMoney(model.keyMetrics.cashOpeningBalance, model.currency)}`,
      `Ingresos del período: ${formatMoney(model.keyMetrics.cashIncome, model.currency)}`,
      `Egresos del período: ${formatMoney(model.keyMetrics.cashExpense, model.currency)}`,
      `Saldo final: ${formatMoney(model.keyMetrics.cashClosingBalance, model.currency)}`,
    ];
    doc.fillColor(COLORS.ink).font("Helvetica").fontSize(8.5);
    for (const line of cajaLines) {
      doc.text(line, PAGE.margin + 6, y);
      y += 13;
    }

    renderFooter();
    doc.end();
  });
}
