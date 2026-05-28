"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Banknote,
  Bell,
  BookMarked,
  Bot,
  CheckCircle,
  CheckSquare,
  ChevronDown,
  ChevronRight,
  Database,
  Info,
  Landmark,
  ListTodo,
  Users,
  Wallet,
  Zap,
} from "lucide-react";

// ─── Primitives ───────────────────────────────────────────────────────────────

const C = {
  card: "rounded-2xl border border-[var(--copilot-border)] bg-white/90 shadow-sm",
  ink: "text-[var(--copilot-ink)]",
  muted: "text-[var(--copilot-ink-muted)]",
  accent: "text-[var(--copilot-accent)]",
  border: "border-[var(--copilot-border)]",
} as const;

function NavLink({
  href,
  label,
  ghost,
}: {
  href: string;
  label: string;
  ghost?: boolean;
}) {
  if (ghost) {
    return (
      <Link
        href={href}
        className="inline-flex items-center gap-1 text-sm font-semibold text-[var(--copilot-accent)] hover:underline"
      >
        {label}
        <ChevronRight className="h-3.5 w-3.5" aria-hidden />
      </Link>
    );
  }
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--copilot-accent)] px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
    >
      {label}
      <ArrowRight className="h-3.5 w-3.5" aria-hidden />
    </Link>
  );
}

function Callout({
  variant,
  children,
}: {
  variant: "tip" | "warning" | "info";
  children: React.ReactNode;
}) {
  const s = {
    tip: "bg-emerald-50 border-emerald-200 text-emerald-800",
    warning: "bg-amber-50 border-amber-200 text-amber-800",
    info: "bg-blue-50 border-blue-200 text-blue-800",
  }[variant];
  return (
    <div className={`rounded-xl border px-4 py-3 text-sm leading-relaxed ${s}`}>
      {children}
    </div>
  );
}

function Steps({ items }: { items: string[] }) {
  return (
    <ol className="space-y-2.5">
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-3">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--copilot-accent)] text-[11px] font-bold text-white">
            {i + 1}
          </span>
          <span className="pt-0.5 text-sm leading-relaxed text-[var(--copilot-ink)]">
            {item}
          </span>
        </li>
      ))}
    </ol>
  );
}

function Bullets({ items }: { items: string[] }) {
  return (
    <ul className="space-y-1.5">
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-2 text-sm text-[var(--copilot-ink)]">
          <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--copilot-accent)]" />
          <span className="leading-relaxed">{item}</span>
        </li>
      ))}
    </ul>
  );
}

