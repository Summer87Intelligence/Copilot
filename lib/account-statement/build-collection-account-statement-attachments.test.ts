import { describe, expect, it } from "vitest";

import {
  buildAccountStatementDownloadFilename,
  buildAccountStatementPdfUrl,
  buildCollectionAccountStatementAttachments,
  collectionAttachmentChannelHint,
} from "./build-collection-account-statement-attachments";

const BASE = {
  companyId: "6e50f5e7-161a-48c2-af38-be209ab6f330",
  clientName: "DOBSURA CORPORATION SA",
  fileDate: "2026-06-05",
  from: "2026-01-01",
  to: "2026-06-05",
};

describe("buildCollectionAccountStatementAttachments", () => {
  it("cliente con deuda solo UYU genera 1 PDF UYU", () => {
    const attachments = buildCollectionAccountStatementAttachments({
      ...BASE,
      debtUyu: 1000,
      debtUsd: 0,
    });
    expect(attachments).toHaveLength(1);
    expect(attachments[0]?.currency).toBe("UYU");
    expect(attachments[0]?.label).toBe("Estado de cuenta UYU");
    expect(attachments[0]?.pdfUrl).toContain("currency=UYU");
  });

  it("cliente con deuda solo USD genera 1 PDF USD", () => {
    const attachments = buildCollectionAccountStatementAttachments({
      ...BASE,
      debtUyu: 0,
      debtUsd: 530.7,
    });
    expect(attachments).toHaveLength(1);
    expect(attachments[0]?.currency).toBe("USD");
    expect(attachments[0]?.pdfUrl).toContain("currency=USD");
  });

  it("cliente con deuda UYU + USD genera 2 PDFs", () => {
    const attachments = buildCollectionAccountStatementAttachments({
      ...BASE,
      debtUyu: 1000,
      debtUsd: 530.7,
    });
    expect(attachments.map((a) => a.currency)).toEqual(["UYU", "USD"]);
  });

  it("cliente sin deuda no genera adjuntos", () => {
    expect(
      buildCollectionAccountStatementAttachments({
        ...BASE,
        debtUyu: 0,
        debtUsd: 0,
      })
    ).toEqual([]);
  });

  it("el PDF respeta moneda en la URL", () => {
    const url = buildAccountStatementPdfUrl(BASE.companyId, "USD", BASE.from, BASE.to);
    expect(url).toContain(
      `/api/copilot/clientes/${encodeURIComponent(BASE.companyId)}/account-statement.pdf?`
    );
    expect(url).toContain("currency=USD");
    expect(url).toContain("from=2026-01-01");
    expect(url).toContain("to=2026-06-05");
  });

  it("nombre de archivo incluye cliente, moneda y fecha", () => {
    expect(
      buildAccountStatementDownloadFilename("DOBSURA CORPORATION SA", "USD", "2026-06-05")
    ).toBe("estado-cuenta-dobsura-corporation-sa-usd-2026-06-05.pdf");
  });
});

describe("collectionAttachmentChannelHint", () => {
  it("WhatsApp muestra instrucción de adjuntar manualmente", () => {
    expect(collectionAttachmentChannelHint("whatsapp")).toContain("WhatsApp");
    expect(collectionAttachmentChannelHint("whatsapp")).toContain("adjuntalo manualmente");
  });

  it("Email con mailto muestra instrucción de adjuntar manualmente", () => {
    expect(collectionAttachmentChannelHint("email")).toContain("email");
    expect(collectionAttachmentChannelHint("email")).toContain("adjuntalo antes de enviar");
  });
});
