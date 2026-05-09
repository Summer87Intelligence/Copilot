/**
 * Reglas de integridad y mensajes orientados al usuario humano.
 * Misma capa que debe usar importación masiva (CSV/Excel) y APIs externas.
 */

import { protoCrudResult } from "@/lib/copilot-proto-crud-types";
import {
  PROTO_TAX_TYPES,
  type ProtoCompanyInput,
  type ProtoCrudFailure,
  type ProtoInvoiceInput,
  type ProtoPaymentInput,
  type ProtoReceiptInput,
  type ProtoTaxObligationInput,
} from "@/lib/copilot-proto-crud-types";

export function str(v: unknown): string {
  return v == null ? "" : String(v).trim();
}

export function isIsoDateYmd(s: string): boolean {
  const t = s.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return false;
  const d = new Date(`${t}T12:00:00`);
  return !Number.isNaN(d.getTime());
}

/** Mensaje genérico cuando falla Supabase (sin exponer detalle técnico al usuario). */
export const MSG_DB_USER =
  "No pudimos guardar los cambios. Revisá los datos y volvé a intentar; si persiste, contactá a soporte.";

export const MSG_SUCCESS = {
  invoiceCreated: "La factura se guardó correctamente.",
  invoiceUpdated: "Los cambios en la factura se guardaron correctamente.",
  invoiceDeleted: "La factura se archivó correctamente.",
  invoiceRestored: "La factura se reactivó correctamente.",
  receiptCreated: "El recibo se registró correctamente.",
  receiptUpdated: "El recibo se actualizó correctamente.",
  receiptDeleted: "El recibo se archivó correctamente.",
  receiptRestored: "El recibo se reactivó correctamente.",
  paymentCreated: "El pago se registró correctamente.",
  paymentUpdated: "El pago se actualizó correctamente.",
  paymentDeleted: "El pago se archivó correctamente.",
  paymentRestored: "El pago se reactivó correctamente.",
  taxCreated: "La obligación fiscal se creó correctamente.",
  taxUpdated: "La obligación fiscal se actualizó correctamente.",
  taxDeleted: "La obligación fiscal se archivó correctamente.",
  taxRestored: "La obligación fiscal se reactivó correctamente.",
  companyCreated: "El cliente se guardó correctamente.",
  companyUpdated: "Los datos del cliente se actualizaron correctamente.",
  companyDeleted: "El cliente se archivó correctamente.",
  companyArchived: "El cliente se archivó correctamente.",
  companyRestored: "El cliente se reactivó correctamente.",
  documentArchived: "El documento se archivó correctamente.",
  documentRestored: "El documento se reactivó correctamente.",
} as const;

export const MSG_INTEGRITY = {
  invoiceHasReceipts:
    "No podemos borrar esta factura porque tiene recibos de cobro vinculados. Primero revisá o quitá esos recibos, o pedí una política explícita de borrado en cadena.",
  invoiceHasDocuments:
    "No podemos borrar esta factura porque tiene documentos adjuntos en el respaldo documental. Conservá la trazabilidad o eliminá primero esos enlaces.",
  receiptHasDocuments:
    "No podemos borrar este recibo porque tiene documentos vinculados. Revisá el archivo digital antes de intentar de nuevo.",
  paymentHasDocuments:
    "No podemos borrar este pago porque tiene documentos vinculados.",
  taxHasPayments:
    "No podemos borrar esta obligación porque tiene pagos fiscales registrados. Eliminá o trasladá esos pagos antes.",
  taxHasDocuments:
    "No podemos borrar esta obligación porque tiene documentos fiscales vinculados.",
  companyHasRelations:
    "No podemos eliminar el cliente mientras tenga contactos, facturas, recibos, pagos u otros registros vinculados. Revisá esas relaciones antes de borrar.",
  companyHasDocuments:
    "No podemos eliminar el cliente porque tiene documentos vinculados en el respaldo documental.",
} as const;

export const MSG_DUPLICATE_TAX = {
  create:
    "Ya existe una obligación con el mismo impuesto y período. Revisá si es un duplicado real; si debés cargarla igual, marcá la confirmación abajo.",
  update:
    "Otro registro ya usa este impuesto y período. Confirmá solo si es intencional (p. ej. corrección o escenario paralelo).",
} as const;

export const MSG_WARNING_DUPLICATE_TAX = {
  afterCreate:
    "Registramos la obligación aunque coincida con otro impuesto y período. Verificá en agenda fiscal que no dupliques salidas de caja.",
  afterUpdate:
    "Quedó alineada con otro registro del mismo impuesto y período. Revisá que la agenda y las alertas reflejen lo que querés.",
} as const;

