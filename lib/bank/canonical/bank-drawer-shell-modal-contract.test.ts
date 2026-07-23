import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * FASE BANK-SIMPLE-ASSOCIATION-PANEL-LAYOUT-FIX-001 — Escape, focus trap, portal.
 * FASE BANK-ASSOCIATION-DRAWER-SCROLL-ANCHOR-FIX-002 — scroll lock via
 * `useLockApplicationScroll` (html/body/module-scroll owner), no solo body.
 */

const shell = readFileSync(
  join(process.cwd(), "components", "copilot", "bank-movements", "bank-drawer-shell.tsx"),
  "utf8"
);

const hook = readFileSync(join(process.cwd(), "hooks", "use-lock-application-scroll.ts"), "utf8");

const moduleShell = readFileSync(join(process.cwd(), "components", "copilot", "module-shell.tsx"), "utf8");

describe("BankDrawerShell — modal real: scroll lock, Escape, focus trap, portal", () => {
  it("usa useLockApplicationScroll (no un lock ad-hoc solo de body)", () => {
    expect(shell).toContain("useLockApplicationScroll(true, panelRef)");
    expect(shell).not.toContain("previousBodyOverflow");
    expect(hook).toContain("applyDocumentLockStyles(body)");
    expect(hook).toContain("applyDocumentLockStyles(html)");
    expect(hook).toContain("applyOwnerLockStyles(owner)");
    expect(hook).toContain("state.owner.scrollTop = state.savedScrollTop");
  });

  it("el module shell expone el contrato data-copilot-module-scroll", () => {
    expect(moduleShell).toContain("data-copilot-module-scroll");
    expect(hook).toContain("[data-copilot-module-scroll]");
  });

  it("panel overflow-hidden + helpers header/body/footer", () => {
    expect(shell).toContain("overflow-hidden");
    expect(shell).toContain('data-bank-drawer-header');
    expect(shell).toContain('data-bank-drawer-body');
    expect(shell).toContain('data-bank-drawer-footer');
    expect(shell).toContain("min-h-0 flex-1 overflow-y-auto");
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

  it("drawer queda por encima de las tabs sticky (z-[80] > z-[70])", () => {
    expect(shell).toContain('zClassName = "z-[80]"');
    expect(shell).toContain("data-bank-drawer");
    expect(shell).not.toContain('zClassName = "z-[60]"');
  });

  it("offset superior solo despeja topbar global, no un hueco de tabs", () => {
    expect(shell).toContain("pt-[3.25rem]");
    expect(shell).toContain("sm:pt-[3.5rem]");
    expect(shell).not.toContain("pt-[6.5rem]");
  });

  it("el backdrop sigue cubriendo todo el viewport (el click-through de mouse ya estaba bloqueado)", () => {
    expect(shell).toContain('className="absolute inset-0 cursor-default"');
    expect(shell).toContain('aria-label="Cerrar panel"');
    expect(shell).toContain("data-bank-drawer-backdrop");
  });
});
