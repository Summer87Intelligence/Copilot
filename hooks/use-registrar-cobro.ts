"use client";

import { useCallback, useState } from "react";

import {
  submitRegistrarCobro,
  type RegistrarCobroFormValues,
  type RegistrarCobroSubmitResult,
} from "@/lib/cobranza/registrar-cobro-client";

export function useRegistrarCobro() {
  const [submitting, setSubmitting] = useState(false);

  const submit = useCallback(
    async (
      values: RegistrarCobroFormValues,
      clientRequestId: string
    ): Promise<RegistrarCobroSubmitResult> => {
      setSubmitting(true);
      try {
        return await submitRegistrarCobro(values, clientRequestId);
      } finally {
        setSubmitting(false);
      }
    },
    []
  );

  return { submit, submitting };
}
