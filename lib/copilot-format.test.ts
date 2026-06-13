import { describe, it, expect } from "vitest";

import { cleanCopilotDisplayText, formatMissingValue } from "@/lib/copilot-format";

describe("cleanCopilotDisplayText", () => {
  it("retorna null para entrada vacía", () => {
    expect(cleanCopilotDisplayText(null)).toBeNull();
    expect(cleanCopilotDisplayText(undefined)).toBeNull();
    expect(cleanCopilotDisplayText("")).toBeNull();
  });

  it("elimina secuencias de '?' de 3 o más", () => {
    expect(cleanCopilotDisplayText("Transf Bria ???? · Caja Principal")).toBe(
      "Transf Bria · Caja Principal"
    );
    expect(cleanCopilotDisplayText("Hola??? mundo")).toBe("Hola mundo");
  });

  it("preserva '?' simples y dobles (signos válidos)", () => {
    expect(cleanCopilotDisplayText("¿Quién?")).toBe("¿Quién?");
    expect(cleanCopilotDisplayText("Si?? sí")).toBe("Si?? sí");
  });

  it("reemplaza caracteres Unicode rotos", () => {
    expect(cleanCopilotDisplayText("Caja� Principal")).toBe("Caja Principal");
  });

  it("colapsa espacios sobrantes", () => {
    expect(cleanCopilotDisplayText("Caja   Principal")).toBe("Caja Principal");
  });

  it("limpia bordes con separadores '·'", () => {
    expect(cleanCopilotDisplayText("· Caja Principal ·")).toBe(
      "Caja Principal"
    );
    expect(cleanCopilotDisplayText(" · ·  Texto ·")).toBe("Texto");
  });

  it("devuelve null si queda vacío tras limpiar", () => {
    expect(cleanCopilotDisplayText("????")).toBeNull();
    expect(cleanCopilotDisplayText("���")).toBeNull();
  });

  it("revierte secuencias mojibake comunes (latin1→utf8 doble-encoding)", () => {
    expect(cleanCopilotDisplayText("CafÃ©")).toBe("Café");
    expect(cleanCopilotDisplayText("SeÃ±or")).toBe("Señor");
    expect(cleanCopilotDisplayText("Â¿Cómo?")).toBe("¿Cómo?");
  });
});

describe("formatMissingValue", () => {
  it("convierte null/undefined/string vacío en em dash", () => {
    expect(formatMissingValue(null)).toBe("—");
    expect(formatMissingValue(undefined)).toBe("—");
    expect(formatMissingValue("")).toBe("—");
  });

  it("convierte '?' o secuencias de '?' en em dash", () => {
    expect(formatMissingValue("?")).toBe("—");
    expect(formatMissingValue("????")).toBe("—");
  });

  it("convierte 'undefined', 'null', 'NaN' string en em dash", () => {
    expect(formatMissingValue("undefined")).toBe("—");
    expect(formatMissingValue("null")).toBe("—");
    expect(formatMissingValue("NaN")).toBe("—");
  });

  it("convierte números no finitos en em dash", () => {
    expect(formatMissingValue(NaN)).toBe("—");
    expect(formatMissingValue(Infinity)).toBe("—");
  });

  it("formatea números finitos con locale es-AR", () => {
    expect(formatMissingValue(1234)).toBe("1.234");
    expect(formatMissingValue(0)).toBe("0");
  });

  it("preserva strings con dato real", () => {
    expect(formatMissingValue("Dato real")).toBe("Dato real");
    expect(formatMissingValue("  texto  ")).toBe("texto");
  });

  it("formatea booleanos como Sí/No", () => {
    expect(formatMissingValue(true)).toBe("Sí");
    expect(formatMissingValue(false)).toBe("No");
  });
});
