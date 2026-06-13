import { describe, it, expect } from "vitest";

import { cleanCopilotDisplayText } from "@/lib/copilot-format";

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
