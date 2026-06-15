# COPILOT-BUSINESS-GLOSSARY-001

> Glosario oficial de términos visibles en la UI de Copilot.
>
> Regla general: **un concepto = un texto.** No usar sinónimos por módulo. Si
> aparece un concepto nuevo en una pantalla, agregarlo aquí *antes* de introducirlo
> en UI. Si dos pantallas necesitan referirse al mismo concepto, ambas usan el
> mismo texto.

## 1. Estados de cliente

Derivados de la taxonomía `CLIENT-DEBT-SEMANTICS-001` (días desde emisión de la
factura impaga más antigua).

| Estado | Texto en UI | Significado breve |
|---|---|---|
| `paid` | **Al día** | Sin facturas con saldo > 0 abiertas. |
| `with_debt` | **Con deuda** | Tiene saldo abierto, pero ninguna factura supera el umbral de atraso. |
| `delayed` | **Atrasado** | Factura abierta más antigua supera el umbral de atraso comercial. |
| `critical` | **Crítico** | Factura abierta más antigua supera el umbral de criticidad. |

Reglas:
- Estos cuatro nombres son los únicos válidos para describir el **estado comercial
  del cliente**.
- El estado se deriva del cliente entero, no de una factura individual.
- No mezclar "moroso", "deudor", "moroso crónico", "default", "in arrears", etc.

## 2. Conceptos financieros

Para montos, agregados y métricas visibles. Cada concepto tiene un texto único.

### 2.1 Caja y disponibilidad

| Concepto | Texto en UI | Definición operativa |
|---|---|---|
| Caja disponible al corte | **Dinero disponible** | Saldo de caja al corte + ingresos confirmados − egresos confirmados, por moneda. |
| Cobros pendientes desde clientes | **Por cobrar** | Suma de saldos abiertos de clientes (`debt_uyu`, `debt_usd`). |
| Egresos programados a corto plazo | **Por pagar** | Suma de obligaciones `planned` / `confirmed` no pagas en horizonte definido. |
| Saldo proyectado tras pagar | **Después de pagos** | Dinero disponible − Por pagar (mismo horizonte). |

### 2.2 Facturación y deuda

| Concepto | Texto en UI | Definición operativa |
|---|---|---|
| Facturas con saldo > 0 | **Facturas abiertas** | Conteo de `proto_invoices.balance_amount > 0` (excluye anuladas y notas de crédito netas). |
| Suma de saldos pendientes | **Deuda abierta** | Σ `balance_amount` por moneda de facturas abiertas. |
| Días desde el vencimiento más antiguo en mora | **Días de atraso** | Días desde la fecha de vencimiento de la factura impaga más antigua. Solo aplica si hay deuda atrasada. |

### 2.3 Cobranza

| Concepto | Texto en UI | Definición operativa |
|---|---|---|
| Recibos aplicados en el período | **Cobrado** | Σ `amount` de recibos del período. |
| Facturado del período no cobrado | **Pendiente de cobro** | Facturado del período − Cobrado del período (por moneda). |

## 3. Términos a evitar

Los siguientes términos están **prohibidos** en la UI. La razón se documenta para
poder volver a revisar la decisión más adelante.

| Término prohibido | Reemplazo | Razón |
|---|---|---|
| "Al día con deuda" | "Con deuda" | Contradictorio: si tiene deuda no está al día. |
| "Con deuda vencida" | "Atrasado" | Doble adjetivación innecesaria; "Atrasado" ya implica vencimiento. |
| "Vencido" / "vencida" como estado **comercial del cliente** | "Atrasado" / "Crítico" | "Vencido" es propiedad de la factura, no del cliente. Aplicar a la factura individual (`due_date < today`) pero al cliente usar el estado derivado. |
| "Overdue" | "Atrasado" | Idioma — Copilot habla español operativo. Aceptable como sufijo técnico en logs/payloads, no en UI. |
| "Current debt" | "Deuda abierta" | Idioma. |
| "Aging" / "antigüedad" en UI primaria | Reformular según rango (ej. "60 a 90 días") | Concepto interno; no expone bien la realidad al usuario operativo. Aceptable en drawers de explicación si se acompaña de definición visible. |
| "Pago vencido" como sustantivo neutro | "Pago atrasado" | Coherencia con cliente "atrasado". |
| "Saldo en mora" | "Deuda atrasada" | "Mora" es término legal/jurídico; "atraso" es lo operativo. |

## 4. Regla de lenguaje

1. **Un concepto = un texto.** Si dos pantallas se refieren al mismo cálculo, usan
   el mismo nombre. Si dos cálculos parecen iguales pero difieren, son dos
   conceptos distintos — agregar fila aquí.
2. **No traducir solo en algunas pantallas.** No mezclar "overdue" + "atrasado"
   en el mismo módulo.
3. **No inventar adjetivos**. Si una métrica necesita un nuevo adjetivo (ej.
   "Deuda preventiva"), abrir PR de glosario PRIMERO, decidir el nombre, y
   recién después introducirlo en UI.
4. **Estado de cliente ≠ estado de factura.** Una factura puede estar "vencida"
   (atributo objetivo de fecha) y el cliente "Atrasado" o "Crítico"
   (estado derivado). No mezclar el vocabulario.
5. **Idioma operativo es español rioplatense.** Verbos: "cobrá", "pagá",
   "actualizá". Sustantivos en estilo neutro: "cobranza", "atraso", "saldo".

## 5. Cómo cambiar este glosario

1. Crear PR titulado `glossary: <cambio>` y modificar este archivo.
2. En el mismo PR, dejar **una sola** instancia del nuevo término en código
   (idealmente como constante exportada en `lib/copilot-business-language.ts`).
3. La aplicación masiva del término viejo → nuevo se hace en PR(s) separado(s)
   tras aprobar el glosario.

## 6. Mapeo provisional a código

> Pendiente sweep manual; este bloque se completa en un PR siguiente.

| Texto en UI | Constante TS | Archivo sugerido |
|---|---|---|
| Al día / Con deuda / Atrasado / Crítico | `CLIENT_DEBT_STATUS_LABEL` | `lib/copilot-client-debt-status.ts` (ya existe) |
| Dinero disponible | (pendiente) | `lib/copilot-business-language.ts` |
| Por cobrar | (pendiente) | idem |
| Por pagar | (pendiente) | idem |
| Después de pagos | (pendiente) | idem |
| Facturas abiertas | (pendiente) | idem |
| Deuda abierta | (pendiente) | idem |
| Días de atraso | (pendiente) | idem |
| Cobrado | (pendiente) | idem |
| Pendiente de cobro | (pendiente) | idem |

---

*Última actualización: 2026-06-15. Sweep textual programado en FASE posterior — no en este PR.*
