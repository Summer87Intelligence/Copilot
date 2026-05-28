/** Microcopy de cobranza visible al usuario (sin lógica de negocio). */

export const COLLECTION_UX = {
  noAutoSend:
    "No se envía automáticamente: vos revisás el mensaje y lo enviás desde tu email o WhatsApp.",
  registerDoesNotPay:
    "Registrar gestión no marca facturas como pagadas.",
  promiseNotPayment:
    "Una promesa de pago no es un pago confirmado.",
} as const;
