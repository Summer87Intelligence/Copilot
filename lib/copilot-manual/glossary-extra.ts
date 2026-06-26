/** Términos operativos y de deuda (complementan el manual web). */
export const COPILOT_MANUAL_EXTRA_GLOSSARY: Array<{
  term: string;
  definition: string;
}> = [
  {
    term: "Deuda actual a cobrar",
    definition:
      "Todo lo que el cliente debe actualmente, sin importar si ya venció o no. El atrasado ya está incluido dentro de la deuda actual a cobrar — no se suma aparte.",
  },
  {
    term: "Atrasado",
    definition:
      "La parte de la deuda abierta con más de 7 días desde la fecha de emisión de la factura (modelo único de cobranza). Está incluida dentro de la deuda actual a cobrar. Cuanto más alto, más urgente la gestión.",
  },
  {
    term: "Atrasado +30 días",
    definition:
      "El peor tramo del atraso: facturas con más de 30 días desde su emisión. Está incluido dentro del atrasado y de la deuda actual a cobrar — no se suma aparte.",
  },
  {
    term: "Días de atraso",
    definition:
      "Clasificación del tiempo desde el vencimiento: Al día, 1–30 días, 31–60 días, 61–90 días o +90 días.",
  },
  {
    term: "Sin atrasos",
    definition:
      "El cliente tiene facturas abiertas pero ninguna venció todavía. Hay deuda actual, pero no es urgente.",
  },
  {
    term: "Con atrasos",
    definition:
      "Al menos una factura del cliente ya superó su fecha de vencimiento. Requiere seguimiento.",
  },
  {
    term: "Al día",
    definition:
      "El cliente tiene deuda actual abierta, pero todas sus facturas están dentro del plazo. No hay atrasos todavía.",
  },
  {
    term: "Cobro lento",
    definition:
      "El cliente tiene historial de pagos lentos o riesgo alto, aunque no tenga vencimientos.",
  },
  {
    term: "Contactar por atraso",
    definition:
      "Acción recomendada cuando el cliente tiene al menos una factura atrasada. Es el caso de mayor urgencia.",
  },
  {
    term: "Hacer seguimiento",
    definition:
      "Acción recomendada para clientes con historial de pagos lentos o riesgo alto, aunque no tengan vencimientos.",
  },
  {
    term: "Revisar ficha",
    definition:
      "Acción recomendada para clientes con deuda corriente. Sin urgencia inmediata.",
  },
  {
    term: "Caja disponible Santander",
    definition:
      "Dinero operativo en Tesorería: saldo cargado al corte más cobros Zeta posteriores y movimientos manuales confirmados, menos egresos confirmados.",
  },
  {
    term: "Cobro",
    definition:
      "Pago registrado de un cliente (recibo en Zeta). Suma a caja cuando es posterior al saldo cargado.",
  },
  {
    term: "Ventas",
    definition: "Facturación del período. No es igual a cobros ni a deuda.",
  },
  {
    term: "Ajuste de factura",
    definition: "Comprobante que reduce la facturación del período.",
  },
  {
    term: "Fecha de corte",
    definition:
      "Día hasta el cual están calculados los números en Finanzas o el saldo cargado en Tesorería.",
  },
  {
    term: "Último mes cerrado",
    definition:
      "Mes calendario completo anterior; Finanzas lo usa para comparar desempeño cuando el mes actual recién empieza.",
  },
  {
    term: "Vista previa (Preview)",
    definition:
      "Lectura sin persistir cambios. En Santander: ver filas del extracto antes de guardar. No modifica caja.",
  },
  {
    term: "Superadmin",
    definition: "Rol con acceso total de lectura y escritura en el workspace.",
  },
  {
    term: "Solo lectura",
    definition:
      "Roles usuario y demo_readonly: pueden navegar, consultar y descargar PDFs; escritura devuelve 403 READ_ONLY_USER.",
  },
];