function StatusPill({
  level,
}: {
  level: "ok" | "warning" | "critical";
}) {
  const s = {
    ok: "bg-emerald-50 text-emerald-700 border-emerald-200",
    warning: "bg-amber-50 text-amber-700 border-amber-200",
    critical: "bg-rose-50 text-rose-700 border-rose-200",
  }[level];
  const label = { ok: "Estable", warning: "Atención", critical: "Crítico" }[
    level
  ];
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${s}`}
    >
      {label}
    </span>
  );
}

// ─── Accordion ────────────────────────────────────────────────────────────────

type Section = {
  id: string;
  icon: React.ReactNode;
  title: string;
  content: React.ReactNode;
};

function Accordion({
  sections,
  openIds,
  onToggle,
}: {
  sections: Section[];
  openIds: Set<string>;
  onToggle: (id: string) => void;
}) {
  return (
    <div className="space-y-2">
      {sections.map((s) => {
        const open = openIds.has(s.id);
        return (
          <div
            key={s.id}
            className={`overflow-hidden rounded-2xl border ${C.border} bg-white/90`}
          >
            <button
              type="button"
              onClick={() => onToggle(s.id)}
              aria-expanded={open}
              className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition hover:bg-slate-50/60"
            >
              <div className="flex items-center gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[rgba(31,107,74,0.08)] text-[var(--copilot-accent)]">
                  {s.icon}
                </span>
                <span className="text-[15px] font-semibold text-[var(--copilot-ink)]">
                  {s.title}
                </span>
              </div>
              <ChevronDown
                className={`h-4 w-4 shrink-0 text-[var(--copilot-ink-muted)] transition-transform duration-200 ${open ? "rotate-180" : ""}`}
                aria-hidden
              />
            </button>
            {open && (
              <div
                className={`space-y-4 border-t ${C.border}/60 px-5 py-5`}
              >
                {s.content}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Section content ──────────────────────────────────────────────────────────

const SECTIONS: Section[] = [
  {
    id: "copilot",
    icon: <Zap className="h-4 w-4" aria-hidden />,
    title: "¿Qué es Summer87 Copilot?",
    content: (
      <>
        <p className="text-sm leading-relaxed text-[var(--copilot-ink)]">
          Copilot es una pantalla de control para tu negocio. Te ayuda a ver cuánto
          dinero hay, quién te debe, qué pagos se vienen, qué clientes están
          atrasados y qué acciones conviene hacer primero.
        </p>
        <Callout variant="info">
          <strong>Importante:</strong> Copilot no reemplaza a tu contador ni al
          sistema contable. Es una herramienta para <em>leer la situación del
          negocio</em> y <em>tomar mejores decisiones</em>.
        </Callout>
        <div className={`rounded-2xl border ${C.border} p-4`}>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
            Qué hace Copilot
          </p>
          <Bullets
            items={[
              "Muestra cuánto dinero tenés disponible y qué pagos están programados.",
              "Dice quién te debe y cuánto lleva sin pagar.",
              "Avisa cuando algo importante cambia: un cliente paga, un vencimiento se acerca.",
              "Sugiere qué hacer primero según la situación del negocio.",
              "Toma los datos de tu sistema contable (Zeta) y los presenta de forma clara.",
            ]}
          />
        </div>
      </>
    ),
  },
  {
    id: "hoy",
    icon: <ListTodo className="h-4 w-4" aria-hidden />,
    title: "Hoy — La pantalla principal",
    content: (
      <>
        <p className="text-sm leading-relaxed text-[var(--copilot-ink)]">
          <strong>Hoy</strong> es lo primero que deberías mirar cada mañana.
          Resume todo lo que está pasando en el negocio en un solo lugar.
        </p>
        <Callout variant="tip">
          <strong>Tu prioridad hoy</strong> — al entrar, un bloque destacado te indica el
          siguiente paso recomendado (clientes vencidos, agenda de cobranza, Tesorería o revisar
          acciones). Un solo botón principal para no perderse.
        </Callout>
        <div className={`rounded-2xl border ${C.border} p-4`}>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)] mb-3">
            Qué ves en Hoy
          </p>
          <Bullets
            items={[
              "Tu prioridad hoy — una acción sugerida con un CTA claro (ver clientes críticos, agenda, Tesorería o acciones).",
              "Dinero disponible — caja estimada ahora. Viene de Tesorería, no de facturación ni de Cartera.",
              "Pagos próximos — qué salidas están programadas en los próximos días.",
              "Después de pagos — cuánto quedaría si se pagan todos los compromisos.",
              "Por cobrar — facturas abiertas que los clientes aún no pagaron. Es deuda de clientes, no plata en caja.",
              "Clientes con deuda — quiénes deben más o llevan más tiempo sin pagar.",
              "Generar PDF — en Clientes críticos podés descargar el reporte de deudores filtrado.",
            ]}
          />
        </div>
        <div className={`rounded-2xl border ${C.border} p-4`}>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)] mb-3">
            Dinero disponible — cómo se calcula
          </p>
          <p className="mb-3 text-sm text-[var(--copilot-ink)]">
            El número de <strong>Dinero disponible</strong> se arma a partir del saldo que cargaste en Tesorería más los movimientos confirmados posteriores a esa fecha.
          </p>
          <Bullets
            items={[
              "Saldo actual cargado — el punto de partida. Lo cargás vos en Tesorería con la plata real que tenés en caja o cuenta.",
              "Cobros Zeta posteriores — si un cliente paga después de que cargaste el saldo, Copilot lo suma automáticamente cuando aparece en Zeta. No tenés que registrarlo a mano.",
              "Ingresos manuales — plata que ingresa pero no viene de facturas Zeta (transferencias, adelantos, etc.). Se registra en Tesorería.",
              "Egresos confirmados — pagos realizados registrados en Tesorería. Restan del disponible.",
              "Pagos programados sin confirmar — no restan hasta que los marcás como ejecutados.",
            ]}
          />
          <div className="mt-3 rounded-xl bg-slate-50 border border-slate-200 px-4 py-3 text-sm text-[var(--copilot-ink)]">
            <p className="font-semibold mb-1">Ejemplo</p>
            <p className="leading-relaxed">
              Cargás $263.034 como saldo actual. Luego El País paga $25.742 y ese cobro aparece en Zeta.
              Copilot lo suma solo: <strong>Dinero disponible = $288.776</strong>.
              Si después registrás un egreso de $10.000 en Tesorería, baja a <strong>$278.776</strong>.
            </p>
          </div>
          <Callout variant="warning">
            <strong>Por cobrar ≠ Dinero disponible.</strong> La deuda de los clientes se muestra en el bloque &ldquo;Por cobrar&rdquo; pero no entra en caja hasta que el cliente efectivamente pague y el cobro aparezca en Zeta.
          </Callout>
        </div>
        <div className={`rounded-2xl border ${C.border} p-4`}>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)] mb-3">
            Qué hacer
          </p>
          <Bullets
            items={[
              "Si hay clientes críticos → tocar el nombre para abrir su ficha, llamar o escribir por WhatsApp.",
              "Si hay pagos próximos → entrar a Tesorería para confirmar si están listos.",
              "Si el dinero después de pagos queda bajo → revisar caja en Tesorería.",
              "Si el Dinero disponible parece incorrecto → verificar que el saldo actual en Tesorería esté actualizado.",
            ]}
          />
        </div>
        <div className="flex gap-3 flex-wrap">
          <NavLink href="/copilot/hoy" label="Ir a Hoy" />
        </div>
      </>
    ),
  },
  {
    id: "acciones",
    icon: <CheckSquare className="h-4 w-4" aria-hidden />,
    title: "Acciones — Qué hacer primero",
    content: (
      <>
        <p className="text-sm leading-relaxed text-[var(--copilot-ink)]">
          <strong>Acciones</strong> es la lista de cosas concretas que conviene hacer
          hoy. No avisa qué pasó — dice qué hacer.
        </p>
        <Callout variant="tip">
          <strong>Diferencia clave:</strong> Alertas = qué pasó. Acciones = qué
          hacer ahora.
        </Callout>
        <div className={`rounded-2xl border ${C.border} p-4`}>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)] mb-3">
            Ejemplos de acciones
          </p>
          <Bullets
            items={[
              "Contactar a un cliente que lleva 45 días sin pagar.",
              "Revisar un pago que vence esta semana.",
              "Verificar el estado de la caja antes del cierre del mes.",
            ]}
          />
        </div>
        <div className={`rounded-2xl border ${C.border} p-4`}>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)] mb-3">
            Filtros disponibles
          </p>
          <Bullets
            items={[
              "Todas — todo junto.",
              "Críticas — las más urgentes, las que no pueden esperar.",
              "Cobranza — acciones relacionadas con clientes y facturas.",
              "Tesorería — acciones relacionadas con pagos y caja.",
              "Sistema — avisos técnicos sobre la sincronización de datos.",
            ]}
          />
        </div>
        <div className={`rounded-2xl border ${C.border} p-4`}>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)] mb-3">
            Contexto de gestión en cada acción
          </p>
          <p className="mb-3 text-sm text-[var(--copilot-ink)]">
            Si ya registraste una gestión de cobranza para un cliente, la acción
            correspondiente lo muestra directamente. No tenés que recordar qué
            pasó — aparece en la tarjeta.
          </p>
          <Bullets
            items={[
              "Última gestión — canal, resultado y fecha de la última gestión registrada.",
              "Prometió pagar — si hay una promesa activa, se muestra la fecha y el monto.",
              "Próximo seguimiento — si agendaste un seguimiento, aparece la fecha.",
              "La prioridad puede bajar si el cliente ya fue contactado o tiene una promesa futura.",
              "El botón cambia a «Ver seguimiento» para ir directo al historial del cliente.",
            ]}
          />
        </div>
        <div className={`rounded-2xl border ${C.border} p-4`}>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)] mb-3">
            Agenda de cobranza
          </p>
          <p className="mb-3 text-sm text-[var(--copilot-ink)]">
            La pestaña <strong>Agenda de cobranza</strong> dentro de Acciones agrupa todos los
            seguimientos, promesas y contactos recientes en un solo lugar. Es la respuesta a
            «¿a quién tengo que contactar hoy?» sin tener que revisar cada ficha.
          </p>
          <p className="mb-3 text-sm text-[var(--copilot-ink)]">
            También aparece resumida en <strong>Hoy</strong>: una card compacta muestra los counts
            de vencidos, hoy, próximos y promesas. El CTA <em>Ver agenda</em> lleva directo a
            Acciones → Agenda de cobranza.
          </p>
          <Bullets
            items={[
              "Acceso directo: Acciones → pestaña Agenda de cobranza (o /copilot/acciones?tab=agenda).",
              "También en Hoy: resumen compacto con counts y link Ver agenda.",
              "Vencidos — seguimientos cuya fecha ya pasó, contactos incorrectos y clientes sin respuesta hace 5+ días.",
              "Hoy — seguimientos programados para hoy. Alta prioridad: hacer antes del cierre del día.",
              "Próximos — seguimientos futuros ordenados por fecha. Para planificar la semana.",
              "Promesas — clientes con promesa de pago activa, separadas en vencidas (crítico) y futuras (monitorear).",
              "Contactados — clientes contactados en los últimos 7 días sin señal pendiente. Estado 'Esperando respuesta'.",
            ]}
          />
          <Callout variant="info">
            La agenda se arma a partir de las gestiones registradas en las fichas de los clientes.
            Si no registrás gestiones, la agenda queda vacía — no genera seguimientos automáticos.
          </Callout>
          <Callout variant="warning">
            La agenda no modifica deuda, no marca facturas como pagadas y no ejecuta ninguna acción
            automática. Es solo una vista operativa de lo que registraste.
          </Callout>
        </div>
        <div className="flex gap-3 flex-wrap">
          <NavLink href="/copilot/acciones" label="Ir a Acciones" />
        </div>
      </>
    ),
  },
  {
    id: "alertas",
    icon: <Bell className="h-4 w-4" aria-hidden />,
    title: "Alertas — Historial de avisos",
    content: (
      <>
        <p className="text-sm leading-relaxed text-[var(--copilot-ink)]">
          <strong>Alertas</strong> guarda todos los avisos importantes del negocio.
          Es como la bandeja de entrada, pero para eventos del negocio.
        </p>
        <div className={`rounded-2xl border ${C.border} p-4`}>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)] mb-3">
            Tipos de alerta
          </p>
          <Bullets
            items={[
              "Cobro recibido — un cliente pagó.",
              "Cliente vencido — un cliente lleva días sin pagar.",
              "Pago próximo — un pago vence pronto.",
              "Pago vencido — un pago ya pasó su fecha.",
              "Problema de sincronización — los datos no se actualizaron correctamente.",
            ]}
          />
        </div>
        <div className={`rounded-2xl border ${C.border} p-4`}>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)] mb-3">
            Cómo usarlas
          </p>
          <Steps
            items={[
              "Abrí la alerta para leer el detalle.",
              "Tocá el link de la alerta para ir directamente al módulo correspondiente.",
              'Marcá como leída cuando ya la atendiste. Esto no borra la alerta.',
            ]}
          />
        </div>
        <Callout variant="info">
          <strong>Marcar como leída</strong> solo indica que ya la viste. La alerta
          sigue ahí para consultarla después.
        </Callout>
        <div className="flex gap-3 flex-wrap">
          <NavLink href="/copilot/alertas" label="Ir a Alertas" />
        </div>
      </>
    ),
  },
  {
    id: "clientes",
    icon: <Users className="h-4 w-4" aria-hidden />,
    title: "Clientes — Directorio y ficha 360",
    content: (
      <>
        <p className="text-sm leading-relaxed text-[var(--copilot-ink)]">
          <strong>Clientes</strong> muestra a quién le vendés y cómo está cada
          relación comercial. Tocar un cliente abre su <em>ficha 360</em>:
          deuda, facturas, cobros, historial y contacto en un solo lugar.
        </p>

        <div className={`rounded-2xl border ${C.border} p-4`}>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)] mb-3">
            Estados posibles en el listado
          </p>
          <div className="space-y-2 text-sm">
            {[
              { color: "bg-emerald-100 text-emerald-800", label: "Sin deuda", desc: "No tiene facturas pendientes." },
              { color: "bg-amber-100 text-amber-800", label: "Con deuda al día", desc: "Tiene facturas abiertas que aún no vencieron." },
              { color: "bg-rose-100 text-rose-800", label: "Con deuda vencida", desc: "Tiene facturas que ya pasaron su fecha de vencimiento." },
            ].map((s) => (
              <div key={s.label} className="flex items-center gap-3">
                <span className={`inline-flex shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${s.color}`}>
                  {s.label}
                </span>
                <span className="text-[var(--copilot-ink)]">{s.desc}</span>
              </div>
            ))}
          </div>
        </div>

        <div className={`rounded-2xl border ${C.border} p-4`}>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)] mb-3">
            Qué muestra la ficha 360
          </p>
          <Bullets
            items={[
              "Qué pasa — resumen ejecutivo de la situación actual del cliente.",
              "Por qué importa — cuánto debe y qué porcentaje está vencido.",
              "Qué hacer — primera acción sugerida por Copilot.",
              "Estado de cuenta — deuda total en UYU y USD, con % vencido.",
              "Facturas — cada factura activa con su monto y estado.",
              "Cobros — recibos registrados que el cliente ya pagó.",
              "Actividad reciente — timeline de facturas, cobros y actualizaciones.",
              "Contactos — emails con opción de copiar o escribir directo.",
              "Datos de integración — cuándo se actualizó la información desde Zeta.",
            ]}
          />
        </div>

        <div className={`rounded-2xl border ${C.border} p-4`}>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)] mb-3">
            Deuda y vencimiento
          </p>
          <Bullets
            items={[
              "Deuda total — suma de todas las facturas abiertas (emitidas o pendientes).",
              "Deuda vencida — parte de esa deuda cuya fecha de vencimiento ya pasó.",
              "% vencido — qué proporción de la deuda total ya está vencida. Cuanto más alto, más urgente.",
            ]}
          />
        </div>

        <div className={`rounded-2xl border ${C.border} p-4`}>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)] mb-3">
            Reporte de deudores (PDF)
          </p>
          <p className="mb-3 text-sm text-[var(--copilot-ink)]">
            Podés descargar un <strong>reporte de deudores</strong> con todos los clientes que deben plata,
            filtrado según lo que necesites revisar o compartir.
          </p>
          <Bullets
            items={[
              "Dónde generarlo — botón Generar PDF en Hoy (bloque Clientes críticos) y en Clientes (Cartera de clientes).",
              "Antes de descargar — elegís moneda, estado, montos mínimos, antigüedad de vencimiento y contacto.",
              "Vista previa — el modal indica cuántos clientes entrarán con los filtros elegidos.",
              "Antigüedad — días exactos desde la factura vencida más antigua (fecha de emisión del PDF como referencia).",
              "UYU y USD — cada moneda va en filas separadas; los totales no se mezclan.",
              "Columnas — cliente, moneda, deuda, vencido, días de atraso, contacto y estado.",
              "Orden — primero pesos de mayor a menor deuda, luego dólares de mayor a menor (si aplica el filtro de moneda).",
              "Contacto — solo muestra WhatsApp o email si el dato es válido (teléfono corto o email inválido no cuenta).",
              "Filtros en el PDF — solo aparecen los filtros que realmente restringen el reporte; los valores por defecto no se listan.",
              "Es informativo — no modifica datos, no marca clientes como pagados y no envía mensajes.",
            ]}
          />
          <Callout variant="info">
            Si un cliente debe en pesos y en dólares, aparece una fila por moneda. Las notas de crédito no inflan la deuda mostrada.
          </Callout>
        </div>

        <div className={`rounded-2xl border ${C.border} p-4`}>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)] mb-3">
            Facturas y cobros
          </p>
          <div className="space-y-2">
            {[
              { label: "Factura emitida", color: "bg-amber-50 text-amber-700 border-amber-200", desc: "Se emitió pero aún no fue pagada ni venció." },
              { label: "Factura vencida", color: "bg-rose-50 text-rose-700 border-rose-200", desc: "Pasó su fecha de vencimiento sin cobro registrado." },
              { label: "Factura pagada", color: "bg-emerald-50 text-emerald-700 border-emerald-200", desc: "Hay un cobro registrado que la cubre." },
              { label: "Cobro registrado", color: "bg-slate-100 text-slate-600 border-slate-200", desc: "Pago que el cliente realizó, registrado en el sistema contable." },
            ].map((s) => (
              <div key={s.label} className="flex items-start gap-3 text-sm">
                <span className={`mt-0.5 inline-flex shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${s.color}`}>
                  {s.label}
                </span>
                <span className="text-[var(--copilot-ink)]">{s.desc}</span>
              </div>
            ))}
          </div>
        </div>

        <div className={`rounded-2xl border ${C.border} p-4`}>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)] mb-3">
            Cómo contactar al cliente
          </p>
          <Bullets
            items={[
              "Email — tocá el botón «Enviar email» para abrir tu cliente de correo, o «Copiar email» para copiarlo al portapapeles.",
              "Teléfono — si el cliente tiene celular o teléfono cargado en Zeta, aparece en la pestaña Contactos. Si es un celular uruguayo válido, el botón WhatsApp se habilita directamente.",
              "Si no hay datos de contacto → revisá los datos en tu sistema contable (Zeta).",
            ]}
          />
        </div>

        <div className={`rounded-2xl border ${C.border} p-4`}>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)] mb-3">
            Datos de integración
          </p>
          <p className="text-sm leading-relaxed text-[var(--copilot-ink)]">
            La pestaña <strong>Actualización de datos</strong> muestra cuándo se
            sincronizó cada tipo de información (facturas, cobros, contactos, etc.)
            desde el sistema contable. Si algo parece desactualizado, podés ver
            aquí la fecha exacta del último dato disponible.
          </p>
        </div>

        <Callout variant="tip">
          <strong>Próximo paso</strong> — debajo del encabezado de la ficha, un bloque compacto
          resume qué conviene hacer ahora (preparar cobranza, ver seguimiento, etc.) con un solo
          botón. Usa la misma lectura que el Agente de cliente, sin duplicar pantallas.
        </Callout>

        <div className={`rounded-2xl border ${C.border} p-4`}>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)] mb-3">
            Agente de cliente
          </p>
          <p className="mb-3 text-sm text-[var(--copilot-ink)]">
            La ficha de cada cliente incluye el <strong>Agente de cliente</strong>:
            un resumen que dice qué pasa, por qué importa y qué hacer ahora.
            No modifica datos ni envía mensajes. Solo ayuda a decidir.
          </p>
          <Bullets
            items={[
              "Qué pasa — resume la situación del cliente: sin deuda, deuda al día, vencida o con promesa de pago.",
              "Por qué importa — explica el contexto: cuánto tiene vencido, en qué moneda, si tiene contacto disponible.",
              "Qué hacer ahora — sugiere el próximo paso: preparar cobranza, ver seguimiento, ver contactos o revisar actualización.",
              "Insights — muestra hasta 5 señales del cliente: vencido por moneda, promesa, contacto, última gestión.",
              "CTA — el botón lleva al asistente de cobranza, a los contactos, al estado de cuenta o a la actualización de datos.",
              "No modifica nada. No marca facturas. No envía mensajes. Solo sugiere.",
            ]}
          />
        </div>

        <div className={`rounded-2xl border ${C.border} p-4`}>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)] mb-3">
            Asistente de cobranza
          </p>
          <p className="mb-3 text-sm text-[var(--copilot-ink)]">
            Cuando el cliente tiene deuda, la ficha muestra el Asistente de
            cobranza. Te permite generar un mensaje sugerido para contactarlo.
            Copilot no envía nada automáticamente.
          </p>
          <Bullets
            items={[
              "Canal — elige WhatsApp o Email según como preferís contactar al cliente.",
              "Tono — Amable para el primer aviso, Firme si ya pasó un tiempo, Urgente si la deuda lleva mucho sin atenderse.",
              "Generar mensaje — crea el texto con los datos reales del cliente (nombre y monto).",
              "Copiar mensaje — copia el texto al portapapeles para pegarlo donde quieras.",
              "Enviar email — si el cliente tiene email cargado, abre tu cliente de correo con el texto y asunto preparados.",
              "Abrir WhatsApp — aparece solo si el cliente tiene un celular utilizable (formato uruguayo). Al hacer clic, abre WhatsApp con el mensaje ya escrito.",
              "Teléfono no utilizable para WhatsApp — aparece cuando hay un teléfono cargado pero es fijo o tiene formato inválido. Corregí el teléfono en Zeta para habilitarlo.",
              "Sin teléfono cargado — el cliente no tiene teléfono registrado en el sistema.",
            ]}
          />
          <Callout variant="info">
            Los mensajes son sugerencias. Revisalos antes de enviarlos. Copilot
            no los envía automáticamente.
          </Callout>
        </div>

        <div className={`rounded-2xl border ${C.border} p-4`}>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)] mb-3">
            Gestión de cobranza
          </p>
          <p className="mb-3 text-sm text-[var(--copilot-ink)]">
            Después de contactar al cliente, registrá qué pasó. Esto te permite
            recordar qué se habló, cuándo volver a contactar, y si hay una
            promesa de pago pendiente.
          </p>
          <Bullets
            items={[
              "Canal — elegís cómo fue el contacto: WhatsApp, Email, Teléfono u Otro.",
              "Resultado — qué pasó: Contactado, Prometió pagar, Sin respuesta, Contacto incorrecto, En disputa, Requiere seguimiento.",
              "Nota — campo libre para escribir el detalle: 'prometió pagar el viernes', 'sin respuesta, llamar en 3 días', etc.",
              "Próximo seguimiento — fecha opcional para recordar cuándo volver a contactar.",
              "Promesa de pago — si el resultado fue 'Prometió pagar', la fecha es requerida para guardar la gestión. El monto es opcional.",
              "Registrar gestión — guarda el registro. No modifica la deuda ni marca facturas como pagadas.",
            ]}
          />
          <Callout variant="warning">
            Registrar una gestión NO marca ninguna factura como pagada ni
            modifica el saldo. Solo es un registro de seguimiento. Para marcar
            un pago, usá el sistema contable (Zeta).
          </Callout>
          <p className="mt-3 mb-2 text-[11px] font-semibold text-[var(--copilot-ink-muted)]">
            Qué significa cada resultado
          </p>
          <Bullets
            items={[
              "Contactado — lograste comunicarte con el cliente.",
              "Prometió pagar — el cliente se compromete a pagar en una fecha. La fecha de promesa es requerida; el monto es opcional.",
              "Sin respuesta — llamaste o escribiste pero no contestó.",
              "Contacto incorrecto — el número o email que tenés no es el correcto.",
              "En disputa — el cliente no reconoce la deuda o la cuestiona.",
              "Requiere seguimiento — necesitás volver a contactar, pero no hay más detalle por ahora.",
            ]}
          />
          <p className="mt-3 mb-2 text-[11px] font-semibold text-[var(--copilot-ink-muted)]">
            Última gestión
          </p>
          <p className="mb-2 text-sm text-[var(--copilot-ink-muted)]">
            Si ya hay gestiones registradas, aparece un resumen compacto justo
            arriba del formulario: canal, resultado, fecha y próximo seguimiento.
            Así no hace falta leer todo el historial para saber en qué punto
            quedó la gestión.
          </p>
          <p className="mt-3 mb-2 text-[11px] font-semibold text-[var(--copilot-ink-muted)]">
            Historial
          </p>
          <p className="text-sm text-[var(--copilot-ink-muted)]">
            Debajo del formulario aparece el historial de todas las gestiones
            registradas para ese cliente, ordenadas de la más reciente a la más
            antigua. Cada entrada muestra canal, resultado, nota y próximo
            seguimiento si existe.
          </p>
          <p className="mt-3 mb-2 text-[11px] font-semibold text-[var(--copilot-ink-muted)]">
            Efecto en Acciones y Agentes
          </p>
          <Bullets
            items={[
              "Registrar una gestión hace que Acciones y Agentes reconozcan el estado real del cliente, sin repetir la misma recomendación de contacto.",
              "Si el cliente fue contactado recientemente, Copilot lo muestra como 'ya contactado' o 'esperando respuesta' en lugar de 'priorizar cobranza'.",
              "Si hay una promesa de pago futura, los Agentes sugieren monitorearla en lugar de contactar.",
              "Si la promesa vence sin confirmación de pago, la prioridad sube automáticamente.",
              "Si el resultado fue 'Sin respuesta' hace más de 5 días, vuelve a ser prioritario.",
              "Si el resultado fue 'Contacto incorrecto', la prioridad se mantiene alta porque no hubo contacto útil.",
              "La deuda nunca desaparece. Solo cambia el copy y el tono de la recomendación.",
            ]}
          />
          <Callout variant="info">
            Registrar la gestión es lo único que hace que Acciones y Agentes sepan que el cliente ya fue contactado. Sin ese registro, el sistema no tiene constancia del contacto y seguirá recomendando contactarlo.
          </Callout>
        </div>

        <div className={`rounded-2xl border ${C.border} p-4`}>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)] mb-3">
            Estado de cuenta PDF
          </p>
          <p className="mb-3 text-sm text-[var(--copilot-ink)]">
            Desde la ficha del cliente, pestaña Estado de cuenta, podés descargar un PDF con el historial completo de facturas y cobros.
          </p>
          <Bullets
            items={[
              "Botón Descargar PDF — aparece en la sección Estado de cuenta histórico de la ficha.",
              "Incluye todos los movimientos del cliente: facturas emitidas, cobros recibidos y saldo acumulado.",
              "Cada factura muestra su concepto/ítem real (viene de Zeta) debajo del movimiento principal.",
              "Cada recibo muestra la caja o medio de cobro como línea secundaria.",
              "Las notas de crédito van en columna Haber (descuentan saldo), no como deuda a cobrar.",
              "Separa UYU y USD en bloques independientes. No mezcla monedas.",
              "Usa el modo ledger: incluye también registros archivados para un historial completo.",
              "El PDF no modifica datos — es solo lectura de lo sincronizado desde Zeta.",
              "El archivo se descarga directamente en el navegador.",
            ]}
          />
          <Callout variant="info">
            El PDF refleja los datos sincronizados en Copilot. Los importes y conceptos vienen directamente de Zeta. Si hay movimientos recientes en Zeta que todavía no se sincronizaron, no aparecerán hasta la próxima actualización.
          </Callout>
        </div>

        <div className={`rounded-2xl border ${C.border} p-4`}>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)] mb-3">
            Enviar estado de cuenta
          </p>
          <p className="mb-3 text-sm text-[var(--copilot-ink)]">
            Debajo de la card de descarga PDF aparece la card <strong>Enviar estado de cuenta</strong>. Permite generar un mensaje personalizado para enviarle al cliente junto con el PDF.
          </p>
          <Bullets
            items={[
              "Elegí el canal: Email o WhatsApp.",
              "Elegí la moneda: Pesos (UYU) o Dólares (USD) — el saldo del mensaje se ajusta automáticamente.",
              "Elegí el tono: Amable (informal), Firme (formal exigente) o Breve (mensaje corto).",
              "El mensaje se genera con el período del año actual al día de hoy y el saldo vigente del cliente.",
              "Botón Copiar mensaje — copia el texto al portapapeles.",
              "Botón Abrir email — abre el cliente de correo con destinatario, asunto y cuerpo pre-cargados.",
              "Botón Abrir WhatsApp — abre WhatsApp Web o la app con el mensaje pre-cargado.",
              "Si el cliente no tiene email registrado, el botón de email queda deshabilitado.",
              "Si el cliente no tiene celular apto para WhatsApp, ese botón queda deshabilitado.",
              "El PDF no se adjunta automáticamente — debés descargarlo y adjuntarlo manualmente.",
              "Después de Copiar, Abrir email o Abrir WhatsApp, aparece el botón Registrar gestión. Al hacerlo, el formulario de Gestión de cobranza se completa automáticamente con el canal y una nota del período enviado.",
              "Si el formulario de cobranza ya tiene texto, en lugar de pisarlo aparece una sugerencia que podés aplicar o ignorar.",
            ]}
          />
          <Callout variant="info">
            Registrar la gestión desde esta card es lo que le permite a Acciones y Agentes saber que el cliente ya fue contactado. Sin ese registro, el sistema no tiene constancia del contacto.
          </Callout>
          <Callout variant="warning">
            Esta función no envía ningún mensaje automáticamente, no marca facturas como pagadas y no modifica ningún dato contable. El botón &quot;Registrar gestión&quot; propone un pre-llenado que el usuario debe revisar y guardar manualmente.
          </Callout>
        </div>

        <div className={`rounded-2xl border ${C.border} p-4`}>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)] mb-3">
            Buscar y filtrar en Datos
          </p>
          <p className="mb-3 text-sm text-[var(--copilot-ink)]">
            Todas las secciones de <strong>Datos</strong> siguen el mismo patrón de filtros: buscador, período y chips de categoría.
          </p>
          <Bullets
            items={[
              "Buscador — busca en texto libre: cliente, número, RUT, concepto, método de cobro o estado.",
              "Listado — alternás entre Activos, Inactivos o Todos sin recargar la página.",
              "Contador — muestra cuántos registros coinciden con los filtros activos.",
              "Período (Facturas y Recibos) — filtrá por Mes y año, Rango de fechas o Todo. Botones rápidos: Mes actual, Hoy (Recibos) y Limpiar.",
              "Chips Facturas — Todos / Con saldo / Notas de crédito y Pesos / Dólares.",
              "Chips Recibos — Pesos / Dólares.",
              "Al hacer clic en cualquier registro se abre el panel lateral con el detalle completo.",
              "Los IDs técnicos de Zeta quedan en el bloque «Datos técnicos» dentro del panel — no aparecen en la vista principal.",
            ]}
          />
        </div>

        <div className={`rounded-2xl border ${C.border} p-4`}>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)] mb-3">
            Datos vs. ficha completa
          </p>
          <Bullets
            items={[
              "Datos — panel lateral rápido: código, deuda, facturas y contactos básicos.",
              "Ficha completa (esta sección) — análisis completo: Qué pasa / Por qué importa / Qué hacer, historial, recibos y recomendación de Copilot.",
              "Detalle técnico — bloque colapsado disponible en la pestaña Actualización de datos. Solo para casos avanzados.",
            ]}
          />
        </div>

        <Callout variant="tip">
          <strong>Copilot sugiere, vos decidís.</strong> Los resúmenes y acciones
          que muestra la ficha son lecturas automáticas. La decisión de contactar
          al cliente, negociar un plazo o dar de baja una deuda siempre es tuya.
        </Callout>

        <div className="flex gap-3 flex-wrap">
          <NavLink href="/copilot/clientes" label="Ir a Clientes" />
        </div>
      </>
    ),
  },
  {
    id: "cartera",
    icon: <Landmark className="h-4 w-4" aria-hidden />,
    title: "Cartera — Quién te debe y cuánto",
    content: (
      <>
        <p className="text-sm leading-relaxed text-[var(--copilot-ink)]">
          <strong>Cartera</strong> muestra el dinero que los clientes te deben.
          Es la vista de cobranza: cuánto hay pendiente, qué está vencido y
          quiénes tienen más urgencia.
        </p>
        <Callout variant="info">
          <strong>Cartera ≠ Caja.</strong> Lo que ves en Cartera es deuda que los clientes todavía no pagaron.
          No es plata disponible. Entra en caja solo cuando el cliente paga y el cobro aparece en Zeta.
          El <strong>Dinero disponible</strong> viene de Tesorería, no de Cartera.
        </Callout>
        <div className={`rounded-2xl border ${C.border} p-4`}>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)] mb-3">
            Cómo interpretar la antigüedad de deuda
          </p>
          <div className="space-y-2">
            {[
              { label: "Al día", color: "bg-emerald-50 text-emerald-700", desc: "Facturas que aún no vencieron." },
              { label: "1 a 30 días", color: "bg-amber-50 text-amber-700", desc: "Recién vencido. Conviene avisar." },
              { label: "31 a 60 días", color: "bg-orange-50 text-orange-700", desc: "Ya lleva un mes. Priorizar el contacto." },
              { label: "61 a 90 días", color: "bg-red-50 text-red-700", desc: "Problema real. Gestión urgente." },
              { label: "Más de 90 días", color: "bg-rose-100 text-rose-800", desc: "Muy difícil de cobrar. Acción inmediata." },
            ].map((row) => (
              <div key={row.label} className="flex items-start gap-3 text-sm">
                <span className={`mt-0.5 inline-flex shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${row.color}`}>
                  {row.label}
                </span>
                <span className="text-[var(--copilot-ink)]">{row.desc}</span>
              </div>
            ))}
          </div>
        </div>
        <Callout variant="warning">
          Cuantos más días pasan, más difícil es cobrar.
          Actuar en los primeros 30 días hace la diferencia.
        </Callout>
        <div className="flex gap-3 flex-wrap">
          <NavLink href="/copilot/cartera" label="Ir a Cartera" />
        </div>
      </>
    ),
  },
  {
    id: "tesoreria",
    icon: <Banknote className="h-4 w-4" aria-hidden />,
    title: "Tesorería — Caja, pagos y compromisos",
    content: (
      <>
        <p className="text-sm leading-relaxed text-[var(--copilot-ink)]">
          <strong>Tesorería</strong> es donde cargás y gestionás el dinero operativo:
          el saldo actual de caja, los egresos y pagos que no vienen de Zeta.
          Es la fuente del número <strong>Dinero disponible</strong> que ves en Hoy.
        </p>

        <div className={`rounded-2xl border ${C.border} p-4`}>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)] mb-3">
            Saldo actual cargado
          </p>
          <p className="mb-3 text-sm text-[var(--copilot-ink)]">
            El primer paso es cargar el saldo actual. Es la plata real que tenés en caja o cuenta bancaria en ese momento.
          </p>
          <Bullets
            items={[
              "No es facturación anual. No es lo que te deben. No es el total cobrado histórico.",
              "Es el punto de partida: la plata que tenés ahora, que vos conocés mejor que nadie.",
              "Se carga en Tesorería → panel de caja disponible → botón Editar saldo actual.",
              "Podés actualizarlo cuando quieras. Cada vez que lo actualizás, la fecha de corte se resetea a ese día.",
              "UYU y USD se cargan por separado.",
            ]}
          />
        </div>

        <div className={`rounded-2xl border ${C.border} p-4`}>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)] mb-3">
            Cobros de clientes — automáticos desde Zeta
          </p>
          <p className="mb-3 text-sm text-[var(--copilot-ink)]">
            No hace falta registrar a mano los cobros de clientes. Copilot los toma directamente de Zeta.
          </p>
          <Bullets
            items={[
              "Si un cliente paga después de que cargaste el saldo, el cobro aparece en Zeta y Copilot lo suma solo al Dinero disponible.",
              "Si el cobro ocurrió antes de la fecha en que cargaste el saldo, no se suma de nuevo — ya estaba incluido en el saldo que cargaste.",
              "Esto evita duplicar: el saldo que cargaste ya refleja todo lo cobrado hasta ese momento.",
              "Los cobros anulados o cancelados no suman aunque tengan fecha posterior.",
            ]}
          />
        </div>

        <div className={`rounded-2xl border ${C.border} p-4`}>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)] mb-3">
            Egresos y movimientos manuales
          </p>
          <Bullets
            items={[
              "Registrá en Tesorería los pagos que hacés: sueldos, impuestos, proveedores, gastos operativos.",
              "Los egresos confirmados restan del Dinero disponible desde la fecha en que ocurrieron.",
              "Los pagos programados (fecha futura o sin confirmar) no restan hasta que los ejecutás.",
              "Los ingresos manuales (no de facturas Zeta) también se registran acá y suman al disponible.",
              "Caja manual → Movimientos de entrada y salida registrados por vos.",
            ]}
          />
        </div>

        <div className={`rounded-2xl border ${C.border} p-4`}>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)] mb-3">
            Secciones de Tesorería
          </p>
          <Bullets
            items={[
              "Caja — saldo disponible cargado al corte, más cobros y movimientos confirmados después.",
              "Programados — pagos con fecha futura; no afectan caja hasta confirmarse.",
              "Movimientos — ingresos y egresos confirmados que ajustan tu caja.",
              "Avanzado — conciliación bancaria, recurrentes y opciones técnicas.",
            ]}
          />
        </div>

        <div className={`rounded-2xl border ${C.border} p-4`}>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)] mb-3">
            Garantías del sistema
          </p>
          <Bullets
            items={[
              "No marca ninguna factura como pagada desde Tesorería.",
              "No modifica datos en Zeta.",
              "No duplica cobros: si el cobro es anterior al saldo cargado, no se suma de nuevo.",
              "UYU y USD se calculan por separado — no se mezclan.",
              "Los cobros de clientes vienen de Zeta; los egresos operativos se registran en Tesorería.",
            ]}
          />
        </div>

        <div className="flex gap-3 flex-wrap">
          <NavLink href="/copilot/tesoreria" label="Ir a Tesorería" />
          <NavLink href="/copilot/tesoreria?section=pagos" label="Ver pagos" ghost />
        </div>
      </>
    ),
  },
  {
    id: "finanzas",
    icon: <Wallet className="h-4 w-4" aria-hidden />,
    title: "Finanzas — Mirada general del negocio",
    content: (
      <>
        <p className="text-sm leading-relaxed text-[var(--copilot-ink)]">
          <strong>Finanzas</strong> muestra proyecciones y tendencias. No es para
          operar el día a día — es para entender el panorama general.
        </p>
        <Callout variant="warning">
          <strong>Neto acumulado ≠ caja bancaria real.</strong>{" "}
          El neto acumulado es la diferencia entre lo cobrado y lo pagado hasta hoy.
          Para ver cuánto hay en caja, usá <strong>Hoy</strong> o{" "}
          <strong>Tesorería</strong>.
        </Callout>
        <div className={`rounded-2xl border ${C.border} p-4`}>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)] mb-3">
            Qué muestra
          </p>
          <Bullets
            items={[
              "Neto acumulado — cobros totales menos pagos totales registrados.",
              "Cobranza esperada — lo que está pendiente de cobrar en cartera.",
              "Egresos proyectados — pagos que se esperan en los próximos días.",
              "Balance proyectado — si se cobra y se paga todo, qué quedaría.",
              "Ratio de cobertura — si lo disponible alcanza para cubrir los compromisos.",
              "Detalle fiscal — resumen de obligaciones tributarias.",
            ]}
          />
        </div>
        <div className={`rounded-2xl border ${C.border} p-4`}>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)] mb-3">
            Para profundizar
          </p>
          <div className="flex flex-wrap gap-3">
            <NavLink href="/copilot/cartera" label="Ver deuda en Cartera" ghost />
            <NavLink href="/copilot/tesoreria" label="Ver caja en Tesorería" ghost />
          </div>
        </div>
      </>
    ),
  },
  {
    id: "datos",
    icon: <Database className="h-4 w-4" aria-hidden />,
    title: "Datos — Consulta de registros base",
    content: (
      <>
        <p className="text-sm leading-relaxed text-[var(--copilot-ink)]">
          <strong>Datos</strong> es una vista de consulta directa. Podés ver los
          registros base que usa Copilot: clientes, facturas, recibos, pagos y
          obligaciones fiscales.
        </p>
        <Callout variant="info">
          Datos es para <em>consultar y verificar</em>, no para operar. Para gestión
          diaria usá Cartera, Tesorería o Acciones.
        </Callout>
        <div className={`rounded-2xl border ${C.border} p-4`}>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)] mb-3">
            Qué podés consultar
          </p>
          <Bullets
            items={[
              "Clientes — directorio completo con datos de contacto.",
              "Facturas — todas las facturas por período, con saldo y estado.",
              "Recibos — cobros con número real, cliente, monto, moneda y método. Filtros por período, rango de fechas y moneda.",
              "Pagos — pagos fiscales y a proveedores.",
              "Obligaciones fiscales — vencimientos tributarios.",
            ]}
          />
        </div>

        <div className={`rounded-2xl border ${C.border} p-4`}>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)] mb-3">
            Por que no hay botón para crear clientes
          </p>
          <p className="text-sm leading-relaxed text-[var(--copilot-ink)]">
            Los clientes se sincronizan automáticamente desde el sistema
            contable (Zeta). Crearlos a mano podría generar duplicados o
            registros que no coincidan con los datos reales. Por eso no hay
            botón de nuevo cliente en esta sección.
          </p>
        </div>

        <div className={`rounded-2xl border ${C.border} p-4`}>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)] mb-3">
            Vista rápida vs. ficha completa
          </p>
          <Bullets
            items={[
              "Datos → consulta rápida: código, RUT, teléfono, deuda actual y facturas recientes.",
              "Al tocar un cliente aparece un panel lateral con deuda, facturas, recibos y contactos.",
              'El botón "Ver ficha completa" abre la ficha 360 con análisis completo, recomendación de Copilot y toda la actividad histórica.',
              "Si solo querés confirmar un dato, usá el panel lateral. Si vas a gestionar al cliente, abrí la ficha completa.",
            ]}
          />
        </div>

        <div className="flex gap-3 flex-wrap">
          <NavLink href="/copilot/datos" label="Ir a Datos" />
        </div>
      </>
    ),
  },
  {
    id: "agentes",
    icon: <Bot className="h-4 w-4" aria-hidden />,
    title: "Agentes IA — Sistema coordinado de asistentes",
    content: (
      <>
        <p className="text-sm leading-relaxed text-[var(--copilot-ink)]">
          <strong>Agentes IA</strong> son asistentes que leen el Copilot y te
          ayudan a ordenar qué revisar primero. Trabajan en conjunto: cada
          agente mira una parte del negocio, y el sistema combina lo que
          encontraron para darte una visión unificada.
        </p>
        <Callout variant="info">
          <strong>Los agentes no ejecutan acciones.</strong> No pagan, no
          borran, no envían mensajes automáticamente. Solo leen datos, ordenan
          prioridades y te llevan al módulo correcto. Vos siempre decidís qué
          hacer.
        </Callout>

        <div className={`rounded-2xl border ${C.border} p-4`}>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)] mb-3">
            Resumen coordinado
          </p>
          <p className="mb-3 text-sm text-[var(--copilot-ink)]">
            Es la pieza principal de la pantalla. Al generar el análisis, todos
            los agentes activos trabajan al mismo tiempo y el sistema combina
            sus resultados para decirte qué revisar primero.
          </p>
          <Bullets
            items={[
              "Va arriba de todo y resume el estado global: Bajo, En atención o Crítico.",
              "Muestra hasta 5 prioridades globales ordenadas por urgencia.",
              "Incluye el próximo paso recomendado para arrancar por el módulo correcto.",
              "Debajo aparecen el Agente de Riesgo y luego los agentes operativos.",
              "No mezcla monedas: UYU y USD se tratan por separado.",
              "Si falta algún dato, puede mostrar una lectura parcial sin romper la pantalla.",
            ]}
          />
        </div>

        <div className={`rounded-2xl border ${C.border} p-4`}>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)] mb-3">
            Agentes operativos
          </p>
          <p className="mb-3 text-sm text-[var(--copilot-ink)]">
            Después del Resumen coordinado y del Agente de Riesgo, la pantalla
            muestra los agentes operativos en cards separadas: Ejecutivo Diario,
            Cobranza, Tesorería, Integridad de Datos y CFO / Finanzas.
          </p>
          <Bullets
            items={[
              "Cada card explica qué analiza ese agente.",
              "Cada una muestra su estado actual y un resumen corto.",
              "Cada agente enseña hasta 3 prioridades internas para no sobrecargar la lectura.",
              "Cada card tiene un CTA principal para ir al módulo correcto.",
              "La idea es entender la pantalla en segundos y después entrar al detalle donde corresponda.",
            ]}
          />
        </div>

        <div className={`rounded-2xl border ${C.border} p-4`}>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)] mb-3">
            Agente Ejecutivo Diario
          </p>
          <p className="mb-3 text-sm text-[var(--copilot-ink)]">
            Lee notificaciones, caja, cartera, pagos y estado operacional.
            Resume el día con las cosas más importantes para atender.
          </p>
          <Bullets
            items={[
              "Detecta problemas de sincronización, riesgo de caja y clientes vencidos.",
              "Indica qué cambió desde la última vez.",
              "Sugiere el próximo paso concreto.",
              "Usa reglas del sistema, no reemplaza tu criterio.",
            ]}
          />
        </div>

        <div className={`rounded-2xl border ${C.border} p-4`}>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)] mb-3">
            Agente de Cobranza
          </p>
          <p className="mb-3 text-sm text-[var(--copilot-ink)]">
            Revisa los clientes con saldo vencido, gestiones registradas,
            promesas de pago y seguimientos pendientes. Los ordena por urgencia
            y te indica a quien atender primero.
          </p>
          <Bullets
            items={[
              "Clientes vencidos ordenados por monto, de mayor a menor.",
              "Promesas de pago vencidas — si un cliente prometió pagar y la fecha ya pasó.",
              "Seguimientos vencidos — si tenés un próximo contacto programado para hoy o antes.",
              "Reintentos — clientes que no respondieron hace 2 o más días.",
              "Si hay más de 3 clientes vencidos, muestra un resumen de cartera.",
              "No sugiere enviar mensajes automáticamente.",
            ]}
          />
        </div>

        <div className={`rounded-2xl border ${C.border} p-4`}>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)] mb-3">
            Seguimiento de cobranza
          </p>
          <p className="mb-3 text-sm text-[var(--copilot-ink)]">
            Cuando registrás una gestión en la ficha del cliente, Copilot
            puede recordarte volver a contactarlo. Esto se basa en lo que
            registraste en Gestión de cobranza, no en los datos contables.
          </p>
          <Bullets
            items={[
              "Próximo seguimiento — si agendaste una fecha futura, aparece en Acciones con badge 'Seguimiento programado' (azul). Cuando llega el día, el badge cambia a 'Seguimiento hoy' (ámbar). Si la fecha pasó sin registrar contacto, aparece como 'Seguimiento vencido' (rojo) con prioridad alta.",
              "Promesa de pago — si el cliente prometió pagar y la fecha llegó sin confirmación, aparece como prioridad crítica.",
              "Promesa futura — si la promesa es para más adelante, aparece como baja prioridad mientras no venza.",
              "Sin respuesta — si la última gestión fue 'Sin respuesta' y pasaron 2 o más días, sugiere reintentar el contacto.",
              "Contacto incorrecto — si registraste 'Contacto incorrecto', el agente lo marca como prioridad para actualizar los datos.",
            ]}
          />
          <Callout variant="info">
            Los badges de seguimiento (programado / hoy / vencido) también aparecen en el historial del cliente, dentro de cada gestión. Así podés ver de un vistazo el estado del seguimiento sin leer toda la nota.
          </Callout>
          <Callout variant="warning">
            Registrar una promesa de pago NO marca la factura como pagada ni
            modifica el saldo. Solo es un seguimiento operativo. Para registrar
            un pago real, usá el sistema contable (Zeta).
          </Callout>
        </div>

        <div className={`rounded-2xl border ${C.border} p-4`}>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)] mb-3">
            Agente de Tesorería
          </p>
          <p className="mb-3 text-sm text-[var(--copilot-ink)]">
            Revisa notificaciones de tesorería y ordena lo que necesita atención:
            pagos vencidos, riesgo de caja, pagos que vencen hoy y compromisos
            próximos. No modifica ni ejecuta pagos.
          </p>
          <Bullets
            items={[
              "Pagos vencidos — si hay obligaciones con fecha pasada, las muestra como prioridad crítica.",
              "Riesgo de caja — si la caja puede quedar ajustada después de los pagos próximos.",
              "Vence hoy — pagos programados para hoy, para confirmar antes de cerrar el día.",
              "Próximos 1-3 días — compromisos inminentes que conviene revisar con anticipación.",
              "Próximos 7 días — compromisos de la semana para planificación.",
              "Solo lee notificaciones. No toca pagos ni saldos.",
            ]}
          />
          <Callout variant="info">
            El Agente de Tesorería trabaja junto al Agente Ejecutivo Diario. Si
            ambos detectan el mismo pago vencido, el sistema muestra la señal
            una sola vez — la de mayor urgencia — para no duplicar alertas.
          </Callout>
        </div>

        <div className={`rounded-2xl border ${C.border} p-4`}>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)] mb-3">
            Agente de Integridad de Datos
          </p>
          <p className="mb-3 text-sm text-[var(--copilot-ink)]">
            Revisa si los datos están actualizados y si hay problemas de
            sincronización con fuentes externas como Zeta. No reinicia
            procesos ni modifica datos. Te lleva a Operacional para ver
            el detalle.
          </p>
          <Bullets
            items={[
              "Sincronización fallida — si una actualización de datos no se completó, lo muestra como prioridad.",
              "Fuente externa con problemas — si Zeta u otra fuente falla, informa de forma simple.",
              "Datos desactualizados — si el proceso no se ejecutó en la ventana esperada.",
              "Inconsistencias detectadas — si hay datos que no coinciden entre fuentes.",
              "Todo bien — si no hay señales de problema, muestra estado estable.",
              "No modifica datos ni reinicia sincronizaciones.",
            ]}
          />
          <Callout variant="info">
            Si Zeta falla, Copilot puede seguir mostrando los últimos datos
            disponibles. El Agente de Integridad te avisa para que revises
            Operacional y entiendas qué está pasando.
          </Callout>
        </div>

        <div className={`rounded-2xl border ${C.border} p-4`}>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)] mb-3">
            Agente CFO / Finanzas
          </p>
          <p className="mb-3 text-sm text-[var(--copilot-ink)]">
            Analiza la situación financiera del negocio: liquidez, cartera vencida,
            egresos proyectados y calidad de los datos. Te lleva al módulo correcto
            según lo que encuentra. No modifica datos ni ejecuta pagos.
          </p>
          <Bullets
            items={[
              "Riesgo de liquidez — si la lectura financiera muestra riesgo crítico o alto, lo informa como prioridad.",
              "Caja en riesgo — si una notificación indica que los egresos pueden superar la caja disponible.",
              "Cartera vencida — si hay clientes con saldo vencido que pueden afectar la cobranza esperada.",
              "Egresos próximos — pagos vencidos o con vencimiento próximo que pueden impactar el flujo de caja.",
              "Datos parciales — si la lectura financiera puede estar incompleta, avisa para que lo confirmes.",
              "Solo lee datos. No inventa montos. No ejecuta ninguna acción.",
            ]}
          />
          <Callout variant="info">
            El Agente CFO trabaja junto al Agente de Tesorería. Si ambos detectan
            el mismo compromiso de pago, el sistema muestra la señal una sola vez
            — la de mayor urgencia — para no duplicar alertas.
          </Callout>
        </div>

        <div className={`rounded-2xl border ${C.border} p-4`}>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)] mb-3">
            Agente de Riesgo
          </p>
          <p className="mb-3 text-sm text-[var(--copilot-ink)]">
            Aparece debajo del Resumen coordinado como una lectura global.
            Junta señales de caja, cobranza, pagos, datos y finanzas para
            resumir si el negocio está en riesgo bajo, en atención o crítico.
            No cambia datos ni ejecuta acciones.
          </p>
          <Bullets
            items={[
              "Revisar caja — si hay pagos vencidos, caja ajustada o compromisos importantes.",
              "Revisar cobranza — si hay deuda vencida, promesas caídas o seguimientos pendientes.",
              "Validar datos — si conviene revisar la actualización antes de decidir.",
              "Ver Finanzas — si la lectura financiera general requiere monitoreo.",
              "No tapa las prioridades específicas: solo te indica dónde mirar primero.",
            ]}
          />
          <Callout variant="info">
            El Agente de Riesgo no modifica datos, no crea pagos, no marca
            facturas como pagadas y no envía mensajes. Solo resume el nivel
            de riesgo operativo.
          </Callout>
        </div>

        <div className={`rounded-2xl border ${C.border} p-4`}>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)] mb-3">
            Agente de Cliente
          </p>
          <p className="mb-3 text-sm text-[var(--copilot-ink)]">
            El Agente de Cliente trabaja dentro de cada ficha de cliente.
            En la pantalla de Agentes IA solo aparece como referencia para
            recordarte donde encontrarlo. No aparece en el resumen global
            porque analiza un cliente puntual, no el negocio en general.
          </p>
          <Bullets
            items={[
              "Resume la situación de un cliente: sin deuda, al día, vencida o con promesa.",
              "Dice qué pasa, por qué importa y qué hacer ahora para ese cliente específico.",
              "Puede sugerir preparar cobranza, ver seguimiento, ver contactos o revisar actualización.",
              "No modifica datos. No envía mensajes. No marca facturas como pagadas.",
              "El usuario decide si contacta, genera un mensaje o registra una gestión.",
            ]}
          />
        </div>

        <div className={`rounded-2xl border ${C.border} p-4`}>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)] mb-3">
            Qué pueden y qué no pueden hacer
          </p>
          <p className="mb-3 text-sm text-[var(--copilot-ink)]">
            Al final de la pantalla vas a ver un bloque de seguridad con este
            resumen rápido:
          </p>
          <Bullets
            items={[
              "Pueden leer información, resumir, priorizar y sugerir el siguiente paso.",
              "No pueden pagar, borrar, modificar importes ni enviar mensajes automáticamente.",
              "No pueden marcar facturas como pagadas.",
              "Vos siempre decidís qué hacer después de leer la recomendación.",
            ]}
          />
        </div>

        <div className={`rounded-2xl border ${C.border} p-4`}>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)] mb-3">
            Agentes preparados para próximas versiones
          </p>
          <p className="mb-2 text-sm text-[var(--copilot-ink)]">
            Ya están definidos pero todavía no están activos:
          </p>
          <Bullets
            items={[
              "Alertas — priorizacion de avisos del sistema.",
            ]}
          />
        </div>

        <div className={`rounded-2xl border ${C.border} p-4`}>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)] mb-3">
            Niveles de prioridad
          </p>
          <div className="space-y-2">
            {[
              { label: "Crítica", color: "bg-rose-50 text-rose-700 border-rose-200", desc: "Requiere atención inmediata. Puede afectar caja o datos." },
              { label: "Alta", color: "bg-amber-50 text-amber-700 border-amber-200", desc: "Importante. Conviene atenderla hoy." },
              { label: "Media", color: "bg-blue-50 text-blue-700 border-blue-100", desc: "Para revisar cuando puedas, sin urgencia inmediata." },
              { label: "Baja", color: "bg-slate-100 text-slate-600 border-slate-200", desc: "Informativa. Puede esperar." },
            ].map((s) => (
              <div key={s.label} className="flex items-start gap-3 text-sm">
                <span className={`mt-0.5 inline-flex shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${s.color}`}>
                  {s.label}
                </span>
                <span className="text-[var(--copilot-ink)]">{s.desc}</span>
              </div>
            ))}
          </div>
        </div>

        <div className={`rounded-2xl border ${C.border} p-4`}>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)] mb-3">
            Preguntas frecuentes
          </p>
          <div className="space-y-4">
            {[
              {
                q: "¿Los agentes trabajan juntos?",
                a: "Sí. Cada agente mira una parte del negocio. Arriba ves el Resumen coordinado, después el Agente de Riesgo y luego los agentes operativos por separado.",
              },
              {
                q: "¿Qué significa 'Prioridades principales'?",
                a: "Son las prioridades más urgentes de todos los agentes activos juntos. Se ordenan de mayor a menor urgencia, se muestran sin duplicados y te ayudan a decidir por dónde empezar.",
              },
              {
                q: "¿Copilot puede escribir mensajes de cobranza?",
                a: "Sí. Podés generar mensajes sugeridos para WhatsApp o email desde la ficha de cada cliente. Copilot no los envía automáticamente. Vos revisás el texto y decidís si enviarlo.",
              },
              {
                q: "¿Los agentes pueden equivocarse?",
                a: "Pueden mostrar información incompleta si los datos no están sincronizados. Siempre conviene verificar en el módulo correspondiente antes de actuar.",
              },
              {
                q: "¿Con qué frecuencia debo generar el análisis?",
                a: "Al inicio del día o cuando necesites una mirada rápida. Podés repetirlo cuando quieras para actualizar el resultado.",
              },
              {
                q: "¿El Agente de Tesorería puede pagar o modificar algo?",
                a: "No. Solo lee las notificaciones de tesorería y las ordena por urgencia. Para confirmar o registrar un pago, tenés que ir a Tesorería y hacerlo manualmente.",
              },
              {
                q: "¿Qué hace el Agente de Integridad de Datos?",
                a: "Te explica si los datos están actualizados y si hay algo que revisar en la conexión o sincronización. Te lleva a Operacional para ver el detalle. No reinicia procesos ni modifica nada.",
              },
              {
                q: "¿Si Zeta falla, Copilot deja de funcionar?",
                a: "No necesariamente. Copilot puede mostrar los últimos datos disponibles y avisarte en Operacional que la actualización necesita revisión. El agente te informa para que puedas actuar.",
              },
              {
                q: "¿Por qué el mismo pago vencido aparece solo una vez si lo detectan dos agentes?",
                a: "El sistema deduplica por destino: si el Agente Ejecutivo y el de Tesorería detectan el mismo pago, muestra una sola prioridad — la de mayor urgencia — para no repetir la misma alerta.",
              },
              {
                q: "¿Qué hace el Agente CFO / Finanzas?",
                a: "Analiza liquidez, cartera vencida, egresos próximos y calidad de los datos financieros. Si detecta riesgo de caja o datos incompletos, te lleva a Finanzas, Cartera o Tesorería según corresponda. No modifica datos ni ejecuta pagos.",
              },
              {
                q: "¿El Agente CFO puede ver la lectura de Finanzas?",
                a: "Sí. Lee la información de Finanzas para detectar riesgo de liquidez y datos parciales. Si esa lectura no está disponible, usa señales de tesorería y cartera como fuente alternativa.",
              },
              {
                q: "¿Qué significa riesgo operativo?",
                a: "Es una lectura simple de señales que pueden afectar la operación: caja, pagos, cobranza, datos o finanzas.",
              },
              {
                q: "¿El Agente de Riesgo decide por mí?",
                a: "No. Solo ordena señales y te recomienda dónde mirar primero.",
              },
              {
                q: "¿El Agente de Cliente puede cobrar automáticamente?",
                a: "No. Solo recomienda qué hacer. Vos decidís si generás un mensaje, contactás al cliente o registrás una gestión. El agente no modifica datos, no envía mensajes ni marca facturas como pagadas.",
              },
              {
                q: "¿Por qué el Agente de Cliente no aparece en el resumen global de Agentes IA?",
                a: "Porque analiza un cliente puntual, no el negocio en general. Lo encontrás directamente en la ficha de cada cliente, arriba del asistente de cobranza.",
              },
            ].map(({ q, a }) => (
              <div key={q}>
                <p className="text-sm font-semibold text-[var(--copilot-ink)]">{q}</p>
                <p className="mt-0.5 text-sm text-[var(--copilot-ink-muted)]">{a}</p>
              </div>
            ))}
          </div>
        </div>

        <Callout variant="tip">
          Usa los agentes al inicio del dia para tener una mirada rapida de que
          requiere atencion. Despues vas a los modulos especificos para actuar.
        </Callout>
        <div className="flex gap-3 flex-wrap">
          <NavLink href="/copilot/agentes" label="Ir a Agentes IA" />
        </div>
      </>
    ),
  },
  {
    id: "operacional",
    icon: <Activity className="h-4 w-4" aria-hidden />,
    title: "Operacional — Estado de la sincronización",
    content: (
      <>
        <p className="text-sm leading-relaxed text-[var(--copilot-ink)]">
          <strong>Operacional</strong> muestra si los datos se están actualizando
          correctamente. Es el panel técnico del sistema.
        </p>
        <Callout variant="info">
          En general, no necesitás entrar a Operacional a diario. Solo revisalo
          cuando veas que algo parece desactualizado o cuando una alerta de sistema
          lo indique.
        </Callout>
        <div className={`rounded-2xl border ${C.border} p-4`}>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)] mb-3">
            Qué muestra
          </p>
          <Bullets
            items={[
              "Cuándo fue la última actualización de datos.",
              "Si la conexión con el sistema contable está funcionando.",
              "Cuántas actualizaciones salieron bien y cuántas fallaron.",
              "El estado general de los flujos de datos.",
            ]}
          />
        </div>
        <div className={`rounded-2xl border ${C.border} p-4`}>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)] mb-3">
            Si los datos parecen desactualizados
          </p>
          <Steps
            items={[
              "Entrá a Operacional.",
              "Mirá cuándo fue el último sync exitoso.",
              "Si dice «Degradado» o «Crítico», puede ser un problema externo.",
              "Los datos anteriores siguen visibles mientras dura el problema.",
              "El sistema se recupera solo cuando la conexión vuelve.",
            ]}
          />
        </div>
        <Callout variant="warning">
          Si el sistema contable (Zeta) tiene un problema, Copilot lo muestra en
          Operacional. Esto <strong>no significa que Copilot esté roto</strong> —
          los datos anteriores siguen siendo válidos hasta la próxima actualización.
        </Callout>
        <div className="flex gap-3 flex-wrap">
          <NavLink href="/copilot/operacional" label="Ir a Operacional" />
        </div>
      </>
    ),
  },
  {
    id: "estado",
    icon: <AlertTriangle className="h-4 w-4" aria-hidden />,
    title: "Estado: Atención / Estable / Crítico",
    content: (
      <>
        <p className="text-sm leading-relaxed text-[var(--copilot-ink)]">
          El estado del negocio aparece en la parte superior de la pantalla y en
          algunas páginas como Hoy y Operacional. Te indica de un vistazo si todo
          está bien o si hay algo para atender.
        </p>
        <div className="space-y-3">
          {[
            {
              pill: "ok" as const,
              title: "Estable",
              desc: "Todo está dentro de lo esperado. Podés operar con normalidad.",
              color: "border-emerald-200 bg-emerald-50/60",
            },
            {
              pill: "warning" as const,
              title: "Atención",
              desc: "Hay algo para revisar. No es urgente, pero conviene no ignorarlo. Tocar el estado muestra el detalle.",
              color: "border-amber-200 bg-amber-50/60",
            },
            {
              pill: "critical" as const,
              title: "Crítico",
              desc: "Hay algo importante que puede afectar caja, pagos o la calidad de los datos. Revisarlo pronto.",
              color: "border-rose-200 bg-rose-50/60",
            },
          ].map((row) => (
            <div
              key={row.title}
              className={`flex items-start gap-3 rounded-xl border p-4 ${row.color}`}
            >
              <StatusPill level={row.pill} />
              <p className="text-sm leading-relaxed text-[var(--copilot-ink)]">
                {row.desc}
              </p>
            </div>
          ))}
        </div>
        <Callout variant="tip">
          Al tocar o hacer clic sobre el estado se despliega el detalle: qué alertas
          están activas, cuáles son críticas y cuáles son solo informativas.
        </Callout>
        <div className="flex flex-wrap gap-3">
          <NavLink href="/copilot/operacional" label="Ver Operacional" ghost />
          <NavLink href="/copilot/alertas" label="Ver Alertas" ghost />
          <NavLink href="/copilot/acciones" label="Ver Acciones" ghost />
        </div>
      </>
    ),
  },
  {
    id: "campana",
    icon: <Bell className="h-4 w-4" aria-hidden />,
    title: "Campana de notificaciones",
    content: (
      <>
        <p className="text-sm leading-relaxed text-[var(--copilot-ink)]">
          La campana aparece en la parte superior de la pantalla. Cuando tiene un
          número rojo, significa que hay novedades sin leer.
        </p>
        <div className={`rounded-2xl border ${C.border} p-4`}>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)] mb-3">
            Qué puede notificar
          </p>
          <Bullets
            items={[
              "Un cliente pagó una factura.",
              "Un cliente quedó con deuda vencida.",
              "Un pago importante vence pronto.",
              "Un pago ya pasó su fecha sin registrarse.",
              "Hubo un problema en la actualización de datos.",
            ]}
          />
        </div>
        <div className={`rounded-2xl border ${C.border} p-4`}>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)] mb-3">
            Cómo funciona
          </p>
          <Bullets
            items={[
              "Tocar el botón de la campana abre el panel de notificaciones.",
              "Cada notificación tiene un link para ir directo al detalle.",
              "«Marcar todas como leídas» quita el número rojo — no borra las notificaciones.",
              "«Ver todas» lleva al listado completo en Alertas.",
            ]}
          />
        </div>
        <div className="flex gap-3 flex-wrap">
          <NavLink href="/copilot/alertas" label="Ver todas las alertas" ghost />
        </div>
      </>
    ),
  },
  {
    id: "problemas",
    icon: <AlertTriangle className="h-4 w-4" aria-hidden />,
    title: "¿Qué hacer si algo aparece en rojo?",
    content: (
      <>
        <p className="text-sm leading-relaxed text-[var(--copilot-ink)]">
          Ver algo en rojo no significa que el negocio está en crisis. Puede ser
          una alerta importante o simplemente un dato para revisar.
        </p>
        <div className={`rounded-2xl border ${C.border} p-4`}>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)] mb-3">
            Pasos para actuar
          </p>
          <Steps
            items={[
              "Leer el mensaje. Entender qué dice antes de actuar.",
              "Ir a Alertas para ver el historial completo.",
              "Ir a Acciones para ver qué conviene hacer.",
              "Seguir el link de la alerta hacia el módulo correspondiente.",
              "Si el problema es de datos o sincronización → ir a Operacional.",
              "Si el problema es un pago vencido → ir a Tesorería.",
              "Si el problema es un cliente → ir a Clientes o Cartera.",
            ]}
          />
        </div>
        <Callout variant="info">
          Si todo aparece rojo al mismo tiempo y los datos parecen viejos,
          probablemente sea un problema temporal de sincronización. Revisá
          Operacional y esperá la próxima actualización automática.
        </Callout>
        <div className="flex flex-wrap gap-3">
          <NavLink href="/copilot/alertas" label="Ir a Alertas" ghost />
          <NavLink href="/copilot/acciones" label="Ir a Acciones" ghost />
          <NavLink href="/copilot/operacional" label="Ir a Operacional" ghost />
        </div>
      </>
    ),
  },
];

// ─── FAQ ──────────────────────────────────────────────────────────────────────

const FAQ: Array<{ q: string; a: React.ReactNode }> = [
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
    a: "Copilot usa los últimos datos disponibles y muestra el problema en Operacional. Los datos anteriores siguen siendo válidos. El sistema se recupera solo cuando la conexión vuelve.",
  },
  {
    q: "¿Cada cuánto se actualizan los datos?",
    a: "Los datos críticos (saldos, facturas, recibos) se actualizan automáticamente cada 2 horas.",
  },
  {
    q: "¿Qué significa marcar una alerta como leída?",
    a: "Que ya la viste. No borra la alerta — queda en el historial para consultarla cuando quieras.",
  },
  {
    q: "¿Dónde veo quién me debe?",
    a: (
      <span>
        En <NavLink href="/copilot/cartera" label="Cartera" ghost /> y en{" "}
        <NavLink href="/copilot/clientes" label="Clientes" ghost />.
      </span>
    ),
  },
  {
    q: "¿Dónde veo qué tengo que pagar?",
    a: (
      <span>
        En <NavLink href="/copilot/tesoreria?section=pagos" label="Tesorería → Pagos" ghost />.
      </span>
    ),
  },
  {
    q: "¿Dónde veo qué hacer primero?",
    a: (
      <span>
        En <NavLink href="/copilot/acciones" label="Acciones" ghost />.
      </span>
    ),
  },
  {
    q: "¿Dónde veo si los datos están actualizados?",
    a: (
      <span>
        En <NavLink href="/copilot/operacional" label="Operacional" ghost />.
      </span>
    ),
  },
  {
    q: "¿Los agentes pueden modificar datos?",
    a: "No. En esta versión solo leen información y sugieren acciones. Vos decidís qué hacer.",
  },
  {
    q: "¿El agente envía WhatsApp o emails?",
    a: "No. Puede llevarte al cliente o a la acción correspondiente, pero no envía mensajes automáticamente.",
  },
  {
    q: "¿Qué pasa si Zeta falla y uso el agente?",
    a: "El agente puede mostrar información con los últimos datos disponibles y recomendar revisar Operacional. No inventa datos nuevos.",
  },
  {
    q: "Copié o envié un mensaje al cliente. ¿Qué hago ahora?",
    a: "Si usaste la card Enviar estado de cuenta, Copilot te va a ofrecer el botón Registrar gestión automáticamente. Hacé clic, revisá el pre-llenado (canal y nota) y guardá. Si no usaste esa card, abrí la ficha del cliente, andá a Gestión de cobranza y registrá manualmente: canal, resultado (por ejemplo 'Contactado') y una nota. Eso queda en el historial y lo usan Acciones y Agentes para saber que el cliente ya fue contactado.",
  },
  {
    q: "¿Registrar una gestión modifica la deuda del cliente?",
    a: "No. Registrar una gestión es solo un seguimiento operativo. No modifica facturas, saldos ni pagos. Para marcar un pago, hacelo desde el sistema contable (Zeta).",
  },
  {
    q: "¿Qué pasa si un cliente prometió pagar?",
    a: "Copilot lo muestra como seguimiento de baja prioridad mientras la fecha no llegó. Si llega la fecha y la deuda sigue abierta, lo muestra como prioridad crítica para que lo verifiques. Registrar una promesa de pago no marca ninguna factura como pagada.",
  },
  {
    q: "¿Qué pasa si cargo una fecha de próximo seguimiento?",
    a: "Cuando llega ese día, Copilot lo muestra como prioridad alta en los Agentes y en Acciones. Es un recordatorio operativo — no ejecuta ninguna acción automática.",
  },
  {
    q: "¿Qué es la Agenda de cobranza y cómo la uso?",
    a: "Es una pestaña dentro de Acciones que agrupa todos los seguimientos, promesas y contactos recientes en un solo lugar. La encontrás en Acciones → pestaña 'Agenda de cobranza', o entrando directo a /copilot/acciones?tab=agenda. También aparece resumida en Hoy: una card con counts de vencidos, hoy, próximos y promesas. Filtrá por categoría y hacé clic en Ver cliente para ir a la ficha. Solo muestra lo que vos registraste — no genera datos ni modifica deuda.",
  },
];

function FaqBlock() {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <div className="space-y-2">
      {FAQ.map((item, i) => (
        <div
          key={i}
          className={`overflow-hidden rounded-2xl border ${C.border} bg-white/90`}
        >
          <button
            type="button"
            onClick={() => setOpen(open === i ? null : i)}
            aria-expanded={open === i}
            className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition hover:bg-slate-50/60"
          >
            <span className="text-sm font-semibold text-[var(--copilot-ink)]">
              {item.q}
            </span>
            <ChevronDown
              className={`h-4 w-4 shrink-0 text-[var(--copilot-ink-muted)] transition-transform duration-200 ${open === i ? "rotate-180" : ""}`}
              aria-hidden
            />
          </button>
          {open === i && (
            <div
              className={`border-t ${C.border}/60 px-5 py-4 text-sm leading-relaxed text-[var(--copilot-ink-muted)]`}
            >
              {item.a}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Module index cards ───────────────────────────────────────────────────────

const MODULE_CARDS = [
  { icon: <ListTodo className="h-5 w-5" />, label: "Hoy", href: "/copilot/hoy", color: "text-emerald-600 bg-emerald-50" },
  { icon: <CheckSquare className="h-5 w-5" />, label: "Acciones", href: "/copilot/acciones", color: "text-blue-600 bg-blue-50" },
  { icon: <Bell className="h-5 w-5" />, label: "Alertas", href: "/copilot/alertas", color: "text-amber-600 bg-amber-50" },
  { icon: <Users className="h-5 w-5" />, label: "Clientes", href: "/copilot/clientes", color: "text-violet-600 bg-violet-50" },
  { icon: <Landmark className="h-5 w-5" />, label: "Cartera", href: "/copilot/cartera", color: "text-orange-600 bg-orange-50" },
  { icon: <Banknote className="h-5 w-5" />, label: "Tesorería", href: "/copilot/tesoreria", color: "text-teal-600 bg-teal-50" },
  { icon: <Wallet className="h-5 w-5" />, label: "Finanzas", href: "/copilot/finanzas", color: "text-indigo-600 bg-indigo-50" },
  { icon: <Database className="h-5 w-5" />, label: "Datos", href: "/copilot/datos", color: "text-slate-600 bg-slate-100" },
  { icon: <Bot className="h-5 w-5" />, label: "Agentes IA", href: "/copilot/agentes", color: "text-purple-600 bg-purple-50" },
  { icon: <Activity className="h-5 w-5" />, label: "Operacional", href: "/copilot/operacional", color: "text-rose-600 bg-rose-50" },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ManualPage() {
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());

  function toggleSection(id: string) {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <div className="border-b border-[var(--copilot-border)] bg-white/60 px-6 py-6">
        <div className="flex items-center gap-2 mb-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--copilot-border)] bg-white px-2.5 py-0.5 text-[11px] font-semibold text-[var(--copilot-ink-muted)]">
            <BookMarked className="h-3 w-3" aria-hidden />
            Guía para usuarios
          </span>
        </div>
        <h1 className="text-xl font-bold text-[var(--copilot-ink)]">
          Manual de uso
        </h1>
        <p className="mt-1 text-sm text-[var(--copilot-ink-muted)]">
          Guía simple para entender qué está pasando en tu negocio y qué hacer
          después.
        </p>
        <div className="mt-4">
          <NavLink href="/copilot/hoy" label="Empezar por Hoy" />
        </div>
      </div>

      <div className="space-y-8 px-6 py-6">
        {/* ── Copilot en 5 minutos ───────────────────────────────────────── */}
        <section>
          <div className={`${C.card} p-6`}>
            <div className="flex items-center gap-2 mb-4">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--copilot-accent)] text-[11px] font-bold text-white">
                ✦
              </span>
              <h2 className="text-base font-semibold text-[var(--copilot-ink)]">
                Copilot en 5 minutos
              </h2>
            </div>
            <Steps
              items={[
                "Abrí Hoy — es la pantalla principal. Muestra caja, deuda y pagos de un vistazo.",
                "Mirá el estado en la parte de arriba — Estable, Atención o Crítico.",
                "Revisá si hay notificaciones — la campana en la esquina superior derecha.",
                "Entrá a Acciones — ahí están las cosas concretas que conviene hacer hoy.",
                "Si hay clientes vencidos → abrí su ficha, escribí por WhatsApp o email.",
                "Si hay pagos próximos → entrá a Tesorería para confirmar que estén listos.",
                "Si querés una mirada más amplia → entrá a Finanzas.",
                "Si algo parece desactualizado → revisá Operacional.",
              ]}
            />
          </div>
        </section>

        {/* ── Módulos ────────────────────────────────────────────────────── */}
        <section>
          <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
            Módulos del sistema
          </h2>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-5">
            {MODULE_CARDS.map((m) => (
              <Link
                key={m.label}
                href={m.href}
                className={`${C.card} flex flex-col items-center gap-2 p-3 text-center transition hover:shadow-md`}
              >
                <span
                  className={`flex h-10 w-10 items-center justify-center rounded-xl ${m.color}`}
                >
                  {m.icon}
                </span>
                <span className="text-[12px] font-semibold text-[var(--copilot-ink)]">
                  {m.label}
                </span>
              </Link>
            ))}
          </div>
        </section>

        {/* ── Secciones detalladas ───────────────────────────────────────── */}
        <section>
          <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
            Guía detallada por módulo
          </h2>
          <Accordion
            sections={SECTIONS}
            openIds={openIds}
            onToggle={toggleSection}
          />
        </section>

        {/* ── Flujo recomendado ──────────────────────────────────────────── */}
        <section>
          <div className={`${C.card} p-6`}>
            <h2 className="mb-1 text-base font-semibold text-[var(--copilot-ink)]">
              Flujo recomendado del día
            </h2>
            <p className="mb-5 text-sm text-[var(--copilot-ink-muted)]">
              Si solo tenés 10 minutos, hacé esto en orden.
            </p>
            <div className="space-y-3">
              {[
                {
                  step: 1,
                  label: "Hoy",
                  desc: "Mirá caja, pagos y clientes críticos.",
                  href: "/copilot/hoy",
                  color: "bg-emerald-100 text-emerald-800",
                },
                {
                  step: 2,
                  label: "Estado",
                  desc: "Verificá si hay algo urgente en el semáforo.",
                  href: "/copilot/hoy",
                  color: "bg-amber-100 text-amber-800",
                },
                {
                  step: 3,
                  label: "Acciones",
                  desc: "Ejecutá las acciones críticas primero.",
                  href: "/copilot/acciones",
                  color: "bg-blue-100 text-blue-800",
                },
                {
                  step: 4,
                  label: "Alertas",
                  desc: "Revisá novedades del negocio.",
                  href: "/copilot/alertas",
                  color: "bg-violet-100 text-violet-800",
                },
                {
                  step: 5,
                  label: "Clientes / Cartera",
                  desc: "Gestioná cobros vencidos.",
                  href: "/copilot/cartera",
                  color: "bg-orange-100 text-orange-800",
                },
                {
                  step: 6,
                  label: "Tesorería",
                  desc: "Confirmá pagos próximos.",
                  href: "/copilot/tesoreria",
                  color: "bg-teal-100 text-teal-800",
                },
                {
                  step: 7,
                  label: "Finanzas",
                  desc: "Revisá la mirada general si cambiaron cosas.",
                  href: "/copilot/finanzas",
                  color: "bg-indigo-100 text-indigo-800",
                },
                {
                  step: 8,
                  label: "Operacional",
                  desc: "Solo si algo parece desactualizado.",
                  href: "/copilot/operacional",
                  color: "bg-rose-100 text-rose-800",
                },
              ].map((row) => (
                <Link
                  key={row.step}
                  href={row.href}
                  className={`flex items-center gap-4 rounded-xl border ${C.border} bg-white/60 px-4 py-3 transition hover:bg-white hover:shadow-sm`}
                >
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[12px] font-bold ${row.color}`}
                  >
                    {row.step}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-[var(--copilot-ink)]">
                      {row.label}
                    </p>
                    <p className="text-xs text-[var(--copilot-ink-muted)]">
                      {row.desc}
                    </p>
                  </div>
                  <ChevronRight
                    className="h-4 w-4 shrink-0 text-[var(--copilot-ink-muted)]"
                    aria-hidden
                  />
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* ── FAQ ────────────────────────────────────────────────────────── */}
        <section>
          <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
            Preguntas frecuentes
          </h2>
          <FaqBlock />
        </section>

        {/* ── Footer ─────────────────────────────────────────────────────── */}
        <div className={`${C.card} flex items-center justify-between gap-4 p-5`}>
          <div>
            <p className="text-sm font-semibold text-[var(--copilot-ink)]">
              ¿Listo para empezar?
            </p>
            <p className="text-xs text-[var(--copilot-ink-muted)]">
              Empezá por Hoy — la pantalla principal del negocio.
            </p>
          </div>
          <NavLink href="/copilot/hoy" label="Ir a Hoy" />
        </div>
      </div>
    </div>
  );
}
