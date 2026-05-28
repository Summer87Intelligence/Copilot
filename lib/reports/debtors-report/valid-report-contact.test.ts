import { describe, expect, it } from "vitest";

import {
  buildReportContactLabel,
  isValidReportEmail,
  isValidWhatsAppPhone,
} from "./valid-report-contact";

describe("valid-report-contact", () => {
  it('teléfono "22" no es WhatsApp', () => {
    expect(isValidWhatsAppPhone("22")).toBe(false);
  });

  it('teléfono "2222222" no es WhatsApp', () => {
    expect(isValidWhatsAppPhone("2222222")).toBe(false);
  });

  it('celular "099123456" sí es WhatsApp', () => {
    expect(isValidWhatsAppPhone("099123456")).toBe(true);
  });

  it('"59899123456" sí es WhatsApp', () => {
    expect(isValidWhatsAppPhone("59899123456")).toBe(true);
  });

  it("email válido muestra Email", () => {
    expect(isValidReportEmail("cliente@empresa.com.uy")).toBe(true);
    expect(buildReportContactLabel({ email: "cliente@empresa.com.uy" })).toBe("Email");
  });

  it("email inválido no muestra Email", () => {
    expect(isValidReportEmail("sin email")).toBe(false);
    expect(isValidReportEmail("-")).toBe(false);
    expect(buildReportContactLabel({ email: "not-an-email" })).toBe("Sin contacto");
  });

  it("WhatsApp + email muestra WhatsApp / Email", () => {
    expect(
      buildReportContactLabel({
        phone: "099123456",
        email: "a@test.com",
      })
    ).toBe("WhatsApp / Email");
  });

  it("sin válidos muestra Sin contacto", () => {
    expect(
      buildReportContactLabel({
        phone: "22",
        email: "invalid",
      })
    ).toBe("Sin contacto");
  });
});
