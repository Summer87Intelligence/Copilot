/**
 * Fuente de verdad del Manual de uso Copilot (web + PDF).
 * Al actualizar secciones visibles del producto, editar aquí y revisar
 * app/copilot/manual/page.tsx (UI enriquecida) en el mismo cambio.
 */

export const COPILOT_MANUAL_TITLE = "Manual de Usuario";
export const COPILOT_MANUAL_PRODUCT = "Summer87 Copilot";
export const COPILOT_MANUAL_TAGLINE =
  "Guía operativa para usuarios, administración, tesorería, cobranza, CEO y contador.";

export type CopilotManualBlock =
  | { type: "paragraph"; text: string }
  | { type: "bullets"; items: string[] }
  | { type: "steps"; items: string[] }
  | { type: "callout"; variant: "tip" | "warning" | "info"; text: string }
  | { type: "subsection"; title: string; blocks: CopilotManualBlock[] }
  | { type: "glossary"; entries: Array<{ term: string; definition: string }> };

export type CopilotManualSection = {
  id: string;
  title: string;
  /** Texto corto para índice PDF */
  tocTitle?: string;
  includeInToc: boolean;
  blocks: CopilotManualBlock[];
};

/** Orden del índice PDF (alineado al manual web vigente). */
export const COPILOT_MANUAL_TOC_ORDER: Array<{ id: string; title: string }> = [
  { id: "introduccion", title: "Introducción" },
  { id: "roles-permisos", title: "Roles y permisos" },
  { id: "inicio-sesion", title: "Inicio de sesión" },
  { id: "hoy", title: "Hoy" },
  { id: "acciones", title: "Acciones" },
  { id: "clientes", title: "Clientes" },
  { id: "cartera", title: "Cartera" },
  { id: "tesoreria", title: "Tesorería" },
  { id: "importador-santander", title: "Importador bancario Santander" },
  { id: "finanzas", title: "Finanzas" },
  { id: "reportes", title: "Reportes" },
  { id: "datos", title: "Datos" },
  { id: "agentes", title: "Agentes IA" },
  { id: "operacional", title: "Operacional / Estado del sistema" },
  { id: "rutinas", title: "Rutinas recomendadas" },
  { id: "faq", title: "Preguntas frecuentes" },
  { id: "glosario", title: "Glosario" },
];

export const COPILOT_MANUAL_FIVE_MINUTE_STEPS = [
  "Abrí Hoy — es la pantalla principal. Muestra caja disponible, deuda de clientes y prioridad del día.",
  "Mirá Acciones — ahí están las cosas concretas que conviene hacer: clientes a llamar, cobros a registrar.",
  "Si hay clientes vencidos → abrí su ficha y contactá por WhatsApp o email directamente desde Copilot.",
  "Si hay pagos próximos → entrá a Tesorería para ver caja real y confirmar que estén cubiertos.",
  "Si querés la foto completa del negocio → Cartera para deuda y antigüedad, Finanzas para panorama general.",
];

export const COPILOT_MANUAL_FAQ: Array<{ q: string; a: string }> = [
  {
    q: "¿Copilot reemplaza a mi contador?",
    a: "No. Copilot te ayuda a leer la situación del negocio y tomar decisiones. Tu contador sigue siendo quien valida, cierra y declara.",
  },
  {
    q: "¿Por qué Finanzas y Tesorería pueden mostrar números distintos?",
    a: "Finanzas muestra proyecciones y acumulados históricos. Tesorería muestra la caja operativa que registraste. Son perspectivas distintas del mismo negocio.",
  },
  {
    q: "¿Qué significa Estado: Atención?",
    a: "Que hay algo para revisar. No es una emergencia, pero conviene leer el detalle y ver si hay acciones pendientes.",
  },
  {
    q: "¿Qué pasa si el sistema contable falla?",
    a: "Copilot usa los últimos datos disponibles y muestra el problema en Operacional. Los datos anteriores siguen siendo válidos.",
  },
  {
    q: "¿Cada cuánto se actualizan los datos?",
    a: "Los datos críticos (saldos, facturas, recibos) se actualizan automáticamente cada pocas horas.",
  },
  {
    q: "¿Los agentes pueden modificar datos?",
    a: "No. En esta versión solo leen información y sugieren acciones. Vos decidís qué hacer.",
  },
  {
    q: "¿El importador Santander modifica la caja?",
    a: "No. La vista previa solo muestra coincidencias. Guardar el extracto requiere superadmin y no impacta caja hasta que registres movimientos en Tesorería.",
  },
  {
    q: "¿Puedo descargar reportes si soy solo lectura?",
    a: "Sí. Generar y descargar PDFs es lectura. También podés descargar este manual en PDF.",
  },
];

