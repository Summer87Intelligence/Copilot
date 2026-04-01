/**
 * Mapa documental / operativo del prototipo Copilot (solo referencia de producto, sin persistencia).
 */

export type DocumentInventoryRow = {
  tipo: string;
  tabla: string;
  queRegistra: string;
  ejemploUso: string;
  estado: "Activo";
};

export type RegistrationRuleExample = {
  titulo: string;
  cuerpo: string;
  destacado?: boolean;
};

export type RoadmapDocumentRow = {
  documento: string;
  tablaSugerida: string;
  prioridad: "Alta" | "Media" | "Baja";
  proposito: string;
  valorAdmin: string;
  valorCliente: string;
  valorContadora: string;
};

export type RelationshipGroup = {
  titulo: string;
  descripcion: string;
  enlaces: string[];
};

/** Relaciones lógicas entre tablas activas (modelo mental, no DDL). */
export const TABLE_RELATIONSHIPS: RelationshipGroup[] = [
  {
    titulo: "Comercial y cobranza",
    descripcion: "El cliente facturable y lo que emite o cobra.",
    enlaces: [
      "proto_companies → muchas proto_contacts (personas vinculadas a la empresa).",
      "proto_companies → muchas proto_invoices (facturas de venta por cliente).",
      "proto_invoices → muchas proto_receipts (cobros aplicados; suele usarse invoice_id).",
      "proto_companies → muchas proto_receipts (cobros también anclados a empresa).",
    ],
  },
  {
    titulo: "Tesorería operativa",
    descripcion: "Salidas distintas del impuesto.",
    enlaces: [
      "proto_companies → proto_payments cuando el pago lleva company_id (gasto/proveedor vinculado).",
      "proto_payments alimentan caja y egresos esperados en el motor financiero.",
    ],
  },
  {
    titulo: "Fiscal",
    descripcion: "Calendario tributario y liquidaciones.",
    enlaces: [
      "proto_tax_obligations → muchas proto_tax_payments (pagos que saldan o abonan obligaciones).",
      "Cada obligación (IVA, BPS, etc.) es una fila; cada pago al organismo es otra fila enlazada.",
    ],
  },
  {
    titulo: "Respaldo documental",
    descripcion: "Archivos y metadatos ligados a casos concretos.",
    enlaces: [
      "proto_documents enlaza por related_table + related_id a facturas, recibos, obligaciones, pagos fiscales, empresas o acciones.",
    ],
  },
];

export const DOCUMENT_INVENTORY: DocumentInventoryRow[] = [
  {
    tipo: "Empresas (clientes / proveedores)",
    tabla: "proto_companies",
    queRegistra:
      "Ficha de cada organización con la que operás: nombre, rubro u otros datos maestros.",
    ejemploUso:
      "Alta de “Distribuidora Sur” como cliente; todas sus facturas apuntan a su id.",
    estado: "Activo",
  },
  {
    tipo: "Contactos",
    tabla: "proto_contacts",
    queRegistra:
      "Personas o roles asociados a una empresa (nombre, email, cargo donde exista).",
    ejemploUso:
      "Guardar el contacto de cobranzas de un cliente para mostrarlo en el drawer de cartera.",
    estado: "Activo",
  },
  {
    tipo: "Facturas de venta",
    tabla: "proto_invoices",
    queRegistra:
      "Comprobantes emitidos: montos, saldo pendiente, vencimiento, estado y probabilidad de cobro si aplica.",
    ejemploUso:
      "Tres facturas emitidas en el mes → tres filas, cada una con su due_date y balance_amount.",
    estado: "Activo",
  },
  {
    tipo: "Recibos de cobro",
    tabla: "proto_receipts",
    queRegistra:
      "Ingresos de tesorería cobrados, monto, fecha y vínculo a empresa y suele a factura.",
    ejemploUso:
      "El cliente paga una factura: una fila en proto_receipts con amount y receipt_date.",
    estado: "Activo",
  },
  {
    tipo: "Pagos operativos",
    tabla: "proto_payments",
    queRegistra:
      "Egresos operativos (proveedores, gastos) con fecha de pago y monto.",
    ejemploUso:
      "Pago de alquiler o proveedor: una fila con payment_date futura o pasada según el caso.",
    estado: "Activo",
  },
  {
    tipo: "Documentos de respaldo",
    tabla: "proto_documents",
    queRegistra:
      "Metadatos de archivos (tipo, nombre, URL, referencia, fecha, estado) vinculados a otra fila del sistema.",
    ejemploUso:
      "Adjuntar el PDF de una factura: una fila con related_table = proto_invoices y related_id = id de la factura.",
    estado: "Activo",
  },
  {
    tipo: "Obligaciones fiscales",
    tabla: "proto_tax_obligations",
    queRegistra:
      "Impuesto, período, vencimiento, monto estimado y estado de cada obligación.",
    ejemploUso:
      "Obligación de IVA de marzo → una fila con due_date y tax_type; aparece en Finanzas y alertas.",
    estado: "Activo",
  },
  {
    tipo: "Pagos de impuestos",
    tabla: "proto_tax_payments",
    queRegistra:
      "Pagos efectuados a organismos, monto, estado y enlace a la obligación.",
    ejemploUso:
      "Un pago de BPS contra una obligación abierta → una fila en proto_tax_payments.",
    estado: "Activo",
  },
];