/** Textos de capacitación (1–2 párrafos) para formularios y flujos sensibles. */
export const DATA_TRAINING = {
  invoices: {
    severity: "medium" as const,
    paragraphs: [
      "Una factura emitida aumenta la cuenta por cobrar del cliente, pero no suma dinero en caja hasta que registres un recibo de cobro. El saldo pendiente es lo que el sistema interpreta como deuda abierta.",
      "Ejemplo: si cargás una factura por $122 con IVA incluido, la caja sigue igual hasta el cobro; el motor puede usar ese monto para cartera y, más adelante, coherencia con obligaciones fiscales. Verificá que total y saldo sean consistentes.",
    ],
  },
  receipts: {
    severity: "high" as const,
    paragraphs: [
      "Un recibo representa dinero que entró: baja la deuda de la factura vinculada y mejora la caja disponible en los cálculos del Copilot. No debería superar lo que falta cobrar de esa factura.",
      "Ejemplo: si la factura tenía $10.000 pendientes y registrás un recibo por $10.000, la deuda queda en cero y la caja sube ese importe. Fecha y monto deben ser reales y comprobables.",
    ],
  },
  payments: {
    severity: "high" as const,
    paragraphs: [
      "Un pago operativo reduce caja: es una salida (proveedor, servicio, nómina, etc.). La categoría es obligatoria para que reportes, cobertura y lecturas futuras sean confiables.",
      "Un pago mal categorizado puede distorsionar gasto, fiscalidad aparente o alertas de liquidez. Usá una categoría clara aunque sea genérica (“Otros”) si aún no tenés el detalle fino.",
    ],
  },
  payments_fiscal_link: {
    severity: "high" as const,
    paragraphs: [
      "Si elegís una obligación fiscal y el pago queda en estado pagado, el Copilot marca esa obligación como pagada: deja de figurar como pendiente en agenda y no suma al egreso fiscal esperado en Finanzas.",
      "La caja baja siempre que registres un pago con monto positivo, esté o no vinculado a un impuesto. Sin vínculo, el egreso impacta tesorería pero el vencimiento fiscal puede seguir abierto hasta que lo cierres por otro medio.",
    ],
  },
  payments_auto_obligation: {
    severity: "low" as const,
    paragraphs: [
      "El sistema puede sugerir automáticamente una obligación fiscal según monto, fecha de pago y categoría (p. ej. si incluye “impuesto”). Siempre validá antes de guardar: no se confirma nada hasta que pulses Guardar.",
      "Podés cambiar o limpiar el vínculo en cualquier momento; si tocás el desplegable manualmente, dejamos de sobrescribir la sugerencia hasta que abras un alta nueva.",
    ],
  },
  tax_obligations: {
    severity: "medium" as const,
    paragraphs: [
      "Una obligación fiscal marca presión futura sobre caja en la fecha de vencimiento; no implica que ya pagaste hasta que registres un pago fiscal en la tabla correspondiente.",
      "Duplicar el mismo impuesto y período puede inflar alertas y confundir la agenda. El sistema te advertirá; confirmá solo si es deliberado. El monto estimado debe ser mayor que cero para que las proyecciones tengan sentido.",
    ],
  },
  tax_duplicate_confirm: {
    severity: "high" as const,
    paragraphs: [
      "Marcamos duplicado porque ya hay otra obligación con el mismo impuesto y etiqueta de período. Solo confirmá si es correcto (corrección, escenario paralelo o carga intencional).",
      "Semáforo: prioridad alta — revisá la agenda fiscal y las alertas después de guardar para evitar doble conteo de salidas.",
    ],
  },
  delete: {
    severity: "high" as const,
    paragraphs: [
      "Archivar no borra la fila: deja de impactar listados y cálculos activos, pero mantiene relaciones e historial. Podés reactivar el registro cuando corresponda.",
      "Facturas archivadas dejan de sumar en cartera activa; recibos archivados no cuentan para el saldo de factura hasta que los reactives.",
    ],
  },
  datosOverview: {
    severity: "low" as const,
    paragraphs: [
      "Estás viendo datos reales del prototipo: clientes, facturas, cobros, pagos y obligaciones al Estado. Lo que cargues aquí impacta lecturas de cartera, caja y fiscalidad en el resto del Copilot.",
      "Usá el botón “+ Nueva …” arriba a la derecha en Navegación de entidades para altas controladas; “Editar” y “Archivar” desde el panel lateral, o “Reactivar” si el registro está inactivo.",
    ],
  },
  companies: {
    severity: "low" as const,
    paragraphs: [
      "El cliente es el ancla de cartera: facturas, recibos y muchos pagos referencian su identificador. Un nombre claro y el riesgo bien marcado ayudan al resto del Copilot a priorizar.",
      "Ejemplo: cargás “ACME SRL” con ciudad e industria; después, al emitir facturas, elegís ese cliente en el desplegable. Si archivás un cliente, dejará de listarse como activo pero los vínculos históricos se conservan.",
    ],
  },
} as const;

