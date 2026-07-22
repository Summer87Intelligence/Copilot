"use client";

import { Component, type ReactNode } from "react";

import { copilotCaptionClass } from "@/components/copilot/ui/copilot-visual-system";

type Props = {
  children: ReactNode;
  /** Se llama cuando se atrapa un error — útil para cerrar drawers/estado asociado. */
  onError?: () => void;
  /** Mensaje mostrado en el estado controlado. Default genérico en español. */
  fallbackMessage?: string;
};

type State = { hasError: boolean };

/**
 * FASE BANK-RECEIPT-SEARCH-PAGE-CRASH-001 — un error inesperado al renderizar
 * evidencia de conciliación (p. ej. un shape de datos no contemplado) nunca
 * debe tirar abajo toda la página. Este boundary local atrapa la excepción y
 * muestra un mensaje controlado en su lugar, dejando el resto de la app intacta.
 */
export class InlineErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch() {
    this.props.onError?.();
  }

  render() {
    if (this.state.hasError) {
      return (
        <p className={`${copilotCaptionClass} px-3 py-2 text-[var(--copilot-danger-text-strong)]`}>
          {this.props.fallbackMessage ?? "No se pudo mostrar esta sección. Cerrá y volvé a intentar."}
        </p>
      );
    }
    return this.props.children;
  }
}