/** Reglas canónicas primero (destacado), luego contexto adicional. */
export const REGISTRATION_RULES: RegistrationRuleExample[] = [
  {
    titulo: "Facturas (regla 1:1)",
    cuerpo:
      "Si en la operación existen tres facturas, deben existir tres filas en proto_invoices (una por comprobante, con sus montos y vencimientos).",
    destacado: true,
  },
  {
    titulo: "Obligación IVA del mes",
    cuerpo:
      "Si existe una obligación de IVA de un mes determinado, debe existir una fila en proto_tax_obligations que la represente (período, vencimiento, monto estimado).",
    destacado: true,
  },
  {
    titulo: "Pago BPS (u otro organismo)",
    cuerpo:
      "Si existe un pago de BPS (o similar) registrado en el sistema, debe existir al menos una fila en proto_tax_payments vinculada a la obligación correspondiente.",
    destacado: true,
  },
  {
    titulo: "Recibos y facturas",
    cuerpo:
      "Cada cobro que querés ver en caja y cartera debería tener fila en proto_receipts; lo ideal es asociar invoice_id y company_id.",
  },
  {
    titulo: "Pagos operativos vs fiscales",
    cuerpo:
      "Los pagos a proveedores o gastos van a proto_payments. Los impuestos liquidados van a proto_tax_payments: no mezclar ambos mundos en la misma tabla.",
  },
  {
    titulo: "Empresa obligatoria en comercial",
    cuerpo:
      "Las facturas y recibos deberían referenciar proto_companies para que cartera y métricas por cliente sean coherentes.",
  },
];

