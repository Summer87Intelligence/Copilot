import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getCurrentMonthToTodayRange,
  getCurrentQuarterToTodayRange,
  getPreviousMonthRange,
} from "@/lib/copilot-date-range-defaults";
import { todayYmdMontevideo } from "@/lib/date/summer87-today";

/**
 * Regresión del hydration mismatch React #418 en /copilot/cartera.
 *
 * La causa raíz era calcular "hoy" con `new Date()` en la zona del runtime:
 * el SSR de Vercel (UTC) y el navegador (America/Montevideo, UTC−3) producían
 * un `to` distinto en la franja nocturna de Uruguay, generando texto divergente
 * entre servidor y cliente. Estos tests fijan un instante absoluto dentro de esa
 * franja y verifican que el rango se calcula contra la fecha de Montevideo
 * (idempotente SSR/cliente), no contra la fecha UTC del runtime.
 */

// 2026-07-15T02:18:00Z === 2026-07-14 23:18 en Montevideo (UTC−3).
// Fecha UTC del runtime: 15-jul · Fecha de negocio (Montevideo): 14-jul.
const LATE_NIGHT_UY_INSTANT = new Date("2026-07-15T02:18:00.000Z");

afterEach(() => {
  vi.useRealTimers();
});

describe("copilot-date-range-defaults · determinismo SSR/cliente por zona horaria", () => {
  it("current-month usa la fecha de Montevideo, no la UTC del runtime", () => {
    vi.useFakeTimers();
    vi.setSystemTime(LATE_NIGHT_UY_INSTANT);

    const range = getCurrentMonthToTodayRange();

    // No debe filtrarse el 15 (UTC); el "hoy" de negocio es el 14 (Montevideo).
    expect(range.to).toBe("2026-07-14");
    expect(range.from).toBe("2026-07-01");
  });

  it("`to` coincide con la fuente canónica idempotente todayYmdMontevideo()", () => {
    expect(getCurrentMonthToTodayRange().to).toBe(todayYmdMontevideo());
  });

  it("quarter arranca en el primer día del trimestre de Montevideo", () => {
    vi.useFakeTimers();
    vi.setSystemTime(LATE_NIGHT_UY_INSTANT);

    const range = getCurrentQuarterToTodayRange();

    expect(range.from).toBe("2026-07-01"); // Q3 (jul–sep)
    expect(range.to).toBe("2026-07-14");
  });

  it("previous-month toma el mes calendario anterior de Montevideo", () => {
    vi.useFakeTimers();
    vi.setSystemTime(LATE_NIGHT_UY_INSTANT);

    const range = getPreviousMonthRange();

    expect(range.from).toBe("2026-06-01");
    expect(range.to).toBe("2026-06-30");
  });

  it("current-month respeta el cruce de año en Montevideo (medianoche UTC del 01-ene)", () => {
    vi.useFakeTimers();
    // 2026-01-01T00:00:00Z === 2025-12-31 21:00 en Montevideo.
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));

    const range = getCurrentMonthToTodayRange();

    expect(range.to).toBe("2025-12-31");
    expect(range.from).toBe("2025-12-01");
  });
});
