# Guía operativa de lenguaje — Summer87 Copilot

> **COPILOT-OPERATING-LANGUAGE-AND-RULES-001**
>
> Fuente de verdad para copy visible, estados, buckets de atraso, prioridades,
> monedas y acciones. Complementa
> [`docs/architecture/COPILOT-BUSINESS-GLOSSARY-001.md`](../architecture/COPILOT-BUSINESS-GLOSSARY-001.md)
> y [`lib/copilot-business-language.ts`](../../lib/copilot-business-language.ts).

## 1. Principio general

El Copilot habla con lenguaje **claro, operativo y consistente** para usuarios no técnicos. Un concepto = un texto. UYU y USD nunca se mezclan sin aclaración.

## 2. Cobranza / atraso

### Usar (visible)

| Concepto | Texto |
|----------|-------|
| Stock adeudado | **Saldo pendiente** / **Deuda actual** |
| Parte ya pasada de vencimiento | **Saldo atrasado** |
| Antigüedad | **Días de atraso** |
| Cliente | **Cliente con atraso** |
| Factura | **Factura con atraso** |
| Sin mora | **Al día** |

### Evitar (visible principal)

- Deuda vencida
- Factura vencida / Facturas vencidas
- Vencido / Vencida como **estado operativo**
- Días vencida

### Permitido

- **Fecha de vencimiento** — atributo formal del documento, no estado operativo.

### Helpers de código

| Propósito | Archivo |
|-----------|---------|
| Labels ejecutivos canónicos | `lib/copilot-business-language.ts` |
| Buckets operativos por `due_date` (Cliente 360+) | `lib/copilot/operating-aging.ts` |
| Cobranza Cartera por `issue_date` (legacy activo) | `lib/collection-aging/collection-aging-model.ts` |
| Aging contable por cuota (0–30 / 31–60…) | `lib/copilot-installment-aging.ts` |

## 3. Buckets de atraso (UI operativa)

Medidos desde **fecha de vencimiento** (`due_date`):

| Bucket | ID interno | Label visible |
|--------|------------|---------------|
| Al día | `on_time` | Al día |
| Leve | `late_1_7` | 1–7 días de atraso |
| Moderado | `late_8_14` | 8–14 días de atraso |
| Alto | `late_15_30` | 15–30 días de atraso |
| Grave | `late_30_plus` | +30 días de atraso |

**No usar en UI operativa principal:** 0–30 / 31–60 / 61–90 / 90+.

Si una vista contable necesita aging tradicional, debe etiquetarse explícitamente como **vista contable** y no mezclarse con chips de Cliente 360 o Hoy.

## 4. Estados de cliente

| Estado recomendado | Cuándo |
|--------------------|--------|
| Al día | Sin saldo pendiente |
| Con saldo pendiente | Deuda abierta sin atraso |
| Con atraso | Saldo atrasado > 0 |
| En seguimiento | Gestión activa / promesa vigente |
| Riesgo alto | Concentración, SLA o mora grave |
| Inactivo / Sin actividad reciente | Sin movimiento en ventana definida |

## 5. Estados de Banco

| Estado | Definición |
|--------|------------|
| Pendiente de revisar | Importado, sin acción |
| Con sugerencia | Match propuesto por motor |
| Asociado | Ingreso vinculado a cliente/concepto (**no** implica cobrado en Zeta) |
| Conciliado | Coincidencia confirmada contra obligación/egreso esperado |
| Ignorado | No requiere acción operativa |
| Histórico | Fuera del período operativo |

## 6. Tareas diarias

**Estados:** Pendiente · En progreso · Completada · Pospuesta · Ignorada por hoy

**Prioridades:** Alta · Media · Baja

## 7. Alertas

**Severidad:** Alta · Media · Baja

Evitar *crítica/crítico* sin definición. Preferir **Riesgo alto** cuando corresponda a lectura financiera.

## 8. Monedas

- UYU y USD **siempre separados** en cards, tablas y KPIs.
- No consolidar sin tipo de cambio visible.
- Totales mixtos solo con etiqueta **(cons.)** o equivalente explícito.

## 9. Acciones (botones estándar)

| Acción | Uso |
|--------|-----|
| Ver cliente | Navegar a Cliente 360 |
| Ver detalle | Drawer / panel secundario |
| Registrar gestión | Cobranza / CRM operativo |
| Crear tarea | Tareas diarias |
| Asociar ingreso | Banco → cliente |
| Conciliar | Banco → obligación |
| Posponer | Snooze operativo |
| Ignorar por hoy | Ocultar del foco diario |
| Marcar hecho | Completar ítem |
| Copiar resumen | Clipboard para WhatsApp / mail |

No usar sinónimos para la misma acción entre módulos.

## 10. Reglas para Cliente 360 (fase futura)

Cliente 360 debe consumir esta guía desde el rediseño **CLIENT-360-EXECUTIVE-WORKSPACE-001**:

### Header ejecutivo

- Saldo pendiente UYU / USD (separados)
- Saldo atrasado UYU / USD (separados)
- Último cobro
- Próxima acción
- Estado: Al día / Con saldo pendiente / Con atraso / En seguimiento / Riesgo alto

### Secciones

| Sección | Reglas |
|---------|--------|
| Resumen | UYU/USD separados · facturas con atraso · días de atraso · contacto · identificación bancaria |
| Finanzas | Buckets `operating-aging` · saldo pendiente · saldo atrasado · comportamiento de pago |
| Facturas | Estado **Con atraso** (no Vencida) · fecha de vencimiento permitida · días de atraso |
| Cobros | Último cobro · recibos · facturas asociadas |
| Cobranza | Gestiones · promesas · próxima acción |
| Identificación bancaria | Alias · conceptos habituales · ingresos asociados |
| Actividad | Timeline simple |

### Migración pendiente en Cliente 360 actual

- Ya usa "Atrasada" en facturas y "atrasados" en montos.
- Aún mezcla buckets legacy (`hoy-debt-breakdown`: 0–30 / 31–90 / >90 por emisión).
- Próxima fase: adoptar `operating-aging` y unificar con header ejecutivo.

## 11. Módulos desalineados (fase futura)

| Módulo | Hallazgo | Acción futura |
|--------|----------|---------------|
| Hoy (`hoy-debt-breakdown`) | Estados por emisión 0–30 / 31–90 / >90 | Migrar a buckets `due_date` |
| Cartera (`collection-aging-model`) | Buckets por `issue_date`, sin 1–7 | Mantener hasta unificar cobranza |
| Finanzas panorama | Algunos labels legacy | Sweep copy |
| Tesorería forecast | "vencidos de meses anteriores" | → "atrasados" |
| Insights engine | Títulos con "facturas vencidas" | → "facturas con atraso" |
| Installment aging | 0–30 / 31–60 contable | Solo vistas contables |

## 12. Referencias

- Glosario arquitectura: `docs/architecture/COPILOT-BUSINESS-GLOSSARY-001.md`
- Métricas financieras: `lib/copilot-financial-metrics-contract.ts`
- Cobranza buckets Cartera: `lib/collection-aging/collection-aging-model.ts`
