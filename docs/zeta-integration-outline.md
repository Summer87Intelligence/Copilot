# Integración futura con Zeta (Summer87 Copilot)

Documento conceptual. **No hay integración activa** ni llamadas a APIs: define objetivos, datos esperados, pipeline y riesgos para alinear producto e ingeniería cuando se implemente.

---

## A. Objetivo de la integración con Zeta

### Qué busca resolver

- **Alimentar el Copilot con datos contables y operativos reales** (no solo escenarios o mocks), de forma recurrente y por empresa.
- **Reducir carga manual**: ventas, cobranzas, gastos, caja y maestros (clientes, proveedores, cuentas) llegan desde el sistema contable en lugar de cargarse a mano en el producto.
- **Dar continuidad temporal**: series coherentes para tendencias, comparaciones de períodos y detección de patrones (incluida recurrencia en insights).

### Por qué es importante para Summer87 Copilot

- El valor del producto está en **inteligencia accionable** sobre el negocio real; sin datos confiables y actualizados, el motor de insights y los reportes ejecutivos pierden credibilidad.
- Zeta (u otro ERP/contabilidad) es la **fuente de verdad** financiera para muchas PYMES; conectarla permite que el Copilot sea **un espejo ejecutivo** alineado con libros y operación.
- Permite escalar el modelo **multi-tenant** (`company_id`): cada empresa sincroniza su propio universo contable hacia snapshots e historial sin mezclar información.

---

## B. Fuentes de datos esperadas desde Zeta

Ejemplos de dominios que típicamente alimentan un dashboard financiero y el Copilot:

| Dominio | Uso típico en Copilot |
|--------|------------------------|
| **Facturación** | Ventas del período, composición, tendencias. |
| **Cobranzas** | Cobros pendientes, aging, relación con ventas. |
| **Gastos** | Estructura de costos, crecimiento intermensual de gastos. |
| **Pagos** | Salidas de caja, proveedores, timing. |
| **Caja** | Balance efectivo, disponibilidad, riesgo de liquidez. |
| **Clientes** | Concentración, top clientes, riesgo de dependencia. |
| **Proveedores** | Compromisos, plazos de pago. |
| **Bancos / movimientos** | Conciliación, flujo real vs contable. |

La forma exacta (endpoints, reportes, exportaciones) se definirá en la fase de integración; este documento solo fija el **alcance conceptual**.

---

## C. Propuesta de pipeline conceptual

Flujo de alto nivel, independiente del proveedor:

1. **Extracción**  
   Lectura periódica desde Zeta (API, archivos, jobs programados). Por `company_id` y ventana de tiempo.

2. **Normalización**  
   Mapeo de entidades Zeta → tipos internos conceptuales (ver `types/zeta.ts` y futuros adaptadores). Unidades monetarias, moneda, zona horaria y fechas unificadas.

3. **Validación**  
   Reglas mínimas: totales coherentes, rangos plausibles, detección de duplicados, manejo de datos faltantes (marcar como “parcial” o excluir con log).

4. **Snapshot ejecutivo**  
   Agregación a un modelo compatible con el producto actual (`DashboardSnapshot` o evolución del mismo): caja, ventas, cobranzas pendientes, gastos, métricas derivadas (concentración, crecimiento, etc.).

5. **Generación de insights**  
   `generateCopilotInsights` y derivados operan sobre snapshots + contexto (snapshot anterior, historial de insights). Persistencia opcional en `copilot_insights` para historial y reportes.

Este pipeline puede vivir en un **servicio de sincronización** (futuro) sin acoplar la UI al detalle de Zeta.

---

## D. Entidades clave a mapear

| Entidad conceptual | Rol |
|-------------------|-----|
| **Invoice / factura** | Documento de venta; base para ventas y cobranzas pendientes. |
| **Collection / cobranza** | Aplicación de cobro a facturas o ingresos directos. |
| **Expense / gasto** | Gastos operativos o clasificados contablemente. |
| **Cash movement / movimiento de caja** | Entradas/salidas que impactan caja y bancos. |
| **Client / cliente** | Maestro para concentración y análisis comercial. |
| **Supplier / proveedor** | Maestro para pagos y exposición a proveedores. |

Los tipos TypeScript iniciales en `types/zeta.ts` son **placeholders de dominio**; los nombres de campos finales dependerán del contrato real con Zeta.

---

## E. Riesgos o desafíos de integración

| Riesgo | Mitigación conceptual |
|--------|------------------------|
| **Datos incompletos** | Periodos marcados como “parciales”; no forzar métricas críticas sin señal suficiente. |
| **Nombres o categorías inconsistentes** | Capa de normalización + catálogo interno (mappings de rubros). |
| **Frecuencia de sincronización** | Definir SLA por producto (ej. diario vs. horario); snapshots con `created_at`/`source` para auditoría. |
| **Calidad de datos** | Validaciones, alertas de calidad en dashboard, no solo errores técnicos. |
| **Duplicados** | Claves externas (`zetaId` / hash), idempotencia en upserts, igual que en `copilot_insights` con `insight_hash`. |

---

## F. Conexión con el modelo actual del proyecto

| Componente actual | Rol |
|-------------------|-----|
| **`dashboard_snapshots`** (o equivalente) | Almacenar el **snapshot agregado** por empresa y momento; puede enriquecerse con `source: 'zeta'` o `sync_run_id` en el futuro. |
| **`DashboardSnapshot` + `buildDashboardViewFromSnapshot`** | Punto de entrada del Copilot para métricas; la integración debe **alimentar** estos valores o una vista intermedia que los derive. |
| **Copilot Engine** | Sin cambios de contrato: recibe snapshot(s) y opcionalmente historial de insights; los datos vienen de mejor calidad si Zeta alimenta bien el snapshot. |
| **Historial `copilot_insights`** | Persistencia de lecturas; sigue siendo válida para tendencias y resumen semanal; la integración no la reemplaza, la **alimenta**. |
| **Empresas / multi-tenant** | Toda extracción y snapshot **scoped por `company_id`** (o tenant equivalente), alineado con `app_users` y compañas. |

---

## Próximos pasos (no implementados)

- Contrato técnico con Zeta (auth, endpoints, límites).
- Adaptadores `zeta → dominio interno` y pruebas de integración.
- Jobs de sincronización y observabilidad (logs, reintentos).

Este documento es la base para decisiones de producto e ingeniería cuando se priorice la integración real.
