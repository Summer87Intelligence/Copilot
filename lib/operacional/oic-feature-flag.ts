// Feature flag para el Operational Intelligence Center.
// Gating centralizado: un solo punto de verdad para habilitar/deshabilitar el módulo.

export function isOicEnabled(): boolean {
  return process.env.FEATURE_OIC === "true";
}

// Uso en layout.tsx o page.tsx:
//   if (!isOicEnabled()) notFound();