export function validateCompanyIntegrity(input: ProtoCompanyInput): ProtoCrudFailure | null {
  if (!str(input.name)) {
    return protoCrudResult.fail(
      "VALIDATION",
      "Indicá el nombre o razón social del cliente para poder identificarlo en facturas y reportes."
    );
  }
  return null;
}

export function validateInvoiceIntegrity(
  input: ProtoInvoiceInput,
  options: { allowBalanceGtTotal?: boolean } = {}
): ProtoCrudFailure | null {
  if (!str(input.company_id)) {
    return protoCrudResult.fail("VALIDATION", "Elegí el cliente al que pertenece esta factura.", [
      { field: "company_id", reason: "Vacío" },
    ]);
  }
  if (!str(input.invoice_number)) {
    return protoCrudResult.fail(
      "VALIDATION",
      "Indicá un número o código de factura para identificar el comprobante."
    );
  }
  if (!isIsoDateYmd(input.issue_date)) {
    return protoCrudResult.fail(
      "VALIDATION",
      "La fecha de emisión no es válida. Usá el formato AAAA-MM-DD (ej. 2026-04-01)."
    );
  }
  if (!isIsoDateYmd(input.due_date)) {
    return protoCrudResult.fail(
      "VALIDATION",
      "La fecha de vencimiento no es válida. Usá el formato AAAA-MM-DD."
    );
  }
  if (input.total_amount < 0) {
    return protoCrudResult.fail(
      "VALIDATION",
      "El importe total no puede ser negativo. Si es una nota de crédito, modelala según tu convención contable."
    );
  }
  const bal =
    input.balance_amount !== undefined ? input.balance_amount : input.total_amount;
  if (bal < 0) {
    return protoCrudResult.fail(
      "VALIDATION",
      "El saldo no puede ser negativo: es lo que aún debe el cliente respecto de esta factura.",
      [{ field: "balance_amount", reason: "Negativo" }]
    );
  }
  if (!options.allowBalanceGtTotal && bal > input.total_amount + 1e-6) {
    return protoCrudResult.fail(
      "VALIDATION",
      "El saldo no puede ser mayor que el importe total: revisá montos para evitar inconsistencias de cartera.",
      [{ field: "balance_amount", reason: "Mayor que total" }]
    );
  }
  return null;
}

export function validateReceiptIntegrity(
  input: ProtoReceiptInput,
  options: { allowUnlinkedCompany?: boolean } = {}
): ProtoCrudFailure | null {
  if (!options.allowUnlinkedCompany && !str(input.company_id)) {
    return protoCrudResult.fail("VALIDATION", "Elegí el cliente al que pertenece este recibo.");
  }
  if (!str(input.receipt_number)) {
    return protoCrudResult.fail(
      "VALIDATION",
      "Indicá un número o referencia de recibo para poder auditarlo después."
    );
  }
  if (!isIsoDateYmd(input.receipt_date)) {
    return protoCrudResult.fail(
      "VALIDATION",
      "La fecha del recibo no es válida. Usá AAAA-MM-DD."
    );
  }
  if (input.amount <= 0) {
    return protoCrudResult.fail(
      "VALIDATION",
      "El monto del recibo debe ser mayor que cero: representa cobro real."
    );
  }
  return null;
}

/** Cobros ya imputados a la factura + nuevo importe no pueden superar el total (PR3: no implica ajuste automático de saldo). */
export function receiptExceedsInvoiceCap(
  alreadyApplied: number,
  invoiceTotal: number,
  newAmount: number
): ProtoCrudFailure | null {
  if (alreadyApplied + newAmount > invoiceTotal + 1e-6) {
    const restante = Math.max(0, invoiceTotal - alreadyApplied);
    return protoCrudResult.fail(
      "VALIDATION",
      `Este recibo superaría lo pendiente de la factura. Ya hay $${alreadyApplied.toLocaleString("es-AR", { maximumFractionDigits: 2 })} aplicados; el tope es $${invoiceTotal.toLocaleString("es-AR", { maximumFractionDigits: 2 })}. Podés cargar hasta $${restante.toLocaleString("es-AR", { maximumFractionDigits: 2 })}.`,
      [
        {
          field: "amount",
          reason: `Aplicado ${alreadyApplied}; tope ${invoiceTotal}`,
        },
      ]
    );
  }
  return null;
}

