/* eslint-disable max-lines -- manual source of truth (web + PDF) */
/** Fuente de verdad del Manual de uso. Editar en UTF-8. Validar: node scripts/generate-copilot-manual-content.mjs --check */
import type { CopilotManualSection } from "./types";

export const COPILOT_MANUAL_GENERATED_SECTIONS: CopilotManualSection[] = [
  {
    id: "copilot",
    title: "¿Qué es Summer87 Copilot?",
    includeInToc: true,
    blocks: [
      { type: "paragraph", text: "Copilot es una pantalla de control para tu negocio. Te ayuda a ver cuánto dinero hay, quién te debe, qué pagos se vienen, qué clientes están atrasados y qué acciones conviene hacer primero." },
      { type: "callout", variant: "info", text: "Copilot lee Zeta y presenta la situación del negocio para decidir más rápido. Para cierre contable, validá con tu contador." },
      { type: "bullets", items: ["Muestra cuánto dinero tenés disponible y qué pagos están programados.","Dice quién te debe y cuánto lleva sin pagar.","Avisa cuando algo importante cambia: un cliente paga, un vencimiento se acerca.","Sugiere qué hacer primero según la situación del negocio.","Toma los datos de tu sistema contable (Zeta) y los presenta de forma clara."] },
    ],
  },
  {
    id: "navegacion",
    title: "Cómo moverse por Copilot",
    includeInToc: true,
    blocks: [
      { type: "paragraph", text: "El menú lateral está organizado en seis bloques: HOY, VENTAS, COBRANZA, TESORERÍA, SISTEMA y CONFIGURACIÓN." },
      { type: "callout", variant: "tip", text: "Período vs. situación actual — en Dashboard y Cartera distinguimos métricas del rango seleccionado (ventas, cobrado, pendiente del período) de la foto de hoy (deuda actual, caja, proyección). No mezcles ambos al leer un número." },
      { type: "bullets", items: ["HOY — pantalla de operación diaria (caja, cobros y prioridades del día)."] },
      { type: "bullets", items: ["VENTAS — Dashboard Resumen (análisis ejecutivo consolidado) y Finanzas (panorama ejecutivo)."] },
      { type: "bullets", items: ["COBRANZA — Cobranza (hub operativo: KPIs, clientes a gestionar, agenda y alertas), Cartera (deuda y antigüedad), Clientes (directorio y ficha 360) y Cobranza (tareas del día)."] },
      { type: "bullets", items: ["TESORERÍA — Tesorería (caja, pagos y compromisos operativos)."] },
      { type: "bullets", items: ["SISTEMA — Datos (tablas), Alertas (inbox de eventos), Reportes (PDFs), Agentes IA y Manual de uso."] },
      { type: "bullets", items: ["CONFIGURACIÓN — Usuarios y permisos (solo superadmin). Incluye el Panel administrativo."] },
      { type: "callout", variant: "info", text: "Enlaces guardados — redirects permanentes: /copilot/insights → Dashboard; /copilot/gestion-ia → Agentes IA; /copilot/rutas y /copilot/personalizacion → Hoy; /copilot/operacional → Alertas." },
      { type: "callout", variant: "tip", text: "Barra superior compacta — semáforo operacional (Al día / Requiere atención / Crítico) con detalle en popover al hacer clic; pill «Datos al…» con última sincronización Zeta; campana de notificaciones; menú de usuario con Configuración y Cerrar sesión; selector de tema claro/oscuro. El detalle técnico (señales, fuentes) queda en el popover, no en la pantalla principal." },
      { type: "callout", variant: "tip", text: "Todo en USD — el toggle de moneda en el menú de usuario te permite ver todos los valores en dólares. En modo 'Todo en USD', los UYU se convierten usando el tipo de cambio que configurás haciendo clic en el número del TC. Para volver a moneda original, hacé clic en 'Volver a moneda original' en el banner amarillo o usá el toggle en el menú de usuario." },
      { type: "callout", variant: "tip", text: "Tipo de cambio editable — al seleccionar 'Todo en USD' en Dashboard, aparece el chip con el TC actual y el botón Editar TC. Ingresá el valor entre 0,01 y 999,99. Es conversión visual para lectura ejecutiva; los datos originales en Zeta no se alteran." },
      { type: "callout", variant: "tip", text: "Menú de usuario — hacé clic en tu avatar o nombre en la barra superior para acceder a Configuración de tu cuenta y Cerrar sesión." },
      { type: "callout", variant: "tip", text: "Tema claro / oscuro — en la barra superior hay un botón para alternar entre el tema claro y oscuro. La preferencia se guarda automáticamente para tu próxima sesión." },
    ],
  },
  {
    id: "hoy",
    title: "Hoy — La pantalla principal",
    includeInToc: true,
    blocks: [
      { type: "paragraph", text: "Hoy es la pantalla de operación diaria. Mirala cada mañana para saber qué resolver primero: caja, cobros urgentes y clientes atrasados." },
      { type: "callout", variant: "tip", text: "Layout ejecutivo compacto — resumen en pocas cards, clientes con deuda arriba (tabla accionable) y detalle financiero al final. En mobile (390px) las cards usan ancho completo, Ver detalle expande inline y la proyección al cierre del mes muestra fórmula legible por moneda." },
      { type: "callout", variant: "tip", text: "Acciones recomendadas — hasta 3 pasos con acción concreta, impacto esperado y CTA. Usa el mismo motor de prioridades de Hoy; no inventa tareas nuevas." },
      { type: "callout", variant: "info", text: "Fuente y trazabilidad — tira compacta bajo el encabezado: Fuente Zeta · Actualizado hace X horas · Período mes actual (u otro rango activo)." },
      { type: "callout", variant: "tip", text: "Tu día en una frase — al entrar, un bloque te dice qué hacer primero según la señal más urgente del día. Los estados posibles son: clientes con deuda crítica (critical_clients), deuda activa importante (active_debt), agenda de cobranza pendiente (collection_agenda), compromisos de Tesorería (treasury_review) o resumen general del día (daily_summary). Cada estado tiene un CTA claro para no perderse." },
      { type: "bullets", items: ["Tu día en una frase — la acción concreta sugerida con un CTA (clientes con deuda, agenda, Tesorería o acciones).","Estado del día (semáforo) — el badge Al día / Requiere atención / Atención crítica es clicable. Al tocarlo aparece un popover con las señales detectadas: clientes que requieren atención, caja post-pagos y métricas de cartera. Incluye accesos rápidos a Clientes, Tesorería y Cobranza.","Qué resolver hoy — hasta 3 prioridades ejecutivas con título, motivo y CTA directo: clientes con deuda para gestionar (atrasados y al día), agenda de cobranza pendiente y caja ajustada. Solo aparece cuando hay señales activas.","Caja disponible Santander — dinero en Tesorería ahora. No es facturación ni deuda de clientes. Ver detalle expande dentro de la card: último ingreso y último egreso por moneda.","Deuda actual a cobrar — deuda de clientes por moneda (UYU y USD). Ver detalle expande en la misma card: Atrasado, Atrasado +30 días y cantidad de clientes. Link secundario a Cartera dentro del detalle.","Pagos próximos — qué salidas están cargadas en Tesorería para la semana en curso, agrupados por fecha y moneda con el conteo de compromisos. Ver detalle desglosa caja actual, cobros esperados, pagos próximos y caja proyectada por moneda.","Proyección semanal — resumen de compromisos de los próximos 7 días: qué vence esta semana por moneda, con el total de obligaciones y la caja estimada si se ejecutan todos los pagos.","Próximos compromisos — sección que agrupa los compromisos de pago más próximos por fecha y moneda. Muestra el conteo de obligaciones por vencimiento sin necesidad de ir a Tesorería.","Calendario ejecutivo — vista de agenda con tres pestañas: Semana (compromisos de los próximos 7 días), Mes (vista mensual de vencimientos) y Próximos pagos (lista consolidada). Permite planificar la semana sin salir de Hoy.","Caja proyectada al cierre del mes — cuánto queda si se pagan todos los compromisos cargados hasta fin de mes. Ver detalle desglosa caja actual, cobros esperados, pagos próximos y caja proyectada por moneda. Reemplaza la vista de «30 días corridos» anterior.","Cobertura de caja — indicador que muestra si la caja disponible cubre los compromisos de la semana o del mes. En verde si la caja supera los pagos programados; en rojo si hay riesgo de quedarse corto.","Alertas ejecutivas — cuando hay señales críticas (caja ajustada, clientes con atraso importante, pagos sin confirmar), Hoy las muestra en un bloque destacado con acción sugerida y CTA directo.","Clientes con deuda — tabla accionable arriba en la pantalla. Paginación compacta (10 filas por defecto). Los totales superiores reflejan toda la deuda activa sincronizada desde Zeta.","Detalle de caja — último ingreso y último egreso en líneas separadas (no un bloque largo). Si no hay movimientos recientes, lo indica claramente.","Detalle financiero del período — ventas del período, cobrado aplicado y pendiente con la misma reconciliación que Cartera y Dashboard.","Generar PDF — en Clientes podés descargar el reporte de deudores."] },
      { type: "callout", variant: "info", text: "Clientes con deuda — la tabla lista todos los deudores con paginación; los totales superiores (Deuda actual a cobrar UYU/USD) son el rollup completo del negocio, igual que Cartera y Dashboard. El atrasado ya está incluido dentro de la deuda actual. Hacé clic en cualquier fila para ver el desglose por factura." },
      { type: "bullets", items: ["Deuda actual a cobrar — saldo abierto del cliente en esa moneda. Viene de las facturas abiertas sincronizadas desde Zeta. El atrasado ya está incluido.","Atrasado — facturas con vencimiento anterior a hoy (incluye mora de 1 a 30 días). Atrasado +30 días es un subconjunto con más de 30 días; ya está incluido dentro del atrasado, no se suma aparte. Si es 0, el cliente tiene deuda actual pero todavía está dentro del plazo.","Al día — diferencia entre deuda actual y atrasado. Saldo todavía dentro del plazo.","Días de atraso — días desde la factura atrasada más antigua. Aparece solo cuando hay atraso registrado.","Fila expandida — hacé clic en una fila para ver el resumen completo: montos, estado (al día / requiere seguimiento), fuente del dato, moneda y datos de contacto.","Badge 'Al día' — el cliente tiene deuda actual pero ninguna factura venció todavía.","Badge 'Con atrasos' — hay al menos una factura cuya fecha de vencimiento ya pasó."] },
      { type: "bullets", items: ["Saldo actual cargado — el punto de partida. Lo cargás vos en Tesorería con la plata real que tenés en caja o cuenta.","Cobros Zeta posteriores — si un cliente paga después de que cargaste el saldo, Copilot lo suma automáticamente cuando aparece en Zeta. No tenés que registrarlo a mano.","Registros manuales — plata que ingresa o egresa pero no viene de Zeta (transferencias, adelantos, pagos realizados). Se registra en Tesorería.","Último ingreso — el recibo/cobro más reciente (Zeta o ingreso manual). Si no hay ninguno: «No hay ingresos registrados».","Último egreso — el egreso manual más reciente. Si no hay ninguno: «No hay egresos registrados». Ingreso y egreso se muestran en líneas separadas.","Pagos programados sin confirmar — no restan hasta que los marcás como ejecutados."] },
      { type: "bullets", items: ["Si hay clientes con atrasos — abrí su ficha y contactá por WhatsApp o email.","Si hay pagos próximos — entrá a Tesorería para confirmar que estén cubiertos.","Si la caja después de pagos queda baja — revisá saldo y pagos en Tesorería.","Si la caja disponible parece incorrecta — verificá que el saldo en Tesorería esté actualizado.","Para ver el detalle de facturación y cobros — abrí 'Detalle financiero del período'.","Para ver el escenario al cierre del mes — abrí 'Caja proyectada al cierre del mes' dentro del mismo detalle."] },
    ],
  },
  {
    id: "acciones",
    title: "Cobranza — Qué hacer primero",
    includeInToc: true,
    blocks: [
      { type: "paragraph", text: "Cobranza es la lista de cosas concretas que conviene hacer hoy. No avisa qué pasó — dice qué hacer." },
      { type: "callout", variant: "tip", text: "Inbox operativo: Prioridades = qué resolver · Agenda = a quién seguir · Alertas = qué revisar (vista previa con enlace al módulo completo)." },
      { type: "bullets", items: ["Contactar a un cliente que lleva 45 días sin pagar.","Revisar un pago que vence esta semana.","Verificar el estado de la caja antes del cierre del mes."] },
      { type: "bullets", items: ["Todas — todo junto.","Críticas — las más urgentes, las que no pueden esperar.","Cobranza — acciones relacionadas con clientes y facturas.","Tesorería — acciones relacionadas con pagos y caja.","Sistema — avisos técnicos sobre la sincronización de datos."] },
      { type: "bullets", items: ["Qué pasó — cada card resume el hecho que la hace prioritaria (deuda, pago, alerta).","Qué riesgo tiene — explica el impacto si no actuás (caja, cobranza, datos).","Qué hacer ahora — siguiente paso concreto: contactar, confirmar pago, monitorear promesa o registrar resultado.","Última gestión — canal, resultado y fecha de la última gestión registrada.","Prometió pagar — si hay una promesa activa, se muestra la fecha y el monto.","Próximo seguimiento — si agendaste un seguimiento, aparece la fecha.","La prioridad puede bajar si el cliente ya fue contactado o tiene una promesa futura.","El botón cambia a «Ver seguimiento» para ir directo al historial del cliente."] },
      { type: "bullets", items: ["Acceso directo: Cobranza — sección Agenda de cobranza (/copilot/cobranza).","También en Hoy: resumen compacto con counts y link Ver agenda.","Vencidos ? seguimientos cuya fecha ya pasí, contactos incorrectos y clientes sin respuesta hace 5+ días.","Hoy ? seguimientos programados para hoy. Alta prioridad: hacer antes del cierre del día.","Próximos ? seguimientos futuros ordenados por fecha. Para planificar la semana.","Promesas ? clientes con promesa de pago activa, separadas en vencidas (crítico) y futuras (monitorear).","Contactados ? clientes contactados en los Últimos 7 días sin se?al pendiente. Estado 'Esperando respuesta'."] },
    ],
  },
  {
    id: "alertas",
    title: "Alertas — Historial de avisos",
    includeInToc: true,
    blocks: [
      { type: "paragraph", text: "Alertas guarda todos los avisos importantes del negocio. Es como la bandeja de entrada, pero para eventos del negocio." },
      { type: "callout", variant: "info", text: "Marcar como leída solo indica que ya la viste. La alerta sigue ahí para consultarla después." },
      { type: "bullets", items: ["Cobro recibido — un cliente pagó.","Cliente vencido — un cliente lleva días sin pagar.","Pago próximo — un pago vence pronto.","Pago vencido — un pago ya pasó su fecha.","Problema de sincronización — los datos no se actualizaron correctamente."] },
    ],
  },
  {
    id: "clientes",
    title: "Clientes — Directorio y ficha 360",
    includeInToc: true,
    blocks: [
      { type: "paragraph", text: "Clientes es la lista accionable de cartera: entrás y ves de inmediato quién debe, en qué moneda y qué tan urgente es. Tocar Abrir muestra un resumen rápido; desde ahí podés ir a la ficha 360 completa." },
      { type: "callout", variant: "tip", text: "Stats compactos — bajo el título aparece una línea del tipo «186 activos · 33 con deuda · 10 atrasados · 22 sin contacto». Reemplaza las cards grandes de KPI." },
      { type: "callout", variant: "tip", text: "Columna Salud — clasifica al cliente por la antigüedad de su factura abierta más antigua (modelo único de cobranza desde la fecha de emisión): Al día (sin deuda), No atrasado (7 días o menos), Atrasado 8–14, Atrasado 15–30 o Atrasado +30. No hay columnas duplicadas de Estado + Riesgo." },
      { type: "callout", variant: "tip", text: "CTA única Abrir — abre el drawer de resumen. Dentro del drawer está el botón «Abrir ficha completa» para la vista 360 con pestañas." },
      { type: "bullets", items: ["Filtros compactos — Todos, No atrasados, Atrasado 8–14, Atrasado 15–30, Atrasado +30, Sin contacto; más Todas / UYU / USD y buscador por nombre.","Deuda actual a cobrar — UYU y USD en la misma fila, siempre en rojo (deuda). No se convierten ni suman monedas.","Atraso — el badge de Salud clasifica por la peor factura abierta (días desde emisión), no por vencimiento.","Contacto — solo aparecen WhatsApp o Email si el dato existe; no hay botones deshabilitados.","Tabla primero — la lista accionable queda arriba, sin bloques que ocupen media pantalla antes de ver clientes."] },
      { type: "paragraph", text: "La ficha 360 (desde «Abrir ficha completa») tiene encabezado fijo y pestañas: Resumen, Cobranza, Estado de cuenta, Facturas, Cobros, Datos y Formas de transferencia." },
      { type: "paragraph", text: "La ficha tiene dos zonas: el encabezado fijo (nombre, RUT, chips de estado, contactos, indicadores y próximo paso) y el contenido de la pestaña activa. Al cambiar de pestaña solo se muestra esa sección, sin scroll largo por toda la ficha." },
      { type: "paragraph", text: "La barra de pestañas es sticky, queda anclada al tope al hacer scroll dentro de la pestaña activa. En mobile las pestañas se pueden deslizar horizontalmente. La última pestaña visitada se recuerda durante la sesión." },
      { type: "callout", variant: "tip", text: "Próximo paso — debajo de los indicadores, un bloque destacado muestra la acción sugerida, la deuda actual y dos botones: Ver estado de cuenta y Generar cobranza." },
      { type: "callout", variant: "tip", text: "Copilot sugiere, vos decidís. Los resúmenes y acciones que muestra la ficha son lecturas automáticas. La decisión de contactar al cliente, negociar un plazo o dar de baja una deuda siempre es tuya." },
      { type: "bullets", items: ["Encabezado fijo — nombre, RUT, código, chips de estado (deuda, riesgo), contactos, indicadores (Deuda UYU/USD, Facturas pendientes, ?Último cobro) y Próximo paso.","Pestaña Resumen — lectura del Agente de cliente + últimos 5 movimientos comerciales en formato inline (fecha · tipo · importe · medio) con enlace 'Ver actividad completa'. No muestra cobranza ni estado de cuenta completo.","Pestaña Cobranza — Asistente de cobranza (canal, tono, mensaje, adjuntos sugeridos, WhatsApp y email) + formulario de gestión + historial de gestiones. Cada gestión del historial tiene botones de editar y eliminar: editar abre un formulario inline para corregir canal, resultado, nota y próximo seguimiento; eliminar pide confirmación antes de borrar.","Pestaña Estado de cuenta — descarga de PDF, envío de estado de cuenta, deuda actual (UYU y USD) e historial de movimientos. Incluye controles de moneda y rango de fechas.","Pestaña Facturas — tabla completa de facturas emitidas con contador, estado, importe, saldo y fecha.","Pestaña Cobros — tabla completa de cobros registrados con contador, importe, medio de pago, referencia y estado.","Pestaña Datos — tarjeta con los 6 campos de identidad del cliente: Razón social, Nombre visible, Código, RUT, Email y Teléfono. Sin secciones colapsables ni información comercial.","Pestaña Formas de transferencia — gestión de aliases de pago: textos, bancos o razones sociales desde donde el cliente suele transferir. Podés agregar, editar y eliminar aliases. Se usan para la conciliación automática del extracto bancario Santander."] },
      { type: "bullets", items: ["Deuda actual a cobrar — suma de todas las facturas abiertas del cliente. El atrasado ya está incluido dentro de la deuda actual.","Atrasado — parte de la deuda actual cuya fecha de vencimiento ya pasó. Ya está incluido en la deuda actual; no se suma aparte.","% atrasado — qué proporción de la deuda actual ya está atrasada. Cuanto más alto, más urgente."] },
      { type: "bullets", items: ["Dónde generarlo — botón Generar PDF en Hoy (bloque Principales deudores) y en Clientes (Cartera de clientes).","Antes de descargar — elegís moneda, estado, montos mínimos, antigüedad de vencimiento y contacto.","Vista previa — el modal indica cuántos clientes entrarán con los filtros elegidos.","Antigüedad — días exactos desde la factura vencida más antigua (fecha de emisión del PDF como referencia).","UYU y USD — cada moneda va en filas separadas; los totales no se mezclan.","Columnas — cliente, moneda, deuda, atrasado, días de atraso, contacto y estado.","Orden — primero pesos de mayor a menor deuda, luego dólares de mayor a menor (si aplica el filtro de moneda).","Contacto — solo muestra WhatsApp o email si el dato es válido (teléfono corto o email inválido no cuenta).","Filtros en el PDF — solo aparecen los filtros que realmente restringen el reporte; los valores por defecto no se listan.","Es informativo — no modifica datos, no marca clientes como pagados y no envía mensajes."] },
      { type: "bullets", items: ["Email — debajo del encabezado: Enviar email, Copiar email o WhatsApp si el teléfono es válido.","Teléfono — aparece en la franja Contactos, no en una pestaña aparte.","Si no hay datos de contacto — revisá los datos en tu sistema contable (Zeta)."] },
      { type: "bullets", items: ["Qué pasa — resume la situación del cliente: sin deuda, deuda al día, vencida o con promesa de pago.","Por qué importa — explica el contexto: cuánto tiene vencido, en qué moneda.","Qué hacer ahora — sugiere el próximo paso: preparar cobranza, ver seguimiento o revisar estado de cuenta.","Insights — señales operativas (vencido, promesa, última gestión). No incluye contacto ni último movimiento porque ya están arriba.","CTA — el botón lleva al asistente de cobranza, al estado de cuenta o al seguimiento.","No modifica nada. No marca facturas. No envía mensajes. Solo sugiere."] },
      { type: "bullets", items: ["Canal — elige WhatsApp o Email según como preferís contactar al cliente.","Tono — Amable para el primer aviso, Firme si ya pasó un tiempo, Urgente si la deuda lleva mucho sin atenderse.","Generar mensaje — crea el texto con los datos reales del cliente (nombre y monto).","Adjuntos sugeridos — según la deuda por moneda, Copilot muestra links para descargar Estado de cuenta UYU y/o USD. Si debe en una sola moneda, aparece solo ese PDF.","WhatsApp — no adjunta archivos automáticamente: descargá el PDF y adjuntalo manualmente al enviar el mensaje.","Email — abre tu cliente de correo con asunto y cuerpo; descargá y adjuntá el PDF antes de enviar.","Copiar mensaje — copia el texto al portapapeles para pegarlo donde quieras.","Enviar email — si el cliente tiene email cargado, abre tu cliente de correo con el texto y asunto preparados.","Abrir WhatsApp — aparece solo si el cliente tiene un celular utilizable (formato uruguayo). Al hacer clic, abre WhatsApp con el mensaje ya escrito.","Teléfono no utilizable para WhatsApp — aparece cuando hay un teléfono cargado pero es fijo o tiene formato inválido. Corregí el teléfono en Zeta para habilitarlo.","Sin teléfono cargado — el cliente no tiene teléfono registrado en el sistema."] },
      { type: "bullets", items: ["Canal — elegís cómo fue el contacto: WhatsApp, Email, Teléfono u Otro.","Resultado — qué pasó: Contactado, Prometió pagar, Sin respuesta, Contacto incorrecto, En disputa, Requiere seguimiento.","Nota — campo libre para escribir el detalle: 'prometió pagar el viernes', 'sin respuesta, llamar en 3 días', etc.","Próximo seguimiento — fecha opcional para recordar cuándo volver a contactar.","Promesa de pago — si el resultado fue 'Prometió pagar', la fecha es requerida para guardar la gestión. El monto es opcional.","Registrar gestión — guarda el registro. No modifica la deuda ni marca facturas como pagadas."] },
      { type: "bullets", items: ["Contactado — lograste comunicarte con el cliente.","Prometió pagar — el cliente se compromete a pagar en una fecha. La fecha de promesa es requerida; el monto es opcional.","Sin respuesta — llamaste o escribiste pero no contestó.","Contacto incorrecto — el número o email que tenés no es el correcto.","En disputa — el cliente no reconoce la deuda o la cuestiona.","Requiere seguimiento — necesitás volver a contactar, pero no hay más detalle por ahora."] },
      { type: "bullets", items: ["Registrar una gestión hace que Cobranza y Agentes reconozcan el estado real del cliente, sin repetir la misma recomendación de contacto.","Si el cliente fue contactado recientemente, Copilot lo muestra como 'ya contactado' o 'esperando respuesta' en lugar de 'priorizar cobranza'.","Si hay una promesa de pago futura, los Agentes sugieren monitorearla en lugar de contactar.","Si la promesa vence sin confirmación de pago, la prioridad sube automáticamente.","Si el resultado fue 'Sin respuesta' hace más de 5 días, vuelve a ser prioritario.","Si el resultado fue 'Contacto incorrecto', la prioridad se mantiene alta porque no hubo contacto útil.","La deuda nunca desaparece. Solo cambia el copy y el tono de la recomendación."] },
      { type: "bullets", items: ["Botón Descargar PDF — aparece en la sección Estado de cuenta histórico de la ficha.","Incluye todos los movimientos del cliente: facturas emitidas, cobros recibidos y saldo acumulado.","Cada factura muestra su concepto/ítem real (viene de Zeta) debajo del movimiento principal.","Cada recibo muestra la caja o medio de cobro como línea secundaria.","Las facturas con ajuste van en columna Haber (descuentan saldo), no como deuda a cobrar.","Separa UYU y USD en bloques independientes. No mezcla monedas.","Usa el modo ledger: incluye también registros archivados para un historial completo.","El PDF no modifica datos — es solo lectura de lo sincronizado desde Zeta.","El archivo se descarga directamente en el navegador."] },
      { type: "bullets", items: ["Elegí el canal: Email o WhatsApp.","Elegí la moneda del mensaje: Pesos (UYU) o Dólares (USD) — el saldo del texto se ajusta automáticamente.","Adjuntos sugeridos — Copilot ofrece descargar Estado de cuenta UYU y/o USD según la deuda real del cliente (no según la moneda del mensaje).","Elegí el tono: Amable (informal), Firme (formal exigente) o Breve (mensaje corto).","El mensaje se genera con el período del año actual al día de hoy y el saldo vigente del cliente.","Botón Copiar mensaje — copia el texto al portapapeles.","Botón Abrir email — abre el cliente de correo con destinatario, asunto y cuerpo pre-cargados.","Botón Abrir WhatsApp — abre WhatsApp Web o la app con el mensaje pre-cargado.","Si el cliente no tiene email registrado, el botón de email queda deshabilitado.","Si el cliente no tiene celular apto para WhatsApp, ese botón queda deshabilitado.","Los PDFs no se adjuntan automáticamente — descargalos desde Adjuntos sugeridos y adjuntalos manualmente antes de enviar.","Después de Copiar, Abrir email o Abrir WhatsApp, aparece el botón Registrar gestión. Al hacerlo, el formulario de Gestión de cobranza se completa automáticamente con el canal y una nota del período enviado.","Si el formulario de cobranza ya tiene texto, en lugar de pisarlo aparece una sugerencia que podés aplicar o ignorar."] },
      { type: "bullets", items: ["Buscador — busca en texto libre: cliente, número, RUT, concepto, método de cobro o estado.","Listado — alternás entre Activos, Inactivos o Todos sin recargar la página.","Contador — muestra cuántos registros coinciden con los filtros activos.","Período (Facturas y Recibos) — filtrá por Mes y año, Rango de fechas o Todo. Botones rápidos: Mes actual, Hoy (Recibos) y Limpiar.","Chips Facturas — Todos / Con saldo / Ajustes y Pesos / Dólares.","Chips Recibos — Pesos / Dólares.","Al hacer clic en cualquier registro se abre el panel lateral con el detalle completo.","Los IDs técnicos de Zeta quedan en el bloque «Datos técnicos» dentro del panel — no aparecen en la vista principal."] },
      { type: "bullets", items: ["Datos — panel lateral rápido: código, deuda, facturas y contactos básicos.","Ficha completa (esta sección) — pestañas reales con contenido separado. Cada pestaña muestra solo su información sin scroll por toda la ficha.","Detalle técnico — sección colapsada dentro de la pestaña Datos. Solo para casos avanzados."] },
      { type: "bullets", items: ["Formas de transferencia — podés registrar uno o más textos que identifican cómo transfiere ese cliente (por ejemplo: 'DOLBY SOCIEDAD ANONIMA', 'ACME SA', 'PETROVIC SOLUTIONS').","Agregá desde la ficha del cliente: sección «Formas de transferencia» — botón Agregar.","Cada alias tiene un campo de texto obligatorio (3-300 caracteres) y una nota opcional.","Podés editar o eliminar cualquier alias en cualquier momento.","Si eliminás un alias, Copilot deja de usarlo para la conciliación Santander a partir del siguiente import.","La búsqueda en la lista de clientes incluye aliases: si buscás 'DOLBY', aparecen los clientes con ese alias aunque el nombre del cliente sea otro.","Si el cliente no tiene aliases pero tiene una forma de transferencia cargada en el sistema anterior, aparece como sugerencia en el estado vacío para que la migrés con el botón Agregar.","Permisos — solo usuarios con rol de escritura pueden agregar, editar o eliminar aliases. Usuarios de solo lectura ven la lista pero no pueden modificarla."] },
      { type: "glossary", entries: [{"term":"Factura emitida","definition":"Se emitió pero aún no fue pagada ni venció."},{"term":"Factura vencida","definition":"Pasó su fecha de vencimiento sin cobro registrado."},{"term":"Factura pagada","definition":"Hay un cobro registrado que la cubre."},{"term":"Cobro registrado","definition":"Pago que el cliente realizó, registrado en el sistema contable."}] },
    ],
  },
  {
    id: "cobranza",
    title: "Cobranza — Hub operativo de cobranza",
    includeInToc: true,
    blocks: [
      { type: "paragraph", text: "Cobranza es el centro operativo de cobranza: KPIs de deuda y efectividad, clientes a gestionar, responsables, agenda de seguimientos, alertas e historial de cobros Zeta. Desde acá llegás a la ficha 360 de cada cliente en un clic." },
      { type: "callout", variant: "info", text: "Tres ratios distintos — no son intercambiables: «Cobranza efectiva aplicada» (Dashboard/Hoy) = ventas del período resueltas al corte. «Cobros registrados / ventas» (Cartera/Finanzas trends) = recibos por fecha sobre ventas. «Cumplimiento» (este hub) = promesas de pago cumplidas, no ventas." },
      { type: "bullets", items: [
        "Pendiente — suma de toda la deuda abierta por moneda (UYU y USD) de todos los clientes.",
        "Atrasado — saldo abierto con más de 7 días desde la fecha de emisión (modelo único de cobranza). Es un subconjunto de Pendiente, separado por moneda.",
        "Clientes atrasados — cantidad de clientes cuya factura abierta más antigua supera los 7 días.",
        "Promesas activas — compromisos de pago con fecha futura pendiente de confirmación.",
      ] },
      { type: "bullets", items: [
        "Cumplimiento de promesas — tasa de promesas cumplidas sobre las promesas cerradas (pagadas + vencidas sin cobrar). No mide cobranza financiera ni ventas. Rojo si < 40%, amarillo si < 70%. '—' cuando no hay promesas cerradas aún.",
        "Cobros este mes (UYU) — total cobrado en pesos en el mes actual, desde recibos sincronizados con Zeta.",
        "Cobros este mes (USD) — total cobrado en dólares en el mes actual.",
        "Contactados — clientes con deuda que tienen al menos una gestión activa con resultado real (contactado, prometió pagar, pagado, disputa o escalado) sobre el total con deuda.",
      ] },
      { type: "bullets", items: [
        "Clientes a gestionar — lista con filtros de antigüedad: Todos, No atrasados, Atrasado 8–14, Atrasado 15–30, Atrasado +30 y Sin gestión. Cada fila muestra un badge según la peor factura abierta y arriba se ven los subtotales Pendiente y Atrasado del conjunto filtrado (separados UYU/USD, consolidados con TC en modo Todo en USD). En mobile: cards verticales. En desktop: tabla.",
        "Filtro 'Sin gestión' — clientes con deuda pero sin ninguna acción de cobranza registrada. Ideal para detectar quién quedó fuera del radar.",
        "Desde cada fila podés ir directamente a la ficha 360 del cliente (Ver cliente) o abrir el asistente de cobranza (Gestionar).",
        "Contacto y próximo seguimiento — en la lista se muestra el email o teléfono principal del cliente (si existe) y la fecha del próximo seguimiento registrado.",
        "Agenda de cobranza — seguimientos atrasados, promesas vencidas, seguimientos de hoy y próximos. Mismo componente que la pestaña Agenda en Cobranza.",
        "Alertas de cobranza — cobros recibidos, clientes atrasados, nuevos deudores y resumen de seguimiento. Cada alerta incluye un enlace directo al cliente o a la lista de atrasados. Máx. 10 alertas.",
        "Historial de cobros — recibos sincronizados desde Zeta, con filtros por período (30 días, este mes, todo), moneda y cliente. Tabla en desktop, cards en mobile. Paginación de 25 por página.",
      ] },
      { type: "bullets", items: [
        "Responsable por cliente — cada cliente en la lista puede tener un responsable asignado. Se muestra como columna en desktop y como línea en mobile.",
        "Filtro 'Mis clientes' — muestra solo los clientes asignados al usuario actual. Útil cuando varios usuarios gestionan grupos de clientes distintos.",
        "Filtro 'Sin asignar' — muestra los clientes que todavía no tienen un responsable definido.",
        "Asignar responsable — botón disponible para usuarios con rol superadmin o cobranza. Abre un modal para seleccionar el responsable de la lista de usuarios activos y opcionalmente agregar una nota. También permite quitar la asignación eligiendo 'Sin asignar'.",
        "Actualización optimista — al asignar o quitar un responsable, la lista se actualiza de inmediato sin recargar la página. Aparece un mensaje de confirmación durante unos segundos.",
      ] },
      { type: "callout", variant: "info", text: "Los cobros de clientes se registran exclusivamente en Zeta. Copilot los muestra en Cobranza cuando la sincronización los trae. No es posible cargar cobros manuales de clientes desde Copilot para evitar duplicados de caja y deuda." },
      { type: "callout", variant: "tip", text: "Cobranza no reemplaza Cartera (análisis por período), Clientes (ficha 360) ni Cobranza (prioridades del día). Es el punto de entrada operativo que une esas tres vistas." },
    ],
  },
  {
    id: "cartera",
    title: "Cartera — Quién te debe y cuánto",
    includeInToc: true,
    blocks: [
      { type: "paragraph", text: "Cartera muestra el dinero que los clientes te deben. Es la vista de cobranza: cuánto hay pendiente, qué está vencido y quiénes tienen más urgencia." },
      { type: "callout", variant: "tip", text: "Al entrar carga el mes actual automáticamente. El selector de período es compacto, con presets: Mes actual, Mes anterior, Trimestre y Personalizado." },
      { type: "callout", variant: "tip", text: "KPIs compactos — indicadores del período en cards neutras. Al tocar Notas crédito UYU/USD se abre un drawer con fórmula, total y filas reales (cliente, comprobante NC, fecha, monto, factura asociada si Zeta la expone). Si no hay detalle en la fuente, mensaje honesto." },
      { type: "callout", variant: "tip", text: "Explorador de clientes — filtros ejecutivos: Todos, Pendientes, Atrasados, Críticos, Sin deuda y moneda UYU/USD. Sin filtros técnicos de sync ni «Desactualizado» en la vista principal." },
      { type: "callout", variant: "info", text: "Cartera ≠ Caja. Lo que ves en Cartera es deuda que los clientes todavía no pagaron. No es plata disponible. Entra en caja solo cuando el cliente paga y el cobro aparece en Zeta. El Dinero disponible viene de Tesorería, no de Cartera." },
      { type: "glossary", entries: [{"term":"Al día","definition":"Facturas que aún no vencieron."},{"term":"1 a 30 días","definition":"Recién vencido. Conviene avisar."},{"term":"31 a 60 días","definition":"Ya lleva un mes. Priorizar el contacto."},{"term":"61 a 90 días","definition":"Problema real. Gestión urgente."},{"term":"Más de 90 días","definition":"Muy difícil de cobrar. Acción inmediata."},{"term":"Cobros registrados / ventas","definition":"Recibos del período por fecha sobre ventas del período. Distinto de Cobranza efectiva aplicada (Dashboard)."}] },
    ],
  },
  {
    id: "tesoreria",
    title: "Tesorería — Caja, pagos y compromisos",
    includeInToc: true,
    blocks: [
      { type: "paragraph", text: "Tesorería es donde cargás y gestionás el dinero operativo: el saldo actual de caja, los egresos y pagos que no vienen de Zeta. Es la fuente del número Dinero disponible que ves en Hoy." },
      { type: "bullets", items: ["No es facturación anual. No es lo que te deben. No es el total cobrado histórico.","Es el punto de partida: la plata que tenés ahora, que vos conocés mejor que nadie.","Se carga en Tesorería — panel de caja disponible — botón Editar saldo actual.","Podés actualizarlo cuando quieras. Cada vez que lo actualizás, la fecha de corte se resetea a ese día.","UYU y USD se cargan por separado."] },
      { type: "bullets", items: ["Si un cliente paga después de que cargaste el saldo, el cobro aparece en Zeta y Copilot lo suma solo al Dinero disponible.","Si el cobro ocurrió antes de la fecha en que cargaste el saldo, no se suma de nuevo — ya estaba incluido en el saldo que cargaste.","Esto evita duplicar: el saldo que cargaste ya refleja todo lo cobrado hasta ese momento.","Los cobros anulados o cancelados no suman aunque tengan fecha posterior."] },
      { type: "bullets", items: ["Registrá en Tesorería los pagos que hacés: sueldos, impuestos, proveedores, gastos operativos.","Los egresos confirmados restan del Dinero disponible desde la fecha en que ocurrieron.","Los pagos programados (fecha futura o sin confirmar) no restan hasta que los ejecutás.","Los ingresos manuales (no de facturas Zeta) también se registran acá y suman al disponible.","Movimientos — entradas y salidas registradas por vos."] },
      { type: "bullets", items: ["Soporta CSV, Excel y PDF Santander con texto extraíble. PDF no usa OCR. El importador reconoce el extracto por la estructura de la tabla aunque el logo Santander no sea texto extraíble.","Usuario y modo demo pueden generar vista previa (no persiste datos). Guardar o importar el extracto requiere superadmin.","Generá un preview antes de guardar: ves fecha, monto, tipo y un estado de coincidencia por fila.","Coincide — el movimiento del banco parece ya estar en Tesorería (y en Zeta si aplica).","Falta en Copilot — hay señal en Zeta o es un cobro en banco sin movimiento equivalente en Tesorería.","Falta en Zeta — está en Tesorería pero no hay recibo Zeta en la ventana de fechas.","Posible coincidencia — monto, fecha o texto parecen relacionados; conviene revisar manualmente.","Cliente sugerido por forma de transferencia — Copilot detectó que la descripción del movimiento contiene el texto de una de las formas de transferencia registradas para ese cliente. Conviene validar antes de confirmar.","Las formas de transferencia se configuran en la ficha de cada cliente (sección Formas de transferencia). Podés registrar varios aliases por cliente.","Si el PDF no puede leerse, exportá CSV o Excel desde Santander.","No modifica caja automáticamente ni crea recibos en Zeta. Guardar solo almacena el extracto para conciliación.","Para impactar caja tenés que crear o confirmar un movimiento de Tesorería por separado."] },
      { type: "bullets", items: ["Cuatro acciones rápidas arriba — Cargar ingreso, Cargar egreso, Nuevo pago programado y Pago recurrente. Al tocar cualquiera se abre el mismo formulario unificado debajo del encabezado, sin scroll al final ni drawers laterales.","Caja — saldo disponible cargado al corte, composición por moneda y Últimos movimientos con filtros (fecha, búsqueda, moneda, tipo) y paginación de 15 por página.","Pagos próximos — resumen UYU/USD (30 días), filtros unificados y listados de programados, recurrentes e historial (15 por página, paginación numerada). No afectan caja hasta confirmarse.","Movimientos — ingresos y egresos confirmados que ajustan tu caja. Incluye importador bancario (extracto CSV/XLSX) y control contable.","Cobranza del mes — recibos cobrados en el período seleccionado, filtrable por fecha y moneda. Solo lectura desde Zeta."] },
      { type: "bullets", items: ["Formularios unificados — ingreso, egreso, pago programado y recurrente comparten el mismo contenedor, espaciado y botones; solo cambian los campos según el tipo.","Pagos próximos — orden: (1) resumen 30 días, (2) barra de filtros, (3) programados, (4) recurrentes, (5) historial pagados/cancelados. Sin botones duplicados de alta en el tab.","Recurrentes — Copilot genera automáticamente cada vencimiento en la lista de próximos pagos. Pausar no borra historial.","Confirmar pago — desde la tabla podés marcar un pago como ejecutado; opcionalmente registra el egreso en caja."] },
      { type: "bullets", items: ["Control contable de movimientos — en la sección Movimientos, cada línea tiene columnas Contabilizado, Asiento Zeta y Coincidencia.","Contabilizado — marcá el movimiento como contabilizado en el sistema contable usando el botón (palomita/cruz).","Asiento Zeta — número y fecha del asiento Zeta correspondiente, si fue cargado manualmente.","Coincidencia — estado de la validación: Pendiente (sin asiento cargado), Coincide (monto y moneda iguales), Mismatch (diferencias), Requiere revisión o Confirmado manualmente."] },
      { type: "bullets", items: ["Filtros contables en Movimientos — botones rápidos para ver solo: Todos, Sin contabilizar, Contabilizados, Coincide, No coincide, Requiere revisión.","Para marcar como contabilizado: hacé clic en el icono de palomita. Para desmarcar: volvé a hacer clic.","El estado de coincidencia es informativo. Copilot no modifica datos en Zeta."] },
      { type: "bullets", items: ["No marca ninguna factura como pagada desde Tesorería.","No modifica datos en Zeta.","No duplica cobros: si el cobro es anterior al saldo cargado, no se suma de nuevo.","UYU y USD se calculan por separado — no se mezclan.","Los cobros de clientes vienen de Zeta; los egresos operativos se registran en Tesorería."] },
      { type: "callout", variant: "tip", text: "Tipo de cambio (TC) — se configura desde Dashboard Resumen al seleccionar 'USD consolidado'. El chip '1 USD = X UYU' y el botón 'Editar TC' solo aparecen en ese modo. No se configura desde Tesorería." },
    ],
  },
  {
    id: "finanzas",
    title: "Panorama financiero — Lectura ejecutiva",
    includeInToc: true,
    blocks: [
      { type: "paragraph", text: "Finanzas es la lectura ejecutiva para CEO: foto actual de caja y deuda, facturación anual, tendencia, clientes que explican la deuda, caja proyectada al cierre del mes y riesgo de cobro. UYU y USD siempre separados — no se convierten ni suman." },
      { type: "callout", variant: "tip", text: "Estado operativo (Hoy) = señales de trabajo pendiente. Riesgo financiero (Finanzas) = lectura de caja y deuda." },
      { type: "bullets", items: [
        "Foto actual — Caja disponible Santander, Deuda actual a cobrar, Atrasado y Riesgo financiero al corte de hoy.",
        "Facturación anual — grid compacto por mes con ventas UYU y ventas USD. Mes cerrado vs mes en curso.",
        "Tendencia anual — barras separadas por moneda (UYU arriba, USD abajo).",
        "Clientes que explican la deuda — Top deudores UYU y Top deudores USD, sin ranking mixto.",
        "Caja proyectada al cierre del mes — siempre por moneda (UYU y USD separados): caja para pagos, cobros esperados, pagos registrados y caja proyectada hasta fin de mes. Incluye mini gráficos Disponible hoy → Después de pagos por moneda. Tres escenarios: conservador (50% de lo pendiente cobrado), esperado (75%) y optimista (100%).",
        "Riesgo de cobro — clientes con atraso, monto atrasado, clientes +30 días y mayor deudor por moneda.",
      ] },
      { type: "callout", variant: "warning", text: "Si Finanzas tarda más de 25 segundos en cargar, aparece automáticamente un mensaje de timeout con el botón Reintentar. Esto puede ocurrir si la conexión es lenta o el servidor está bajo carga. Hacé clic en Reintentar para volver a cargar el informe. Si el problema persiste, revisá la conexión a internet." },
      { type: "callout", variant: "info", text: "Para operar el día a día usá Hoy, Clientes y Cartera. Finanzas no reemplaza la gestión de cobranza. El contenido scrollea con la página principal — no hay barra de scroll interna duplicada." },
    ],
  },
  {
    id: "datos",
    title: "Datos — Consulta de registros base",
    includeInToc: true,
    blocks: [
      { type: "paragraph", text: "Datos es una vista de consulta y auditoría de registros sincronizados desde Zeta. Podés ver clientes, facturas, recibos, pagos y obligaciones fiscales." },
      { type: "callout", variant: "tip", text: "Estados vacíos — cada tabla (clientes, facturas, recibos, etc.) explica por qué no hay registros, qué filtro probar y qué aparecerá cuando haya datos sincronizados." },
      { type: "callout", variant: "info", text: "Datos es solo para consultar y verificar. Para gestión diaria usá Cartera, Tesorería o Cobranza. Lenguaje ejecutivo: sin CTAs duplicados ni bloques técnicos en la vista principal." },
      { type: "bullets", items: [
        "Clientes — directorio completo con datos de contacto.",
        "Facturas — todas las facturas por período, con saldo y estado. Filtros: período, moneda, estado de pago (Vencidas / Pagadas / Con saldo / Todas) y cliente.",
        "Recibos — cobros registrados con número, cliente, monto, moneda y método. Filtros: período, moneda y cliente.",
        "Pagos — pagos fiscales y a proveedores. Filtro de fecha (rango desde/hasta). Solo lectura: los pagos no se pueden crear, editar ni borrar desde Datos.",
        "Obligaciones fiscales — vencimientos tributarios. Filtro de fecha de vencimiento (rango desde/hasta).",
      ] },
      { type: "callout", variant: "warning", text: "Pagos es solo lectura en esta sección. Para crear, editar o borrar pagos, usá Tesorería — Pagos próximos." },
      { type: "paragraph", text: "Si una factura o recibo no muestra moneda (aparece '· sin moneda'), significa que el registro no tiene currency_code registrado. No es un error del sistema: indica que ese dato no llegó desde Zeta. Podés revisarlo directamente en tu sistema contable." },
      { type: "paragraph", text: "Algunos recibos muestran '· vinculación no disponible (Zeta)' en lugar del número de factura. Esto es normal: Zeta no expone el vínculo recibo — factura en su API de cobranzas. El recibo es válido; solo no tiene la referencia de factura disponible." },
      { type: "paragraph", text: "Si buscás un cliente inactivo (archivado) en Datos, podés abrir su ficha completa. La ficha se abre normalmente pero con un aviso amarillo que indica que el cliente está inactivo. Todos los datos históricos se muestran en modo lectura." },
      { type: "bullets", items: [
        "Datos — consulta rápida: código, RUT, teléfono, deuda actual y facturas recientes.",
        "Al tocar un cliente aparece un panel lateral con deuda, facturas, recibos y contactos.",
        "Ver ficha completa — funciona también para clientes inactivos (muestra banner de estado).",
        "Si solo querés confirmar un dato, usá el panel lateral. Si vas a gestionar al cliente, abrí la ficha completa.",
      ] },
    ],
  },
  {
    id: "agentes",
    title: "Agentes IA — Próximamente",
    includeInToc: true,
    blocks: [
      { type: "paragraph", text: "La pantalla Agentes IA está en preparación. Todavía no ejecuta análisis coordinado ni modifica datos." },
      { type: "callout", variant: "info", text: "Hoy y Cobranza ya muestran prioridades con los datos actuales. Los agentes sumarán resúmenes coordinados cuando estén disponibles." },
      { type: "bullets", items: ["Qué harán — leer deuda, caja, cobranza y alertas para ordenar el día en lenguaje claro.","Cómo ayudarán — priorizar clientes, pagos y revisiones de caja con explicación del impacto esperado.","Cuándo verás datos — cuando haya movimiento comercial sincronizado, igual que en Hoy y Dashboard.","Qué no hacen — no pagan, no borran, no envían mensajes automáticamente. Vos decidís cada paso."] },
      { type: "bullets", items: ["Mientras tanto — usá Hoy para operación diaria y Cobranza para tareas concretas.","Dashboard Resumen — análisis ejecutivo del negocio.","Clientes 360 — ficha y cobranza por cliente."] },
    ],
  },
  {
    id: "reportes",
    title: "Reportes — vista en pantalla y PDF",
    includeInToc: true,
    blocks: [
      { type: "paragraph", text: "Reportes centraliza los 6 reportes operativos, organizados en tres grupos: Cobranza, Finanzas y Clientes. Cada reporte tiene dos modos de uso:" },
      { type: "bullets", items: ["Ver reporte — abre una vista previa dentro de Copilot con filtros, resumen de métricas y tabla. Ideal para consulta rápida sin descargar nada.","Generar PDF — descarga el reporte como archivo profesional para enviar, imprimir o archivar.","Ambos modos usan los mismos datos y cálculos. No hay diferencia en los números."] },
      { type: "bullets", items: ["Deudores — clientes con deuda, moneda, antigüedad y contacto. Los filtros se aplican en tiempo real en la vista previa. Cuando el filtro de moneda es 'UYU + USD', el PDF separa los clientes en dos secciones (Pesos y Dólares) sin mezclar monedas.","Cobranza mensual — cobros registrados del mes por moneda. Incluye fecha, número de recibo, cliente e importe.","Caja mensual — movimientos del período con saldo inicial, ingresos, egresos y saldo acumulado. Ingresos en verde, egresos en rojo.","Ventas — detalle de facturas del período por moneda (fecha, número, cliente e importe), con deduplicación de comprobantes Zeta y total al pie.","Ejecutivo mensual — resumen CEO: indicadores clave, top 5 clientes, top 5 deudores, estado de caja y nivel de riesgo (Bajo / Atención / Crítico).","Dashboard Resumen Ejecutivo — PDF del Dashboard por período personalizado: estado financiero (Estable/Atención/Crítico), tabla de 6 KPIs, tendencia mensual, deuda por antigüedad (4 buckets), top 10 deudores, top 10 facturación, estado de cartera, tabla completa de clientes con deuda activa y movimientos del período (máx. 30). Seleccionás período (desde/hasta) y moneda (UYU, USD o ambas).","Clientes principales — ranking ordenable por facturación, deuda total o deuda vencida. Muestra participación y nivel de riesgo por cliente.","Estado de cuenta por cliente — vista previa sin filtro de mes/año: muestra saldos vigentes desde 2026 y selector de moneda (Pesos, Dólares o UYU + USD). El PDF respeta la moneda elegida. Si superás el límite de descargas, verás: «Demasiadas descargas. Esperá unos segundos e intentá de nuevo.»","Estado de cuenta individual — se genera desde la ficha de cada cliente (pestaña Estado de cuenta).","Los reportes son de solo lectura: no modifican facturas, caja ni gestiones.","Nunca se suman UYU + USD entre sí: cada moneda tiene su propia sección en el PDF, sin conversión ni combinación."] },
    ],
  },
  {
    id: "operacional",
    title: "Estado del sistema — Sincronización y salud técnica",
    includeInToc: true,
    blocks: [
      { type: "paragraph", text: "El estado del sistema y la salud de los datos se consultan en Alertas (avisos de sincronización) y en Datos (tablas y registros). Ya no hay una pantalla Operacional separada." },
      { type: "callout", variant: "info", text: "Al entrar verás Confianza del dato: última actualización, cantidad de clientes/facturas/recibos sincronizados y si hay conflictos." },
      { type: "bullets", items: ["Cuándo fue la última actualización de datos.","Si la conexión con el sistema contable está funcionando.","Cuántas actualizaciones salieron bien y cuántas fallaron.","El estado general de los flujos de datos."] },
    ],
  },
  {
    id: "estado",
    title: "Estado: Atención / Estable / Crítico",
    includeInToc: true,
    blocks: [
      { type: "paragraph", text: "El estado del negocio aparece en la parte superior de la pantalla y en páginas como Hoy y Alertas. Te indica de un vistazo si todo está bien o si hay algo para atender." },
      { type: "callout", variant: "tip", text: "Al tocar o hacer clic sobre el estado se despliega el detalle: qué alertas están activas, cuáles son críticas y cuáles son solo informativas." },
      { type: "status", entries: [{"level":"ok","title":"Estable","description":"Todo está dentro de lo esperado. Podés operar con normalidad."},{"level":"warning","title":"Atención","description":"Hay algo para revisar. No es urgente, pero conviene no ignorarlo. Tocar el estado muestra el detalle."},{"level":"critical","title":"Crítico","description":"Hay algo importante que puede afectar caja, pagos o la calidad de los datos. Revisarlo pronto."}] },
    ],
  },
  {
    id: "campana",
    title: "Campana de notificaciones",
    includeInToc: true,
    blocks: [
      { type: "paragraph", text: "La campana aparece en la parte superior de la pantalla. Cuando tiene un número rojo, significa que hay novedades sin leer." },
      { type: "bullets", items: [
        "Cobro recibido (collection_received) — un cliente pagó su deuda total o realizó un pago parcial.",
        "Cliente atrasado (client_overdue) — un cliente tiene deuda vencida. Si tiene varias facturas atrasadas en la misma moneda, aparece una sola alerta con el total agrupado.",
        "Resumen diario de deuda vencida (debt_followup_summary) — una vez por día, un resumen con la cantidad de clientes con deuda atrasada y el monto total por moneda. Reemplaza las alertas individuales cuando hay varios deudores.",
        "Nuevo saldo pendiente (new_debtor) — un cliente tiene deuda por primera vez o re-emerge después de haber saldado.",
        "Cliente saldó su deuda (client_debt_settled) — el saldo abierto de un cliente quedó en cero.",
        "Pago próximo (treasury_payment_due) — un pago programado en Tesorería vence en los próximos 7 días.",
        "Pago atrasado (treasury_payment_overdue) — un pago programado pasó su fecha sin registrarse.",
        "Riesgo de caja (cash_risk_detected) — la caja disponible no alcanza para cubrir los compromisos programados hasta el cierre del mes.",
      ] },
      { type: "callout", variant: "info", text: "Si la campana no muestra notificaciones, puede ser normal: las notificaciones se generan automáticamente una vez por día. Si el sistema recién fue configurado o no hay movimiento reciente, la campana puede aparecer vacía hasta el próximo ciclo de actualización." },
      { type: "bullets", items: ["Tocar el botón de la campana abre el panel de notificaciones.","Cada notificación tiene un link para ir directo al detalle.","«Marcar todas como leídas» quita el número rojo — no borra las notificaciones.","«Ver todas» lleva al listado completo en Alertas."] },
    ],
  },
  {
    id: "problemas",
    title: "¿Qué hacer si algo aparece en rojo?",
    includeInToc: true,
    blocks: [
      { type: "paragraph", text: "Ver algo en rojo no significa que el negocio está en crisis. Puede ser una alerta importante o simplemente un dato para revisar." },
      { type: "bullets", items: [
        "Deuda vencida en rojo — hay clientes con facturas cuya fecha de vencimiento ya pasó. Abrí la ficha del cliente desde Clientes y contactalo.",
        "Caja proyectada en rojo — los compromisos hasta el cierre del mes superan la caja disponible. Revisá Tesorería para ajustar pagos o registrar ingresos.",
        "Pago atrasado en rojo — hay un pago programado en Tesorería que ya pasó su fecha. Entrá a Tesorería — Pagos próximos y confirmalo o cancalalo.",
        "Estado Crítico en Finanzas o Dashboard — tres o más clientes de riesgo alto, o la caja proyectada queda negativa. Priorizá las acciones recomendadas en Hoy.",
        "Finanzas no carga (timeout) — si aparece un mensaje de error con el botón Reintentar, hacé clic en él. El informe tiene un límite de 25 segundos; si la conexión es lenta puede tardar más.",
        "Campana sin notificaciones — puede ser normal. Las notificaciones se generan una vez por día. Si el sistema fue configurado recientemente, la campana puede estar vacía hasta el primer ciclo.",
      ] },
    ],
  },
  {
    id: "roles-permisos",
    title: "Roles y permisos",
    includeInToc: true,
    blocks: [
      { type: "paragraph", text: "Copilot tiene dos roles principales: Superadmin y Usuario. El acceso detallado a cada módulo se configura con permisos Ver y Modificar desde el Panel administrativo." },
      { type: "roles", entries: [{"role":"superadmin","label":"Superadmin","description":"Acceso total. Puede leer y modificar cualquier dato de la empresa. El único que puede administrar usuarios, roles y permisos."},{"role":"usuario","label":"Usuario","description":"Rol base. El acceso a cada módulo se define individualmente con los permisos Ver y Modificar. Por defecto: solo lectura en todo."}] },
      { type: "callout", variant: "info", text: "Los permisos se configuran por módulo desde el Panel administrativo (solo superadmin). Ver da acceso de lectura; Modificar da acceso de escritura e incluye Ver automáticamente. Sin ninguno de los dos, el módulo no aparece en el menú." },
      { type: "bullets", items: ["Navegar por todas las secciones permitidas según rol y permisos.","Ver dashboards, fichas de clientes, movimientos y deuda (donde haya acceso de lectura).","Abrir reportes en pantalla y descargar PDFs — son operaciones de lectura.","Generar vista previa del importador Santander — no guarda ni modifica caja.","Consultar alertas, notificaciones y Agentes IA."] },
      { type: "bullets", items: ["Cargar ingresos, egresos o ajustes en Tesorería (requiere permiso Modificar en Tesorería o superadmin).","Registrar gestiones de cobranza (requiere permiso Modificar en Cobranza o superadmin).","Ejecutar sincronizaciones manuales (solo superadmin).","Crear, editar o eliminar usuarios (solo superadmin vía Panel administrativo).","Acceder al Panel administrativo (solo superadmin)."] },
      { type: "bullets", items: ["Reporte de deudores.","Cobranza mensual.","Caja mensual.","Ventas.","Ejecutivo mensual.","Clientes principales.","Estado de cuenta masivo (desde Reportes, por moneda).","Estado de cuenta individual (desde la ficha de cada cliente)."] },
    ],
  },
  {
    id: "admin",
    title: "Panel administrativo",
    includeInToc: true,
    blocks: [
      { type: "paragraph", text: "El Panel administrativo es exclusivo del superadmin. Permite crear usuarios, asignar roles y configurar qué puede ver y modificar cada persona en la empresa. Interfaz compacta con lenguaje ejecutivo." },
      { type: "callout", variant: "warning", text: "Solo superadmin puede acceder a /copilot/admin. Cualquier otro usuario que intente entrar es redirigido a Hoy." },
      {
        type: "subsection",
        title: "Cómo crear un usuario",
        blocks: [
          { type: "steps", items: ["Ir a Panel administrativo — Nuevo usuario.","Ingresar email, nombre completo y rol (Superadmin o Usuario).","Indicar un PIN temporal o dejarlo vacío para que se genere automáticamente.","Hacer clic en Crear usuario.","El PIN temporal se muestra UNA SOLA VEZ — anotarlo y entregarlo al usuario de forma segura.","El usuario puede cambiar su PIN luego desde el perfil (si aplica) o el superadmin puede resetearlo."] },
        ],
      },
      {
        type: "subsection",
        title: "Roles disponibles",
        blocks: [
          { type: "bullets", items: ["Superadmin — acceso total a todos los módulos. Puede gestionar usuarios, roles y permisos. El único que accede al Panel administrativo.","Usuario — rol base de solo lectura. Puede navegar, consultar y descargar reportes. No puede modificar datos operativos."] },
        ],
      },
      {
        type: "subsection",
        title: "Qué significa cada nivel de acceso",
        blocks: [
          { type: "bullets", items: ["Sin acceso — el módulo desaparece del menú lateral y la URL queda bloqueada. Si el usuario intenta entrar manualmente, el sistema lo redirige a Hoy o muestra un mensaje de acceso denegado.","Ver — puede navegar, ver datos y descargar PDFs del módulo.","Modificar — puede leer y también crear, editar o eliminar registros en ese módulo. Marcar Modificar activa Ver automáticamente."] },
        ],
      },
      {
        type: "subsection",
        title: "Cómo editar permisos de un usuario",
        blocks: [
          { type: "steps", items: ["En la tabla de usuarios, hacer clic en el ícono de lápiz (Editar permisos).","Se abre un modal con la tabla de módulos.","Marcar Ver para dar acceso de lectura a un módulo. Marcar Modificar para dar acceso de escritura (incluye Ver automáticamente). Desmarcar Ver quita ambos accesos.","Hacer clic en Guardar cambios.","Los cambios aplican en el próximo acceso del usuario (o inmediatamente si recarga la página)."] },
        ],
      },
      {
        type: "subsection",
        title: "Cómo resetear el PIN de un usuario",
        blocks: [
          { type: "steps", items: ["En la tabla de usuarios, hacer clic en el ícono de llave (Resetear PIN).","Confirmar la acción en el popup.","El nuevo PIN temporal se muestra una sola vez.","La sesión activa del usuario se invalida automáticamente."] },
        ],
      },
      {
        type: "subsection",
        title: "Cómo eliminar un usuario",
        blocks: [
          { type: "steps", items: ["En la tabla de usuarios, hacer clic en el ícono de papelera (Eliminar usuario).","Se abre un modal de confirmación.","Escribir ELIMINAR para confirmar.","Hacer clic en Eliminar usuario.","El usuario pasa a Inactivo y pierde acceso inmediatamente. Aparece un mensaje de confirmación en pantalla."] },
          { type: "callout", variant: "warning", text: "No podés eliminar el último administrador activo. El sistema lo bloquea y muestra el mensaje correspondiente." },
        ],
      },
      {
        type: "subsection",
        title: "Recomendaciones de seguridad",
        blocks: [
          { type: "bullets", items: ["No compartir la cuenta superadmin entre varias personas.","Crear una cuenta separada para cada persona del equipo.","Mantener siempre al menos un superadmin activo (el sistema lo bloquea si intentás eliminar el último).","El PIN temporal que se muestra al crear o resetear un usuario debe entregarse en forma segura (no por email sin encriptar).","Revisar periódicamente la lista de usuarios activos y eliminar accesos que ya no correspondan."] },
        ],
      },
    ],
  },
  {
    id: "inicio-sesion",
    title: "Inicio de sesión",
    includeInToc: true,
    blocks: [
      { type: "paragraph", text: "El acceso a Copilot es con usuario y PIN en la pantalla de login. No usa enlaces externos ni registro público." },
      { type: "steps", items: ["Ir a /login.","Ingresar Usuario y PIN provistos por quien administra la empresa.","Pulsar Entrar.","Si las credenciales son válidas, Copilot redirige a /copilot/hoy."] },
      { type: "bullets", items: ["Superadmin, usuario y demo_readonly usan el mismo formulario; el rol define permisos después del login.","En solo lectura verás un badge en la barra superior (Solo lectura o Demo en móvil).","Superadmin no tiene badge y puede modificar datos operativos."] },
    ],
  },
  {
    id: "importador-santander",
    title: "Importador bancario Santander",
    includeInToc: true,
    blocks: [
      { type: "paragraph", text: "En Tesorería — Movimientos podés subir extractos CSV, Excel o PDF exportados desde Santander para conciliar con Copilot y Zeta." },
      { type: "bullets", items: ["Formatos: CSV, Excel (XLSX) y PDF con texto extraíble (sin OCR).","Detección USD y UYU según el extracto.","Usuario y demo_readonly: vista previa permitida (no persiste ni modifica caja).","Guardar o importar extracto: solo superadmin.","Cuenta del extracto debe ser compatible con la cuenta seleccionada; si no, el guardado se bloquea.","Estados por fila: Coincide, Falta en Copilot, Falta en Zeta, Posible coincidencia.","Preview no crea recibos en Zeta ni movimientos de caja automáticos.","Para impactar caja registrá o confirmá el movimiento en Tesorería por separado."] },
      { type: "callout", variant: "warning", text: "Guardar requiere superadmin. La vista previa no modifica caja." },
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
        blocks: [
          { type: "steps", items: ["Abrí Hoy — operación diaria. Muestra caja disponible, deuda de clientes y prioridad del día.","Mirá Cobranza — ahí están las cosas concretas que conviene hacer: clientes a llamar, cobros a registrar.","Si hay clientes vencidos — abrí su ficha y contactá por WhatsApp o email directamente desde Copilot.","Si hay pagos próximos — entrá a Tesorería para ver caja real y confirmar que estén cubiertos.","Si querés análisis y reportes — Dashboard Resumen o Finanzas; Cartera para deuda detallada y antigüedad."] },
        ],
      },
      {
        type: "subsection",
        title: "Flujo recomendado del día",
        blocks: [
          { type: "paragraph", text: "Si solo tenés 10 minutos, hacé esto en orden." },
          { type: "steps", items: [] },
        ],
      },
    ],
  },
  {
    id: "helpdesk",
    title: "Mesa de ayuda",
    includeInToc: true,
    blocks: [
      { type: "paragraph", text: "La Mesa de ayuda (/copilot/mesa-de-ayuda) te permite enviar sugerencias, reportar problemas y pedir nuevas funcionalidades al equipo. Todos los usuarios con acceso al módulo pueden crear tickets." },
      { type: "bullets", items: [
        "Sugerencia — una idea o propuesta de mejora.",
        "Bug / Error — algo que no funciona como debería.",
        "Mejora — algo que funciona pero podría hacerse mejor.",
        "Consulta — una pregunta sobre cómo usar el sistema.",
        "Cambio de diseño — cambio visual o de interfaz.",
        "Nueva funcionalidad — pedido de una funcionalidad nueva que no existe hoy.",
        "Otro — cualquier cosa que no encaje en las categorías anteriores.",
      ] },
      { type: "bullets", items: [
        "Nuevo — ticket recién creado, aún no revisado.",
        "En revisión — el equipo está analizando la solicitud.",
        "Aprobado — fue aceptado para trabajarse.",
        "Planificado — está en el roadmap con fecha tentativa.",
        "En desarrollo — se está implementando actualmente.",
        "Resuelto — fue resuelto o cerrado.",
        "Publicado — la funcionalidad o corrección ya está disponible en el sistema.",
        "Rechazado — no se va a implementar; puede incluir una nota explicando el motivo.",
      ] },
      { type: "callout", variant: "tip", text: "Respuesta del equipo — cuando un ticket queda en estado Resuelto, Publicado o Rechazado, el administrador puede agregar una nota de cierre que explica qué se hizo o por qué se rechazó. Esa nota aparece visible para vos en el detalle del ticket." },
      { type: "callout", variant: "tip", text: "Ir al módulo relacionado — si tu ticket está vinculado a un módulo (por ejemplo, Tesorería o Cobranza), el detalle muestra un botón directo para ir a ese módulo sin navegar manualmente." },
    ],
  },
  {
    id: "faq",
    title: "Preguntas frecuentes",
    includeInToc: true,
    blocks: [
      {
        type: "subsection",
        title: "¿Copilot reemplaza a mi contador?",
        blocks: [
          { type: "paragraph", text: "No. Copilot te ayuda a leer la situación del negocio y tomar decisiones. Tu contador sigue siendo quien valida, cierra y declara." },
        ],
      },
      {
        type: "subsection",
        title: "¿Por qué Finanzas y Tesorería pueden mostrar números distintos?",
        blocks: [
          { type: "paragraph", text: "Finanzas muestra proyecciones y acumulados históricos. Tesorería muestra la caja operativa que registraste. Son perspectivas distintas del mismo negocio." },
        ],
      },
      {
        type: "subsection",
        title: "¿Qué significa Estado: Atención?",
        blocks: [
          { type: "paragraph", text: "Que hay algo para revisar. No es una emergencia, pero conviene leer el detalle y ver si hay acciones pendientes." },
        ],
      },
      {
        type: "subsection",
        title: "¿Qué pasa si el sistema contable falla?",
        blocks: [
          { type: "paragraph", text: "Copilot usa los últimos datos disponibles y muestra el problema en Alertas. Los datos anteriores siguen siendo válidos. El sistema se recupera solo cuando la conexión vuelve." },
        ],
      },
      {
        type: "subsection",
        title: "¿Cada cuánto se actualizan los datos?",
        blocks: [
          { type: "paragraph", text: "Los datos críticos (saldos, facturas, recibos) se actualizan automáticamente cada 2 horas." },
        ],
      },
      {
        type: "subsection",
        title: "¿Qué significa marcar una alerta como leída?",
        blocks: [
          { type: "paragraph", text: "Que ya la viste. No borra la alerta — queda en el historial para consultarla cuando quieras." },
        ],
      },
      {
        type: "subsection",
        title: "¿Dónde veo quién me debe?",
        blocks: [
          { type: "paragraph", text: "En Cartera (/copilot/cartera) y Clientes (/copilot/clientes)." },
        ],
      },
      {
        type: "subsection",
        title: "¿Dónde veo qué tengo que pagar?",
        blocks: [
          { type: "paragraph", text: "En Tesorería — Pagos (/copilot/tesoreria?section=pagos)." },
        ],
      },
      {
        type: "subsection",
        title: "¿Dónde veo qué hacer primero?",
        blocks: [
          { type: "paragraph", text: "En Cobranza (/copilot/cobranza)." },
        ],
      },
      {
        type: "subsection",
        title: "¿Dónde veo si los datos están actualizados?",
        blocks: [
          { type: "paragraph", text: "En Alertas (/copilot/alertas) y Datos (/copilot/datos)." },
        ],
      },
      {
        type: "subsection",
        title: "¿Qué pasa si Finanzas o Cartera no terminan de cargar?",
        blocks: [
          { type: "paragraph", text: "Si el informe tarda más de 25 segundos, aparece automáticamente un mensaje de error con el botón Reintentar. Hacé clic en él para volver a intentar la carga. Si el problema persiste, verificá tu conexión a internet. En entornos de desarrollo esto puede ocurrir más seguido; en producción es poco frecuente." },
        ],
      },
      {
        type: "subsection",
        title: "¿Por qué la campana está vacía?",
        blocks: [
          { type: "paragraph", text: "Las notificaciones se generan automáticamente una vez por día. Si el sistema fue configurado recientemente o no hubo actividad nueva, la campana puede aparecer vacía. Esto es normal — no indica un error. Las alertas aparecerán en el próximo ciclo de generación automática." },
        ],
      },
      {
        type: "subsection",
        title: "¿Los agentes pueden modificar datos?",
        blocks: [
          { type: "paragraph", text: "No. En esta versión solo leen información y sugieren acciones. Vos decidís qué hacer." },
        ],
      },
      {
        type: "subsection",
        title: "¿El agente envía WhatsApp o emails?",
        blocks: [
          { type: "paragraph", text: "No. Puede llevarte al cliente o a la acción correspondiente, pero no envía mensajes automáticamente." },
        ],
      },
      {
        type: "subsection",
        title: "¿Qué pasa si Zeta falla y uso el agente?",
        blocks: [
          { type: "paragraph", text: "El agente puede mostrar información con los últimos datos disponibles y recomendar revisar Alertas. No inventa datos nuevos." },
        ],
      },
      {
        type: "subsection",
        title: "Copié o envié un mensaje al cliente. ¿Qué hago ahora?",
        blocks: [
          { type: "paragraph", text: "Si usaste la card Enviar estado de cuenta, Copilot te va a ofrecer el botón Registrar gestión automáticamente. Hacé clic, revisá el pre-llenado (canal y nota) y guardá. Si no usaste esa card, abrí la ficha del cliente, andá a Gestión de cobranza y registrá manualmente: canal, resultado (por ejemplo 'Contactado') y una nota. Eso queda en el historial y lo usan Cobranza y Agentes para saber que el cliente ya fue contactado." },
        ],
      },
      {
        type: "subsection",
        title: "¿Registrar una gestión modifica la deuda del cliente?",
        blocks: [
          { type: "paragraph", text: "No. Registrar una gestión es solo un seguimiento operativo. No modifica facturas, saldos ni pagos. Para marcar un pago, hacelo desde el sistema contable (Zeta)." },
        ],
      },
      {
        type: "subsection",
        title: "¿Qué pasa si un cliente prometió pagar?",
        blocks: [
          { type: "paragraph", text: "Copilot lo muestra como seguimiento de baja prioridad mientras la fecha no llegó. Si llega la fecha y la deuda sigue abierta, lo muestra como prioridad crítica para que lo verifiques. Registrar una promesa de pago no marca ninguna factura como pagada." },
        ],
      },
      {
        type: "subsection",
        title: "¿Qué pasa si cargo una fecha de próximo seguimiento?",
        blocks: [
          { type: "paragraph", text: "Cuando llega ese día, Copilot lo muestra como prioridad alta en los Agentes y en Cobranza. Es un recordatorio operativo — no ejecuta ninguna acción automática." },
        ],
      },
      {
        type: "subsection",
        title: "¿Qué es la Agenda de cobranza y cómo la uso?",
        blocks: [
          { type: "paragraph", text: "La Agenda de cobranza está integrada en Cobranza (/copilot/cobranza). También aparece resumida en Hoy: una card con counts de vencidos, hoy, próximos y promesas. Filtrá por categoría y hacé clic en Ver cliente para ir a la ficha. Solo muestra lo que vos registraste — no genera datos ni modifica deuda." },
        ],
      },
    ],
  },
  {
    id: "dashboard",
    title: "Dashboard Resumen — Análisis ejecutivo consolidado",
    includeInToc: true,
    blocks: [
      { type: "paragraph", text: "Dashboard Resumen es la vista de análisis y reportes: ventas, cobros, deuda, caja y evolución mensual. Complementa a Hoy (operación del día) y a Finanzas (análisis profundo): KPIs consolidados con gráficos interactivos." },
      { type: "callout", variant: "info", text: "Fuente y trazabilidad — misma tira compacta que Hoy: Fuente Zeta, última actualización relativa y período seleccionado." },
      { type: "callout", variant: "tip", text: "Si el período no tiene movimiento, un estado vacío explica por qué, qué hacer y qué verás cuando haya datos." },
      { type: "callout", variant: "tip", text: "Usá el filtro de moneda (UYU / USD / UYU + USD / Todo en USD) y el selector de período para ajustar la lectura. Los gráficos de tendencia muestran un bucket por mes para cada mes del período seleccionado." },
      { type: "bullets", items: ["Resultado del período — bloque superior con tres cards: Ventas del período, Cobrado aplicado y Pendiente del período. Todas dependen del rango Desde/Hasta y usan la misma reconciliación que Cartera.","Situación actual — bloque inferior con cuatro cards: Deuda actual a cobrar total, Deuda vencida, Caja disponible Santander y Caja proyectada. Son foto al día de hoy; no se recalculan solo con el rango seleccionado.","Ventas del período — facturas emitidas dentro del rango, neto de notas de crédito.","Cobrado aplicado — cobros imputados contra facturas del período (facturado neto menos saldo pendiente al cierre del rango).","Pendiente del período — saldo pendiente de facturas del período al cierre (= ventas del período − cobrado aplicado).","Deuda actual a cobrar total — total adeudado por clientes, incluyendo saldos de períodos anteriores.","Deuda vencida — parte de la deuda actual con vencimiento ya superado.","Caja disponible Santander — dinero operativo en Tesorería ahora.","Caja proyectada — caja disponible menos pagos programados próximos."] },
      { type: "callout", variant: "info", text: "UYU y USD nunca se suman ni se convierten sin TC explícito. Con 'UYU + USD (separado)', cada gráfico se muestra en dos bloques independientes (UYU y USD), cada uno con su propia escala. Con 'USD consolidado', todos los valores se convierten a USD usando el TC configurado." },
      { type: "callout", variant: "info", text: "En modo UYU + USD (separado) o USD consolidado, el Dashboard muestra un aviso: vista actualizada desde Zeta; en consolidado se usa el tipo de cambio configurado." },
      { type: "bullets", items: ["Todo en USD — convierte todos los KPIs y gráficos a dólares usando un tipo de cambio manual (pesos por 1 USD). Es conversión visual para lectura ejecutiva; los datos originales UYU/USD no se alteran en Zeta.","Tipo de cambio — visible al elegir Todo en USD. Chip «1 USD = X UYU» y botón Editar TC. Debe ser un número entre 0,01 y 999,99.","PDF deshabilitado en Todo en USD — el botón Descargar PDF no está disponible en ese modo porque el reporte PDF no soporta la conversión consolidada. Usá UYU, USD o UYU + USD para exportar.","UYU + USD (separado) — cada métrica y gráfico en dos bloques independientes, sin conversión.","Solo UYU o Solo USD — filtra a una moneda."] },
      { type: "bullets", items: ["[1] Ventas por mes — evolución mensual de facturación neta del período seleccionado. Con 'UYU + USD (separado)': dos gráficos separados (UYU y USD) con escalas independientes.","[2] Cobros por mes — evolución mensual de cobros reales. Mismo comportamiento que [1].","[3] Ventas vs Cobros — facturado vs cobrado para el período. Incluye el chip 'Cobranza aplicada: X% · Pendiente del período: Y%' (cobranza efectiva aplicada — ventas resueltas al corte, no recibos por fecha). Con 'UYU + USD (separado)': dos gráficos separados (UYU y USD).","[4] Deuda por antigüedad — distribución del saldo vencido por bucket basado en fecha de vencimiento: 0—30d, 31—60d, 61—90d, +90d. Con 'UYU + USD (separado)': dos gráficos separados.","[5] Top 10 deudores — con moneda 'UYU + USD (separado)' se muestran dos bloques (UYU y USD). El subtítulo indica qué porcentaje del total de deuda de esa moneda concentran los top 10.","[6] Top 10 facturación histórica — con 'UYU + USD (separado)', dos bloques UYU/USD. Histórico total por cliente.","[7] Estado de cartera — 4 indicadores de clientes: Clientes activos, Con deuda activa, Con deuda vencida (ámbar), Al día (verde). Los clientes se cuentan una sola vez aunque tengan deuda en más de una moneda. También muestra cartera pendiente UYU y USD por separado.","[9] Caja proyectada al cierre del mes — línea de caja disponible hoy y proyección después de pagos programados hasta fin de mes.","[10] Efectividad de cobros — porcentaje de lo facturado que fue cobrado en el período (cobrado / facturado)."] },
      { type: "callout", variant: "warning", text: "El gráfico [6] 'Top 10 facturación' usa facturación histórica total del portafolio porque no hay API por período por cliente. El badge 'Histórico total' lo indica. Para facturación del período usá Reportes — Ventas." },
      { type: "bullets", items: ["Resumen ejecutivo — banner coloreado con estado del negocio: 'Estado financiero: Estable / Atención / Crítico'. Incluye una tabla compacta de KPIs (facturado, cobrado, pendiente del período, cartera pendiente actual, deuda vencida, caja disponible) con valores UYU y USD en la misma fila. Máximo 3 chips: riesgo principal, señal positiva y acción sugerida.","Chip de deuda vencida — en modo UYU + USD (separado) muestra importes por moneda (ej. 'Vencido: $ X UYU · U$S Y USD') sin sumar UYU y USD. En solo UYU o solo USD muestra una moneda. En USD consolidado usa el TC visible y el sufijo '(cons.)'.","Estado Estable — sin deuda vencida, sin clientes de riesgo alto y caja positiva después de pagos.","Estado Atención — hay al menos un cliente de riesgo alto, o hay deuda vencida, o la caja proyectada baja respecto a la caja disponible.","Estado Crítico — 3 o más clientes de riesgo alto, o la caja proyectada queda negativa."] },
      { type: "bullets", items: ["Clientes con deuda activa — todos los clientes con saldo pendiente, una fila por moneda. Columnas: cliente, moneda, deuda activa, deuda vencida, días de atraso, estado y acciones. Muestra los 10 primeros; 'Ver todos' expande la lista completa.","Movimientos recientes del período — facturas, recibos y notas de crédito del período seleccionado. Columnas: fecha, tipo, cliente, comprobante, moneda, debe, haber y saldo pendiente. Respeta el filtro de moneda. Muestra los 10 últimos; 'Ver todos' expande."] },
      { type: "bullets", items: ["Período — elegís el rango de fechas. Por defecto muestra el mes actual al día de hoy. Si cambiás el período, los KPIs facturado, cobrado y pendiente del período se recalculan para ese rango. La sección de tendencia mensual muestra el rango completo seleccionado.","Moneda — 'UYU + USD (separado)' muestra UYU y USD por separado en cada card y gráfico, sin conversión ni suma. 'Solo UYU' o 'Solo USD' filtran a una moneda. 'USD consolidado' convierte todo a USD con TC.","Los filtros no afectan Cartera pendiente actual (que siempre es all-outstanding al corte) ni el gráfico [6] (histórico total)."] },
      { type: "bullets", items: ["Descargar PDF — el botón en el encabezado del Dashboard genera un PDF del período actualmente seleccionado. La moneda del PDF coincide con la seleccionada en pantalla. El tipo de cambio solo se imprime en PDFs generados en modo USD consolidado. El mismo PDF puede generarse desde Reportes — Dashboard Resumen Ejecutivo."] },
      { type: "callout", variant: "info", text: "Dashboard es análisis y reportes. Para operar el día a día usá Hoy; para gestionar deuda y caja, Cartera y Tesorería." },
    ],
  },
  {
    id: "mesa-de-ayuda",
    title: "Mesa de ayuda — Sugerencias y soporte",
    includeInToc: true,
    blocks: [
      { type: "paragraph", text: "La Mesa de ayuda es el canal para pedir mejoras, reportar problemas o hacer consultas sobre Copilot. Tus pedidos llegan directamente al equipo y podés hacer seguimiento del estado." },
      { type: "callout", variant: "tip", text: "Cuanto más detalle incluyas (módulo afectado, qué esperabas, qué pasó, captura de pantalla), más rápido podemos entenderte y ayudarte." },
      { type: "bullets", items: [
        "Sugerencia — una idea para mejorar algo que ya existe o agregar algo nuevo.",
        "Bug / Error — algo no funciona como debería.",
        "Mejora — cambio específico en una funcionalidad existente.",
        "Consulta — una pregunta sobre cómo usar el sistema.",
        "Cambio de diseño — pedido de cambio visual o de flujo.",
        "Otro — cualquier cosa que no encaje en las anteriores.",
      ]},
      { type: "subsection", title: "¿Cómo crear un ticket?", blocks: [
        { type: "paragraph", text: "Entrá a Mesa de ayuda desde el menú lateral (sección Sistema). Hacé clic en 'Nuevo ticket', completá el título, la descripción y elegí el tipo, módulo y prioridad. Si tenés una captura, adjuntala usando el botón de adjuntos. Al enviar, vas a ver el detalle del ticket recién creado." },
        { type: "callout", variant: "tip", text: "Para adjuntar una captura: hacé clic en 'Adjuntar imagen o PDF', seleccioná el archivo (PNG, JPG o WebP). El límite por archivo es 10 MB." },
      ]},
      { type: "subsection", title: "¿Qué significan los estados?", blocks: [
        { type: "bullets", items: [
          "Nuevo — el ticket fue recibido y está en la cola.",
          "En revisión — alguien del equipo lo está evaluando.",
          "Aprobado — se aprobó la implementación o cambio.",
          "En desarrollo — está siendo trabajado activamente.",
          "Resuelto — el pedido fue implementado o respondido.",
          "Rechazado — el pedido no procede; va a haber una explicación en los comentarios.",
        ]},
      ]},
      { type: "subsection", title: "¿Cómo hacer seguimiento?", blocks: [
        { type: "paragraph", text: "Desde la lista de tickets podés ver el estado de cada uno. Al hacer clic en un ticket, ves el detalle completo, los comentarios del equipo y los adjuntos. Si tenés algo para agregar, podés comentar directamente en el ticket." },
      ]},
    ],
  },
  {
    id: "glosario",
    title: "Glosario — Términos de deuda de clientes",
    includeInToc: true,
    blocks: [
      { type: "paragraph", text: "Referencia rápida de los términos que Copilot usa para describir la deuda de clientes. Cada término tiene un significado preciso para evitar confusión entre saldo, vencimiento y estado." },
    ],
  },
];

