"use client";

/**
 * CarteraCountUp
 * --------------
 * Anima un número desde 0 (o desde un `from` explícito) hasta `value` en el
 * primer mount o cuando el valor cambia. Usa motion values para escribir
 * directamente en el DOM y no provocar re-renders por frame.
 *
 * Reglas:
 *  - Respeta `prefers-reduced-motion` (en ese caso muestra el valor final).
 *  - No anima cuando `value` no cambió respecto al render previo (idempotente).
 *  - Render-only: no calcula ni transforma datos financieros, solo formatea
 *    el número que recibe vía `format()`.
 */

import { useEffect, useRef } from "react";
import {
  animate,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
} from "framer-motion";

export type CarteraCountUpProps = {
  value: number;
  /** Función pura de formato (es-UY). Se ejecuta cada frame en motion mode. */
  format: (n: number) => string;
  /** Duración en segundos (default 0.55). */
  duration?: number;
  /** Clase opcional para el `<span>` host. */
  className?: string;
};

export function CarteraCountUp({
  value,
  format,
  duration = 0.55,
  className,
}: CarteraCountUpProps) {
  const reduce = useReducedMotion();
  const safeValue = Number.isFinite(value) ? value : 0;

  const mv = useMotionValue<number>(reduce ? safeValue : 0);
  const ref = useRef<HTMLSpanElement>(null);

  useMotionValueEvent(mv, "change", (latest) => {
    if (ref.current) ref.current.textContent = format(latest);
  });

  // Importante: NO usar un `lastValueRef` inicializado con `safeValue`. El bug
  // histórico era: arrancaba `lastValueRef.current = safeValue`, después del
  // `animate(...)` chequeaba `if (from === safeValue) controls.stop()` y
  // cortaba la animación en el frame 0; el motion value quedaba en 0 y el
  // span renderizaba `format(0)` para siempre (cards "$ 0,00" / "0,0%"
  // aunque el bucket trajera valores reales). Apoyarse SÓLO en `mv.get()`
  // es suficiente para idempotencia.
  useEffect(() => {
    if (reduce) {
      mv.set(safeValue);
      return;
    }
    if (mv.get() === safeValue) return;
    const controls = animate(mv, safeValue, {
      duration,
      ease: [0.16, 1, 0.3, 1],
    });
    return () => controls.stop();
  }, [safeValue, duration, reduce, mv]);

  return (
    <span ref={ref} className={className}>
      {format(reduce ? safeValue : mv.get())}
    </span>
  );
}