export function validateLinkedInvoiceExists(exists: boolean): ProtoCrudFailure | null {
  if (!exists) {
    return protoCrudResult.fail(
      "VALIDATION",
      "La factura seleccionada no existe o ya no está disponible. Elegí otra o dejá el recibo sin factura vinculada."
    );
  }
  return null;
}

/**
 * Aviso no bloqueante: pago operativo vs monto de referencia de la obligación (estimado o confirmado).
 */
export function operationalPaymentObligationAmountHint(
  estimated: number,
  confirmed: number | null,
  paymentAmount: number
): string | null {
  const ref =
    confirmed != null && Number.isFinite(confirmed) && confirmed > 0
      ? confirmed
      : estimated;
  if (!Number.isFinite(ref) || ref <= 0) return null;
  const diff = Math.abs(paymentAmount - ref);
  if (diff <= 0.5) return null;
  const rel = diff / ref;
  if (rel <= 0.02) return null;
  const refStr = ref.toLocaleString("es-UY", { maximumFractionDigits: 0 });
  const payStr = paymentAmount.toLocaleString("es-UY", { maximumFractionDigits: 0 });
  return `El monto del pago ($ ${payStr}) difiere del estimado/confirmado de la obligación ($ ${refStr}). Revisá si es esperable; no bloqueamos el guardado.`;
}

export function validatePaymentIntegrity(input: ProtoPaymentInput): ProtoCrudFailure | null {
  if (!str(input.company_id)) {
    return protoCrudResult.fail("VALIDATION", "Elegí el cliente asociado a este pago.");
  }
  if (!str(input.payment_number)) {
    return protoCrudResult.fail(
      "VALIDATION",
      "Indicá un identificador de pago (número de orden, transferencia o similar)."
    );
  }
  if (!str(input.payment_date) || !isIsoDateYmd(input.payment_date)) {
    return protoCrudResult.fail(
      "VALIDATION",
      "La fecha de pago es obligatoria y debe estar en formato AAAA-MM-DD."
    );
  }
  if (input.amount <= 0) {
    return protoCrudResult.fail(
      "VALIDATION",
      "El monto debe ser mayor que cero: un pago en cero no tiene efecto en caja."
    );
  }
  if (!str(input.category)) {
    return protoCrudResult.fail(
      "VALIDATION",
      "La categoría es obligatoria: ayuda a clasificar el gasto y a que los informes sean útiles.",
      [{ field: "category", reason: "Vacía" }]
    );
  }
  return null;
}

export function validateTaxObligationIntegrity(
  input: ProtoTaxObligationInput
): ProtoCrudFailure | null {
  const tt = str(input.tax_type).toLowerCase();
  if (!tt) {
    return protoCrudResult.fail("VALIDATION", "Seleccioná el tipo de impuesto (IVA, BPS, etc.).");
  }
  if (!PROTO_TAX_TYPES.includes(tt as (typeof PROTO_TAX_TYPES)[number])) {
    return protoCrudResult.fail(
      "VALIDATION",
      `El tipo de impuesto no es uno de los reconocidos: ${PROTO_TAX_TYPES.join(", ")}.`,
      [{ field: "tax_type", reason: tt }]
    );
  }
  if (!str(input.period_label)) {
    return protoCrudResult.fail(
      "VALIDATION",
      "El período es obligatorio (ej. “Marzo 2026”) para distinguir obligaciones en el tiempo."
    );
  }
  if (!str(input.due_date) || !isIsoDateYmd(input.due_date)) {
    return protoCrudResult.fail(
      "VALIDATION",
      "La fecha de vencimiento es obligatoria y debe ser AAAA-MM-DD."
    );
  }
  if (input.estimated_amount <= 0) {
    return protoCrudResult.fail(
      "VALIDATION",
      "El monto estimado debe ser mayor que cero para que alertas y cobertura de caja tengan sentido."
    );
  }
  if (
    input.confirmed_amount != null &&
    input.confirmed_amount !== undefined &&
    input.confirmed_amount < 0
  ) {
    return protoCrudResult.fail(
      "VALIDATION",
      "El monto confirmado no puede ser negativo."
    );
  }
  return null;
}

export function invoiceTotalBelowApplied(applied: number): ProtoCrudFailure {
  return protoCrudResult.fail(
    "VALIDATION",
    `No podés bajar el importe total por debajo de lo ya cobrado con recibos ($${applied.toLocaleString("es-AR", { maximumFractionDigits: 2 })}). Ajustá primero los recibos o el total.`,
    [{ field: "total_amount", reason: `Recibos: ${applied}` }]
  );
}
