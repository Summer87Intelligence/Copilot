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
        <div className={`rounded-2xl border ${C.border} p-4`}>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)] mb-3">
            Qué ves en Hoy
          </p>
          <Bullets
            items={[
              "Caja disponible — cuánto dinero hay ahora.",
              "Pagos próximos — qué salidas están programadas en los próximos días.",
              "Después de pagos — cuánto quedaría si se pagan todos los compromisos.",
              "Por cobrar — facturas abiertas que los clientes aún no pagaron.",
              "Clientes con deuda — quiénes deben más o llevan más tiempo sin pagar.",
            ]}
          />
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
              "Si hay montos inusuales → comparar con Cartera para confirmar.",
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
              "Teléfono — si el cliente tiene teléfono cargado en el sistema, aparece en su ficha. Si no, se indica «Sin teléfono cargado».",
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
          <strong>Tesorería</strong> muestra el dinero que manejás operativamente:
          cuánto hay en caja, qué pagos están programados y qué compromisos
          recurrentes tenés.
        </p>
        <div className={`rounded-2xl border ${C.border} p-4`}>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)] mb-3">
            Secciones de Tesorería
          </p>
          <Bullets
            items={[
              "Resumen — visión general de caja y pagos próximos.",
              "Pagos — obligaciones específicas: impuestos, proveedores, servicios.",
              "Caja manual — movimientos de entrada y salida que registrás vos.",
              "Recurrentes — pagos que se repiten (sueldos, servicios fijos, etc.).",
              "Conciliación — comparación entre lo registrado y el banco.",
            ]}
          />
        </div>
        <Callout variant="info">
          <strong>Importante:</strong> un pago registrado en Tesorería solo afecta
          el saldo de caja si también se registra el movimiento correspondiente.
          Si tenés dudas, hablá con tu contador.
        </Callout>
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
              "Recibos — cobros registrados.",
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
          <strong>Agentes IA</strong> son asistentes que leen la informacion del
          negocio y te ayudan a ordenar que revisar primero. Trabajan en
          conjunto: cada agente mira una parte del negocio, y el sistema combina
          lo que encontraron para darte una vision unificada.
        </p>
        <Callout variant="info">
          <strong>Los agentes no ejecutan acciones.</strong> No pagan, no
          borran, no envian mensajes automaticamente. Solo leen datos, ordenan
          prioridades y te llevan al modulo correcto. Vos siempre decides que
          hacer.
        </Callout>

        <div className={`rounded-2xl border ${C.border} p-4`}>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)] mb-3">
            Resumen coordinado
          </p>
          <p className="mb-3 text-sm text-[var(--copilot-ink)]">
            Al generar el analisis, todos los agentes activos trabajan al mismo
            tiempo. El sistema combina sus resultados, elimina duplicados y
            ordena las prioridades mas importantes de mayor a menor urgencia.
          </p>
          <Bullets
            items={[
              "Muestra hasta 5 prioridades globales ordenadas por urgencia.",
              "Las prioridades vienen de todos los agentes activos, no de uno solo.",
              "No mezcla monedas: UYU y USD se tratan por separado.",
              "El estado puede ser Estable, En atencion o Critico.",
              "Siempre sugiere el proximo paso mas importante a dar.",
            ]}
          />
        </div>

        <div className={`rounded-2xl border ${C.border} p-4`}>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)] mb-3">
            Agente Ejecutivo Diario
          </p>
          <p className="mb-3 text-sm text-[var(--copilot-ink)]">
            Lee notificaciones, caja, cartera, pagos y estado operacional.
            Resume el dia con las cosas mas importantes para atender.
          </p>
          <Bullets
            items={[
              "Detecta problemas de sincronizacion, riesgo de caja y clientes vencidos.",
              "Indica que cambio desde la ultima vez.",
              "Sugiere el proximo paso concreto.",
              "Usa reglas del sistema, no reemplaza tu criterio.",
            ]}
          />
        </div>

        <div className={`rounded-2xl border ${C.border} p-4`}>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)] mb-3">
            Agente de Cobranza
          </p>
          <p className="mb-3 text-sm text-[var(--copilot-ink)]">
            Revisa los clientes con saldo vencido y los ordena por urgencia.
            Te indica a quien contactar primero y con cuanto.
          </p>
          <Bullets
            items={[
              "Clientes vencidos ordenados por monto, de mayor a menor.",
              "Si hay mas de 3 clientes vencidos, muestra un resumen de cartera.",
              "Si el cliente tiene ficha en Copilot, el boton va directo a su ficha.",
              "Si no tiene ficha identificada, va a la vista de Cartera.",
              "No sugiere enviar mensajes automaticamente.",
            ]}
          />
        </div>

        <div className={`rounded-2xl border ${C.border} p-4`}>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)] mb-3">
            Agentes preparados para proximas versiones
          </p>
          <p className="mb-2 text-sm text-[var(--copilot-ink)]">
            Ya estan definidos pero todavia no estan activos:
          </p>
          <Bullets
            items={[
              "Tesoreria — revision de pagos, caja y compromisos.",
              "Integridad de datos — explica si los datos estan actualizados.",
              "CFO / Finanzas — liquidez, riesgo y concentracion de cartera.",
              "Cliente — resumen de un cliente especifico.",
              "Alertas — priorizacion de avisos del sistema.",
              "Riesgo — deteccion temprana de riesgos antes de que escalen.",
            ]}
          />
        </div>

        <div className={`rounded-2xl border ${C.border} p-4`}>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)] mb-3">
            Niveles de prioridad
          </p>
          <div className="space-y-2">
            {[
              { label: "Critica", color: "bg-rose-50 text-rose-700 border-rose-200", desc: "Requiere atencion inmediata. Puede afectar caja o datos." },
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
                a: "Si. Cada agente mira una parte del negocio y el resumen coordinado ordena lo mas importante. El resultado final combina lo que encontro cada agente.",
              },
              {
                q: "¿Que significa 'Prioridades principales'?",
                a: "Son las prioridades mas urgentes de todos los agentes activos juntos. Se ordenan de mayor a menor urgencia y se muestran sin duplicados.",
              },
              {
                q: "¿Los agentes pueden equivocarse?",
                a: "Pueden mostrar informacion incompleta si los datos no estan sincronizados. Siempre conviene verificar en el modulo correspondiente antes de actuar.",
              },
              {
                q: "¿Con que frecuencia debo generar el analisis?",
                a: "Al inicio del dia o cuando necesites una mirada rapida. Podes repetirlo cuando quieras para actualizar el resultado.",
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
    a: "No. En esta version solo leen informacion y sugieren acciones. Vos decides que hacer.",
  },
  {
    q: "¿El agente envía WhatsApp o emails?",
    a: "No. Puede llevarte al cliente o a la accion correspondiente, pero no envia mensajes automaticamente.",
  },
  {
    q: "¿Que pasa si Zeta falla y uso el agente?",
    a: "El agente puede mostrar informacion con los ultimos datos disponibles y recomendar revisar Operacional. No inventa datos nuevos.",
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