export const COPILOT_MANUAL_GLOSSARY: Array<{ term: string; definition: string }> = [
  {
    term: "Caja disponible",
    definition:
      "Dinero operativo en Tesorería: saldo cargado al corte más cobros Zeta posteriores y movimientos manuales confirmados, menos egresos confirmados.",
  },
  {
    term: "Deuda total",
    definition: "Suma de facturas abiertas de clientes, vencidas o al día.",
  },
  {
    term: "Deuda vencida",
    definition: "Parte de la deuda cuya fecha de vencimiento ya pasó.",
  },
  {
    term: "Cobro",
    definition: "Pago registrado de un cliente (recibo en Zeta). Suma a caja cuando es posterior al saldo cargado.",
  },
  {
    term: "Venta neta",
    definition: "Facturación del período menos notas de crédito. No es igual a cobros ni a deuda.",
  },
  {
    term: "Nota de crédito",
    definition: "Comprobante que reduce la facturación neta del período.",
  },
  {
    term: "Fecha de corte",
    definition: "Día hasta el cual están calculados los números en Finanzas o el saldo cargado en Tesorería.",
  },
  {
    term: "Último mes cerrado",
    definition: "Mes calendario completo anterior; Finanzas lo usa para comparar desempeño cuando el mes actual recién empieza.",
  },
  {
    term: "Preview (vista previa)",
    definition:
      "Lectura sin persistir cambios. En Santander: ver filas del extracto antes de guardar. No modifica caja.",
  },
  {
    term: "Importación (extracto bancario)",
    definition:
      "Carga de CSV, Excel o PDF Santander para conciliación. Guardar requiere superadmin y cuenta compatible.",
  },
  {
    term: "Superadmin",
    definition: "Rol con acceso total de lectura y escritura en el workspace.",
  },
  {
    term: "Solo lectura",
    definition:
      "Roles usuario y demo_readonly: pueden navegar, consultar y descargar PDFs; acciones mutantes muestran candado o 403 READ_ONLY_USER.",
  },
];

