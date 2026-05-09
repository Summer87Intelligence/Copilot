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
  const lastValueRef = useRef<number>(safeValue);

  useMotionValueEvent(mv, "change", (latest) => {
    if (ref.current) ref.current.textContent = format(latest);
  });

  useEffect(() => {
    if (reduce) {
      mv.set(safeValue);
      lastValueRef.current = safeValue;
      return;
    }
    if (lastValueRef.current === safeValue && mv.get() === safeValue) {
      return;
    }
    const from = lastValueRef.current;
    const controls = animate(mv, safeValue, {
      duration,
      ease: [0.16, 1, 0.3, 1],
    });
    lastValueRef.current = safeValue;
    if (from === safeValue) controls.stop();
    return () => controls.stop();
  }, [safeValue, duration, reduce, mv]);

  return (
    <span ref={ref} className={className}>
      {format(reduce ? safeValue : mv.get())}
    </span>
  );
}
