import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * FASE BANK-SIMPLE-ASSOCIATION-PANEL-LAYOUT-FIX-001 — bug reproducido en
 * vivo: el body seguía scrolleando detrás del drawer (doble scroll real,
 * `document.body` overflow nunca se bloqueaba), Escape no cerraba, el foco
 * podía escaparse por Tab hacia el contenido de fondo, y al cerrar no
 * volvía al elemento que abrió el panel. El click-through de mouse ya
 * estaba bloqueado (el backdrop cubre todo el viewport) — confirmado en
 * vivo antes de tocar nada, para no "arreglar" algo que no estaba roto.
 */

const shell = readFileSync(
  join(process.cwd(), "components", "copilot", "bank-movements", "bank-drawer-shell.tsx"),
  "utf8"
);

describe("BankDrawerShell — modal real: scroll lock, Escape, focus trap, portal", () => {
  it("bloquea el scroll del body mientras está montado y lo restaura al desmontar", () => {
    expect(shell).toContain('document.body.style.overflow = "hidden"');
    expect(shell).toContain("document.body.style.overflow = previousBodyOverflow");
  });

  it("Escape cierra el panel (llama onBackdropClick)", () => {
    expect(shell).toMatch(/e\.key === "Escape"[\s\S]{0,80}onBackdropClick\?\.\(\)/);
  });

  it("hace focus trap: Tab/Shift+Tab nunca salen del drawer", () => {
    expect(shell).toContain('e.key !== "Tab"');
    expect(shell).toContain("focusables[0]");
    expect(shell).toContain("focusables[focusables.length - 1]");
  });

  it("mueve el foco adentro del drawer al abrir y lo restaura al cerrar", () => {
    expect(shell).toContain("previouslyFocusedRef.current = document.activeElement");
    expect(shell).toContain("focusFirst()");
    expect(shell).toContain("previouslyFocusedRef.current?.focus?.()");
  });

  it("se monta con un Portal a document.body (blindado contra transform de ancestros)", () => {
    expect(shell).toContain('from "react-dom"');
    expect(shell).toContain("createPortal(content, document.body)");
  });

  it("mantiene el offset ya verificado en vivo (franja de fecha + tabs sticky)", () => {
    expect(shell).toContain("pt-[6.5rem]");
  });

  it("el backdrop sigue cubriendo todo el viewport (el click-through de mouse ya estaba bloqueado)", () => {
    expect(shell).toContain('className="absolute inset-0 cursor-default"');
    expect(shell).toContain('aria-label="Cerrar panel"');
  });
});
