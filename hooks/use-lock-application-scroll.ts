"use client";

import { useEffect, type RefObject } from "react";

/**
 * FASE BANK-ASSOCIATION-DRAWER-SCROLL-ANCHOR-FIX-002 — bloquea el scroll de
 * fondo real mientras un drawer está abierto.
 *
 * Verificado en vivo: el scroll owner NO es `document.body` / `html`. Es el
 * contenedor del module shell (`[data-copilot-module-scroll]`,
 * `overflow-y-auto`; p. ej. scrollHeight ~4263 vs clientHeight ~848). Bloquear
 * solo `body` dejaba ese contenedor scrolleable detrás del drawer.
 *
 * - Prefiere el contrato de layout `data-copilot-module-scroll`.
 * - Fallback: primer elemento con overflow-y auto|scroll y scroll real.
 * - Guarda y restaura overflow, overscrollBehavior, touchAction y scrollTop.
 * - Intercepta wheel/touchmove fuera del panel (passive:false).
 * - Ref-count global: varios drawers no se pisan al cerrar.
 * - Solo corre en useEffect → SSR-safe.
 *
 * Nota: no aplica `touchAction: none` a `body`/`html` porque el drawer se
 * porta a `document.body` y eso rompería el scroll táctil del body del drawer.
 */

type SavedStyles = {
  overflow: string;
  overscrollBehavior: string;
  touchAction: string;
};

type LockState = {
  count: number;
  owner: HTMLElement | null;
  savedScrollTop: number;
  ownerStyles: SavedStyles;
  bodyStyles: SavedStyles;
  htmlStyles: SavedStyles;
};

const globalLock: { current: LockState | null } = { current: null };

function readStyles(el: HTMLElement): SavedStyles {
  return {
    overflow: el.style.overflow,
    overscrollBehavior: el.style.overscrollBehavior,
    touchAction: el.style.touchAction,
  };
}

function applyDocumentLockStyles(el: HTMLElement) {
  el.style.overflow = "hidden";
  el.style.overscrollBehavior = "none";
}

function applyOwnerLockStyles(el: HTMLElement) {
  el.style.overflow = "hidden";
  el.style.overscrollBehavior = "none";
  el.style.touchAction = "none";
}

function restoreStyles(el: HTMLElement, saved: SavedStyles) {
  el.style.overflow = saved.overflow;
  el.style.overscrollBehavior = saved.overscrollBehavior;
  el.style.touchAction = saved.touchAction;
}

/** Exportado para tests / Playwright: localiza el scroll owner real del app shell. */
export function findApplicationScrollOwner(
  root: ParentNode | Document | null = typeof document !== "undefined" ? document : null
): HTMLElement | null {
  if (!root || typeof document === "undefined") return null;

  const byContract = root.querySelector?.("[data-copilot-module-scroll]") as HTMLElement | null;
  if (byContract) {
    const cs = getComputedStyle(byContract);
    if (cs.overflowY === "auto" || cs.overflowY === "scroll") return byContract;
  }

  const candidates = root.querySelectorAll?.("body *") ?? [];
  for (const el of candidates) {
    if (!(el instanceof HTMLElement)) continue;
    if (el.closest("[data-bank-drawer-panel]")) continue;
    const cs = getComputedStyle(el);
    if ((cs.overflowY === "auto" || cs.overflowY === "scroll") && el.scrollHeight > el.clientHeight + 1) {
      return el;
    }
  }
  return null;
}

function acquireLock(panelRef: RefObject<HTMLElement | null>): () => void {
  if (!globalLock.current) {
    const owner = findApplicationScrollOwner();
    const body = document.body;
    const html = document.documentElement;
    globalLock.current = {
      count: 0,
      owner,
      savedScrollTop: owner?.scrollTop ?? 0,
      ownerStyles: owner ? readStyles(owner) : { overflow: "", overscrollBehavior: "", touchAction: "" },
      bodyStyles: readStyles(body),
      htmlStyles: readStyles(html),
    };
    applyDocumentLockStyles(body);
    applyDocumentLockStyles(html);
    if (owner) applyOwnerLockStyles(owner);
  }

  globalLock.current.count += 1;

  const isInsidePanel = (target: EventTarget | null) =>
    target instanceof Node && (panelRef.current?.contains(target) ?? false);

  const blockOutsideScroll = (e: Event) => {
    if (isInsidePanel(e.target)) return;
    e.preventDefault();
  };

  document.addEventListener("wheel", blockOutsideScroll, { passive: false, capture: true });
  document.addEventListener("touchmove", blockOutsideScroll, { passive: false, capture: true });

  return () => {
    document.removeEventListener("wheel", blockOutsideScroll, true);
    document.removeEventListener("touchmove", blockOutsideScroll, true);

    const state = globalLock.current;
    if (!state) return;
    state.count -= 1;
    if (state.count > 0) return;

    restoreStyles(document.body, state.bodyStyles);
    restoreStyles(document.documentElement, state.htmlStyles);
    if (state.owner) {
      restoreStyles(state.owner, state.ownerStyles);
      state.owner.scrollTop = state.savedScrollTop;
    }
    globalLock.current = null;
  };
}

export function useLockApplicationScroll(enabled: boolean, panelRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!enabled) return;
    if (typeof document === "undefined") return;
    return acquireLock(panelRef);
  }, [enabled, panelRef]);
}