const SECTIONS: CopilotManualSection[] = [
  {
    id: "introduccion",
    title: "Introducción",
    includeInToc: true,
    blocks: [
      {
        type: "paragraph",
        text: "Copilot es una pantalla de control para tu negocio. Te ayuda a ver cuánto dinero hay, quién te debe, qué pagos se vienen, qué clientes están atrasados y qué acciones conviene hacer primero.",
      },
      {
        type: "callout",
        variant: "info",
        text: "Copilot no reemplaza a tu contador ni al sistema contable. Es una herramienta para leer la situación del negocio y tomar mejores decisiones.",
      },
      {
        type: "subsection",
        title: "Qué hace Copilot",
        blocks: [
          {
            type: "bullets",
            items: [
              "Muestra cuánto dinero tenés disponible y qué pagos están programados.",
              "Dice quién te debe y cuánto lleva sin pagar.",
              "Avisa cuando algo importante cambia.",
              "Sugiere qué hacer primero según la situación del negocio.",
              "Toma los datos de Zeta y los presenta de forma clara.",
            ],
          },
        ],
      },
      {
        type: "subsection",
        title: "Cómo moverse por Copilot",
        blocks: [
          {
            type: "bullets",
            items: [
              "Hoy — resumen y prioridad diaria.",
              "Acciones — tareas y agenda de cobranza.",
              "Clientes — ficha 360 y contacto.",
              "Cartera — deuda por período.",
              "Tesorería — caja, pagos próximos y movimientos.",
              "Finanzas — panorama ejecutivo.",
              "Reportes — vista en pantalla y PDF.",
              "Datos, Agentes IA, Alertas y Estado del sistema.",
              "Manual de uso — esta guía (también disponible en PDF).",
            ],
          },
        ],
      },
      {
        type: "callout",
        variant: "tip",
        text: "Alertas cuenta qué pasó; Acciones dice qué hacer. Las rutas de ajustes de workspace eliminadas del menú no aparecen en este manual.",
      },
    ],
  },
  {
    id: "roles-permisos",
    title: "Roles y permisos",
    includeInToc: true,
    blocks: [
      {
        type: "paragraph",
        text: "Copilot tiene tres roles. Solo superadmin puede modificar datos. Los roles usuario y demo_readonly son de solo lectura operativa.",
      },
      {
        type: "bullets",
        items: [
          "superadmin — acceso total. Puede leer y modificar cualquier dato del workspace.",
          "usuario — solo lectura. Navega, consulta y descarga reportes y este manual. No modifica datos operativos.",
          "demo_readonly — igual que usuario. Pensado para demos a clientes o invitados.",
        ],
      },
      {
        type: "subsection",
        title: "Qué puede hacer solo lectura",
        blocks: [
          {
            type: "bullets",
            items: [
              "Navegar por Hoy, Acciones, Clientes, Cartera, Tesorería, Finanzas, Datos, Reportes, Agentes IA y Manual.",
              "Ver dashboards, fichas, movimientos y deuda.",
              "Descargar reportes PDF y el manual en PDF.",
              "Generar vista previa del importador Santander (CSV, Excel o PDF).",
              "Ver agenda de cobranza, alertas y estado del sistema.",
            ],
          },
        ],
      },
      {
        type: "subsection",
        title: "Qué NO puede hacer solo lectura",
        blocks: [
          {
            type: "bullets",
            items: [
              "Registrar ingresos, egresos o ajustes en Tesorería.",
              "Guardar o importar extractos bancarios.",
              "Marcar pagos como pagados o editar saldo de caja.",
              "Registrar gestiones de cobranza o modificar notas.",
              "Ejecutar sincronizaciones manuales ni cambiar usuarios.",
            ],
          },
        ],
      },
      {
        type: "callout",
        variant: "warning",
        text: "Acciones bloqueadas muestran candado o tooltip «Solo disponible para superadmin.». Un POST de escritura devuelve 403 READ_ONLY_USER.",
      },
      {
        type: "subsection",
        title: "Reportes PDF permitidos para solo lectura",
        blocks: [
          {
            type: "bullets",
            items: [
              "Deudores, Cobranza mensual, Caja mensual, Ventas netas.",
              "Ejecutivo mensual, Clientes principales.",
              "Estado de cuenta (desde la ficha del cliente).",
              "Manual de uso Copilot (este documento).",
            ],
          },
        ],
      },
    ],
  },
  {
    id: "inicio-sesion",
    title: "Inicio de sesión",
    includeInToc: true,
    blocks: [
      {
        type: "paragraph",
        text: "El acceso es con usuario y PIN en la pantalla de login. No usa enlaces externos ni registro público.",
      },
      {
        type: "steps",
        items: [
          "Ir a /login.",
          "Ingresar Usuario y PIN provistos por quien administra el workspace.",
          "Pulsar Entrar.",
          "Si las credenciales son válidas, Copilot redirige a /copilot/hoy.",
        ],
      },
      {
        type: "bullets",
        items: [
          "Superadmin, usuario y demo usan el mismo formulario; el rol define permisos después del login.",
          "En solo lectura verás un badge en la barra superior (Solo lectura o Demo en móvil).",
        ],
      },
    ],
  },
  {
    id: "hoy",
    title: "Hoy — La pantalla principal",
    includeInToc: true,
    blocks: [
      {
        type: "paragraph",
        text: "Hoy es lo primero que conviene mirar cada mañana. Resume caja, deuda, pagos próximos y prioridad del día.",
      },
      {
        type: "bullets",
        items: [
          "Tu día en una frase — acción sugerida con enlace directo.",
          "Caja disponible — dinero en Tesorería ahora (no es deuda de clientes).",
          "Clientes por cobrar — facturas abiertas.",
          "Pagos próximos y caja después de pagos.",
          "Clientes que explican el riesgo y detalle del período.",
          "Próximos 30 días — escenario operativo.",
        ],
      },
      {
        type: "callout",
        variant: "warning",
        text: "Clientes por cobrar ≠ Caja disponible. La deuda entra a caja cuando el cobro aparece en Zeta.",
      },
    ],
  },
  {
    id: "acciones",
    title: "Acciones — Qué hacer primero",
    includeInToc: true,
    blocks: [
      {
        type: "paragraph",
        text: "Acciones es la lista de cosas concretas que conviene hacer hoy. Pestañas: Prioridades, Agenda de cobranza y Novedades.",
      },
      {
        type: "bullets",
        items: [
          "Prioridades — qué resolver (cobranza, tesorería, sistema).",
          "Agenda — a quién seguir hoy (/copilot/acciones?tab=agenda).",
          "Filtros: todas, críticas, cobranza, tesorería.",
          "Gestiones registradas en la ficha del cliente aparecen en la tarjeta.",
        ],
      },
      {
        type: "callout",
        variant: "info",
        text: "La agenda no modifica deuda ni ejecuta cobros automáticos. Solo organiza lo que vos registraste.",
      },
    ],
  },
  {
    id: "clientes",
    title: "Clientes — Directorio y ficha 360",
    includeInToc: true,
    blocks: [
      {
        type: "paragraph",
        text: "Clientes muestra la cartera comercial. Cada ficha 360 concentra deuda, facturas, cobros, contactos y gestión.",
      },
      {
        type: "bullets",
        items: [
          "Estados: sin deuda, con deuda al día, con deuda vencida.",
          "Ficha: resumen, estado de cuenta, facturas, cobros, timeline, contactos.",
          "Reporte de deudores PDF desde Clientes o Reportes.",
          "Estado de cuenta PDF por cliente desde la ficha.",
        ],
      },
    ],
  },
  {
    id: "cartera",
    title: "Cartera — Deuda y antigüedad",
    includeInToc: true,
    blocks: [
      {
        type: "paragraph",
        text: "Cartera analiza deuda por período, antigüedad y riesgo. Para operar el contacto usá Clientes o Acciones.",
      },
      {
        type: "bullets",
        items: [
          "Confirmá rango de fechas Desde/Hasta para cargar el reporte.",
          "Explorador de deuda con búsqueda, filtros y columnas UYU/USD.",
          "Buckets de antigüedad: 0-30, 31-60, 61-90, 90+ días.",
          "Efectividad de cobranza por moneda.",
        ],
      },
    ],
  },
  {
    id: "tesoreria",
    title: "Tesorería — Caja, pagos y movimientos",
    includeInToc: true,
    blocks: [
      {
        type: "paragraph",
        text: "Tesorería gestiona el dinero operativo: saldo de caja, egresos, ingresos manuales y pagos programados. Es la fuente de Caja disponible en Hoy.",
      },
      {
        type: "subsection",
        title: "Secciones",
        blocks: [
          {
            type: "bullets",
            items: [
              "Caja — saldo al corte; registrar ingreso, egreso o pago programado.",
              "Pagos próximos — obligaciones y recurrentes; no afectan caja hasta confirmarse.",
              "Movimientos — historial confirmado e importador bancario.",
            ],
          },
        ],
      },
      {
        type: "subsection",
        title: "Saldo y cobros",
        blocks: [
          {
            type: "bullets",
            items: [
              "Cargá el saldo real en UYU y USD por separado.",
              "Cobros Zeta posteriores al corte se suman solos.",
              "Cobros anteriores al corte no se duplican.",
              "Egresos confirmados restan; programados no hasta ejecutarlos.",
            ],
          },
        ],
      },
      {
        type: "callout",
        variant: "info",
        text: "Tesorería no marca facturas como pagadas ni modifica Zeta. UYU y USD no se mezclan.",
      },
    ],
  },
  {
    id: "importador-santander",
    title: "Importador bancario Santander",
    tocTitle: "Importador bancario Santander",
    includeInToc: true,
    blocks: [
      {
        type: "paragraph",
        text: "En Tesorería → Movimientos podés subir extractos CSV, Excel o PDF exportados desde Santander para conciliar con Copilot y Zeta.",
      },
      {
        type: "bullets",
        items: [
          "Formatos: CSV, Excel (XLSX) y PDF con texto extraíble (sin OCR).",
          "Detección USD y UYU según el extracto.",
          "Usuario y demo: vista previa permitida (no persiste ni modifica caja).",
          "Guardar/importar extracto: solo superadmin.",
          "Cuenta del extracto debe ser compatible con la cuenta seleccionada; si no, el guardado se bloquea.",
          "Estados por fila: Coincide, Falta en Copilot, Falta en Zeta, Posible coincidencia.",
          "Preview no crea recibos en Zeta ni movimientos de caja automáticos.",
        ],
      },
      {
        type: "callout",
        variant: "warning",
        text: "Para impactar caja registrá o confirmá el movimiento en Tesorería por separado.",
      },
    ],
  },
  {
    id: "finanzas",
    title: "Panorama financiero",
    includeInToc: true,
    blocks: [
      {
        type: "paragraph",
        text: "Finanzas es lectura ejecutiva para CEO y contador. No reemplaza Cartera ni Tesorería para operar el día a día.",
      },
      {
        type: "bullets",
        items: [
          "Fecha de corte — día hasta el cual están los números.",
          "Período actual — mes en curso (lectura parcial).",
          "Último mes cerrado — mes calendario anterior para comparar.",
          "Ventas netas — facturas menos notas de crédito.",
          "Cobros — por fecha de recibo; pueden superar ventas del período.",
          "Deuda total y vencida — saldo de clientes al corte.",
          "Caja disponible — desde Tesorería.",
          "Comparación principal — último mes cerrado vs anterior por moneda.",
          "Proyección 30 días y riesgo de cobranza (selector UYU/USD).",
        ],
      },
    ],
  },
  {
    id: "reportes",
    title: "Reportes",
    includeInToc: true,
    blocks: [
      {
        type: "paragraph",
        text: "Reportes centraliza seis reportes operativos con vista en pantalla y descarga PDF. Los números son los mismos en ambos modos.",
      },
      {
        type: "bullets",
        items: [
          "Deudores — clientes con deuda, moneda y antigüedad.",
          "Cobranza mensual — cobros del mes.",
          "Caja mensual — movimientos y saldo acumulado.",
          "Ventas netas — facturación neta por cliente.",
          "Ejecutivo mensual — indicadores, top clientes y deudores, riesgo.",
          "Clientes principales — ranking por facturación o deuda.",
          "Estado de cuenta — por cliente desde su ficha.",
          "Solo lectura: no modifica facturas ni caja.",
        ],
      },
    ],
  },
  {
    id: "datos",
    title: "Datos",
    includeInToc: true,
    blocks: [
      {
        type: "paragraph",
        text: "Datos es consulta directa de registros base: clientes, facturas, recibos, pagos y obligaciones fiscales.",
      },
      {
        type: "callout",
        variant: "info",
        text: "Para operar usá Cartera, Tesorería o Acciones. Los clientes vienen de Zeta; no se crean manualmente aquí.",
      },
    ],
  },
  {
    id: "agentes",
    title: "Agentes IA",
    includeInToc: true,
    blocks: [
      {
        type: "paragraph",
        text: "Agentes IA ofrecen briefings de lectura (cobranza, tesorería, riesgo, CFO). No modifican datos ni envían mensajes automáticos.",
      },
      {
        type: "bullets",
        items: [
          "Usalos al inicio del día para priorizar; luego actuá en los módulos concretos.",
          "Si Zeta está degradado, el agente puede advertirlo y sugerir revisar Operacional.",
        ],
      },
    ],
  },
  {
    id: "operacional",
    title: "Estado del sistema",
    includeInToc: true,
    blocks: [
      {
        type: "paragraph",
        text: "Estado del sistema muestra salud de integraciones y sincronización con Zeta.",
      },
      {
        type: "bullets",
        items: [
          "Última actualización y estado de conexión.",
          "Confianza del dato: clientes, facturas, recibos sincronizados.",
          "Revisalo si los números parecen viejos o hay alertas de sistema.",
        ],
      },
      {
        type: "callout",
        variant: "info",
        text: "Un fallo en Zeta no significa que Copilot esté roto: los datos previos siguen válidos hasta el próximo sync.",
      },
    ],
  },
  {
    id: "rutinas",
    title: "Rutinas recomendadas",
    includeInToc: true,
    blocks: [
      {
        type: "subsection",
        title: "Copilot en 5 minutos",
        blocks: [{ type: "steps", items: COPILOT_MANUAL_FIVE_MINUTE_STEPS }],
      },
      {
        type: "subsection",
        title: "Rutina matinal sugerida",
        blocks: [
          {
            type: "steps",
            items: [
              "Entrar a Hoy y leer la prioridad del día.",
              "Revisar Acciones → Agenda de cobranza.",
              "Contactar clientes vencidos desde Clientes.",
              "Verificar pagos próximos en Tesorería.",
              "Si necesitás números para reunión → Finanzas o Reportes PDF.",
            ],
          },
        ],
      },
    ],
  },
  {
    id: "faq",
    title: "Preguntas frecuentes",
    includeInToc: true,
    blocks: COPILOT_MANUAL_FAQ.map((item) => ({
      type: "subsection" as const,
      title: item.q,
      blocks: [{ type: "paragraph" as const, text: item.a }],
    })),
  },
  {
    id: "glosario",
    title: "Glosario",
    includeInToc: true,
    blocks: [{ type: "glossary", entries: COPILOT_MANUAL_GLOSSARY }],
  },
];

export const COPILOT_MANUAL_SECTIONS: CopilotManualSection[] = SECTIONS;

export function getCopilotManualSectionById(id: string): CopilotManualSection | undefined {
  return SECTIONS.find((s) => s.id === id);
}

/** Secciones en orden del índice PDF. */
export function getCopilotManualSectionsForPdf(): CopilotManualSection[] {
  return COPILOT_MANUAL_TOC_ORDER.map((entry) => getCopilotManualSectionById(entry.id)).filter(
    (s): s is CopilotManualSection => s != null
  );
}

export const COPILOT_MANUAL_PDF_FILENAME = "manual-uso-copilot.pdf";