export const ROADMAP_SENIOR: RoadmapDocumentRow[] = [
  {
    documento: "Notas de crédito",
    tablaSugerida: "proto_credit_notes",
    prioridad: "Alta",
    proposito: "Anular o reducir montos de facturas sin borrar el historial.",
    valorAdmin: "Menos errores al ajustar ventas y devoluciones desde un solo lugar.",
    valorCliente: "Estado de cuenta alineado a comprobantes reales que recibe.",
    valorContadora: "Trazabilidad fiscal y comercial de NC frente a AFIP/DGI y auditoría.",
  },
  {
    documento: "Notas de débito",
    tablaSugerida: "proto_debit_notes",
    prioridad: "Media",
    proposito: "Registrar cargos adicionales formalizados sobre la deuda o la venta.",
    valorAdmin: "Complementa facturación cuando hay intereses o ajustes pactados.",
    valorCliente: "Claridad sobre cargos extra con comprobante identificable.",
    valorContadora: "Asiento coherente con el documento que respalda el débito.",
  },
  {
    documento: "Órdenes de pago",
    tablaSugerida: "proto_payment_orders",
    prioridad: "Alta",
    proposito: "Aprobar y ordenar pagos antes de ejecutarlos en banco.",
    valorAdmin: "Control de quién autoriza qué y cuándo se libera tesorería.",
    valorCliente: "Menos demoras por falta de aprobación interna clara.",
    valorContadora: "Puente entre “aprobado contablemente” y “pagado en banco”.",
  },
  {
    documento: "Cuentas bancarias",
    tablaSugerida: "proto_bank_accounts",
    prioridad: "Alta",
    proposito: "Maestro de cuentas (moneda, banco, alias) para conciliación.",
    valorAdmin: "Sabe desde qué cuenta salen o entran fondos en reportes.",
    valorCliente: "Indirecto: menos confusiones en datos de pago mostrados.",
    valorContadora: "Base para mayor y conciliación multi-cuenta.",
  },
  {
    documento: "Movimientos bancarios",
    tablaSugerida: "proto_bank_movements",
    prioridad: "Alta",
    proposito: "Líneas de extracto importadas o conectadas al banco.",
    valorAdmin: "Detecta diferencias frente a recibos/pagos registrados.",
    valorCliente: "Mayor precisión en estados y confirmaciones de cobro.",
    valorContadora: "Conciliación bancaria estándar y cierre con respaldo.",
  },
  {
    documento: "Declaraciones / presentaciones fiscales",
    tablaSugerida: "proto_tax_filings",
    prioridad: "Alta",
    proposito: "Registrar lo presentado ante organismos, no solo la obligación teórica.",
    valorAdmin: "Historial de presentaciones y plazos cumplidos.",
    valorCliente: "Transparencia en cumplimiento tributario del proveedor de servicios.",
    valorContadora: "Vínculo obligación → presentación → pago sin ambigüedad.",
  },
  {
    documento: "Períodos fiscales",
    tablaSugerida: "proto_tax_periods",
    prioridad: "Media",
    proposito: "Cerrar y etiquetar meses/ejercicios para obligaciones y reportes.",
    valorAdmin: "Evita mezclar datos de dos períodos en la misma vista.",
    valorCliente: "Reportes más claros por período.",
    valorContadora: "Cierre fiscal ordenado y menos retrabajos.",
  },
  {
    documento: "Documentos adjuntos (PDF, XML)",
    tablaSugerida: "proto_documents",
    prioridad: "Media",
    proposito: "Almacenar o referenciar archivos ligados a facturas, pagos u obligaciones.",
    valorAdmin: "Respaldo a mano para auditorías rápidas.",
    valorCliente: "Posibilidad futura de portal de comprobantes.",
    valorContadora: "Evidencia documental alineada a cada asiento o obligación.",
  },
  {
    documento: "Asientos contables (cabecera)",
    tablaSugerida: "proto_ledger_entries",
    prioridad: "Alta",
    proposito: "Registrar movimientos de mayor con fecha, tipo y referencia.",
    valorAdmin: "Visión contable homogénea con el resto del ERP.",
    valorCliente: "Informes financieros más confiables.",
    valorContadora: "Libro diario digital listo para ajustes y cierre.",
  },
  {
    documento: "Líneas de asiento",
    tablaSugerida: "proto_ledger_lines",
    prioridad: "Alta",
    proposito: "Detalle debe/haber por cuenta de cada asiento.",
    valorAdmin: "Drill-down desde un asiento a cada cuenta afectada.",
    valorCliente: "No opera directo; mejora calidad de reporting.",
    valorContadora: "Mayor y balances con granularidad total.",
  },
  {
    documento: "Plan de cuentas",
    tablaSugerida: "proto_chart_of_accounts",
    prioridad: "Alta",
    proposito: "Catálogo de cuentas contables con jerarquía y naturaleza.",
    valorAdmin: "Reglas de imputación consistentes en todo el sistema.",
    valorCliente: "Indirecto vía reportes más estables.",
    valorContadora: "Condición necesaria para asientos y NIIF/local coherentes.",
  },
  {
    documento: "Conciliaciones",
    tablaSugerida: "proto_reconciliations",
    prioridad: "Alta",
    proposito: "Emparejar movimientos bancarios con recibos, pagos o asientos.",
    valorAdmin: "Estado de conciliación visible por cuenta y período.",
    valorCliente: "Menos reclamos por diferencias no detectadas.",
    valorContadora: "Cierre mensual con matches explícitos y ajustes trazados.",
  },
];

export function roadmapPriorityTone(p: RoadmapDocumentRow["prioridad"]): string {
  if (p === "Alta") return "text-rose-900 bg-rose-100/85 ring-1 ring-rose-200/70";
  if (p === "Media") return "text-amber-950 bg-amber-100/80 ring-1 ring-amber-200/70";
  return "text-slate-800 bg-slate-100/90 ring-1 ring-slate-200/80";
}