export const COPILOT_MANUAL_FIVE_MINUTE_STEPS: string[] = [
  "Abrí Hoy — operación diaria. Muestra caja disponible, deuda de clientes y prioridad del día.",
  "Mirá Cobranza — ahí están las cosas concretas que conviene hacer: clientes a llamar, cobros a registrar.",
  "Si hay clientes vencidos — abrí su ficha y contactá por WhatsApp o email directamente desde Copilot.",
  "Si hay pagos próximos — entrá a Tesorería para ver caja real y confirmar que estén cubiertos.",
  "Si querés análisis y reportes — Dashboard Resumen o Finanzas; Cartera para deuda detallada y antigüedad."
];

export const COPILOT_MANUAL_DAILY_FLOW = [] as const;

export const COPILOT_MANUAL_FAQ: Array<{ q: string; a: string }> = [
  {
    "q": "¿Copilot reemplaza a mi contador?",
    "a": "No. Copilot te ayuda a leer la situación del negocio y tomar decisiones. Tu contador sigue siendo quien valida, cierra y declara."
  },
  {
    "q": "¿Por qué Finanzas y Tesorería pueden mostrar números distintos?",
    "a": "Finanzas muestra proyecciones y acumulados históricos. Tesorería muestra la caja operativa que registraste. Son perspectivas distintas del mismo negocio."
  },
  {
    "q": "¿Qué significa Estado: Atención?",
    "a": "Que hay algo para revisar. No es una emergencia, pero conviene leer el detalle y ver si hay acciones pendientes."
  },
  {
    "q": "¿Qué pasa si el sistema contable falla?",
    "a": "Copilot usa los últimos datos disponibles y muestra el problema en Alertas. Los datos anteriores siguen siendo válidos. El sistema se recupera solo cuando la conexión vuelve."
  },
  {
    "q": "¿Cada cuánto se actualizan los datos?",
    "a": "Los datos críticos (saldos, facturas, recibos) se actualizan automáticamente cada 2 horas."
  },
  {
    "q": "¿Qué significa marcar una alerta como leída?",
    "a": "Que ya la viste. No borra la alerta — queda en el historial para consultarla cuando quieras."
  },
  {
    "q": "¿Dónde veo quién me debe?",
    "a": "En Cartera (/copilot/cartera) y Clientes (/copilot/clientes)."
  },
  {
    "q": "¿Dónde veo qué tengo que pagar?",
    "a": "En Tesorería — Pagos (/copilot/tesoreria?section=pagos)."
  },
  {
    "q": "¿Dónde veo qué hacer primero?",
    "a": "En Cobranza (/copilot/cobranza)."
  },
  {
    "q": "¿Dónde veo si los datos están actualizados?",
    "a": "En Alertas (/copilot/alertas) y Datos (/copilot/datos)."
  },
  {
    "q": "¿Qué pasa si Finanzas o Cartera no terminan de cargar?",
    "a": "Si el informe tarda más de 25 segundos, aparece automáticamente un mensaje de error con el botón Reintentar. Hacé clic en él para volver a intentar. Si el problema persiste, verificá tu conexión a internet."
  },
  {
    "q": "¿Por qué la campana está vacía?",
    "a": "Las notificaciones se generan automáticamente una vez por día. Si el sistema fue configurado recientemente o no hubo actividad nueva, la campana puede estar vacía. Es normal — las alertas aparecerán en el próximo ciclo de generación."
  },
  {
    "q": "¿Los agentes pueden modificar datos?",
    "a": "No. En esta versión solo leen información y sugieren acciones. Vos decidís qué hacer."
  },
  {
    "q": "¿El agente envía WhatsApp o emails?",
    "a": "No. Puede llevarte al cliente o a la acción correspondiente, pero no envía mensajes automáticamente."
  },
  {
    "q": "¿Qué pasa si Zeta falla y uso el agente?",
    "a": "El agente puede mostrar información con los últimos datos disponibles y recomendar revisar Alertas. No inventa datos nuevos."
  },
  {
    "q": "Copié o envié un mensaje al cliente. ¿Qué hago ahora?",
    "a": "Si usaste la card Enviar estado de cuenta, Copilot te va a ofrecer el botón Registrar gestión automáticamente. Hacé clic, revisá el pre-llenado (canal y nota) y guardá. Si no usaste esa card, abrí la ficha del cliente, andá a Gestión de cobranza y registrá manualmente: canal, resultado (por ejemplo 'Contactado') y una nota. Eso queda en el historial y lo usan Cobranza y Agentes para saber que el cliente ya fue contactado."
  },
  {
    "q": "¿Registrar una gestión modifica la deuda del cliente?",
    "a": "No. Registrar una gestión es solo un seguimiento operativo. No modifica facturas, saldos ni pagos. Para marcar un pago, hacelo desde el sistema contable (Zeta)."
  },
  {
    "q": "¿Qué pasa si un cliente prometió pagar?",
    "a": "Copilot lo muestra como seguimiento de baja prioridad mientras la fecha no llegó. Si llega la fecha y la deuda sigue abierta, lo muestra como prioridad crítica para que lo verifiques. Registrar una promesa de pago no marca ninguna factura como pagada."
  },
  {
    "q": "¿Qué pasa si cargo una fecha de próximo seguimiento?",
    "a": "Cuando llega ese día, Copilot lo muestra como prioridad alta en los Agentes y en Cobranza. Es un recordatorio operativo — no ejecuta ninguna acción automática."
  },
  {
    "q": "¿Qué es la Agenda de cobranza y cómo la uso?",
    "a": "La Agenda de cobranza está integrada en Cobranza (/copilot/cobranza). También aparece resumida en Hoy: una card con counts de vencidos, hoy, próximos y promesas. Filtrá por categoría y hacé clic en Ver cliente para ir a la ficha. Solo muestra lo que vos registraste — no genera datos ni modifica deuda."
  }
];
