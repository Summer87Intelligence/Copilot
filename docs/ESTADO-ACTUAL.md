# Copilot — Estado actual

Actualizado: 2026-10-09, America/Montevideo. Documento creado al comprobar que no existía `docs/ESTADO-ACTUAL.md` en la raíz de Copilot. Fuentes: dos cierres aportados por Daniel (2026-08-05 y 2026-09-21; el segundo duplicado en el adjunto), pedido actual, inspección de archivos/Git y validación local. Los registros históricos no se consideran nuevas autorizaciones.

## Etapa activa y gate

Banco: permitir a Camila asignar clientes y consultar asociaciones, SOLO ingresos. Confirmado expresamente por Daniel hoy. Cambio preparado y validado localmente; activación productiva pendiente de autorización puntual y QA real. Detalle: [bank-camila-inflow-assignment.md](technical/bank-camila-inflow-assignment.md).

## Infraestructura: hechos verificados vs antecedentes

- Checkout real: `/Users/danielodella/proyectos/copilot`; rama local `main`, HEAD local `418bcc2c31dd434a5e6212fbb555211cd4e9341a` verificado hoy. Este SHA NO acredita producción. Existen cambios locales previos de exportación PDF/Excel (incluyen package.json/package-lock.json, rutas y componente Banco); se conservan.
- Producción histórica: `https://copilot-pro.vercel.app` según ambos antecedentes de Banco. Cierre 05/08 informa commit `76dceb7`, Production Ready. Rama/SHA actualmente desplegados, proyecto/ID Vercel exacto, Root Directory y URL de preview: NO verificados hoy. No inferirlos de HEAD ni reutilizar despliegues históricos como actuales.
- Ruta bancaria existente en código: `/copilot/movimientos-bancarios`; APIs `/api/copilot/bank-movements` y `/api/copilot/bank-reconciliation/*`. Rutas publicadas actuales no auditadas hoy.
- `PROJECT.md` ausente en este checkout; existe `PROJECT_CONTEXT.md`, histórico extenso, con secciones Banco revisadas para esta etapa. `AGENTS.md` exige leer la guía local Next.js antes de escribir código: cumplido para route handlers.
- El documento encontrado dentro de `sl-product-map/docs/ESTADO-ACTUAL.md` pertenece a Silva Lombardo. No es el estado rector de este Copilot; no mezclar su infraestructura.
- Separación de Discovery/Copilot en infraestructura independiente: NO confirmada por las fuentes revisadas.

## Decisiones vigentes

- Saldo de cuenta fuera del texto del movimiento: normalización única en importación, todos los bancos y usuarios. Limpieza histórica solo controlada/auditada, con backup; no repetirla.
- `inflow_readonly` continúa solo ingresos y solo lectura. Para Camila se prepara un nivel distinto `inflow_associate`: asignar/consultar clientes sin egresos, saldos o edición bancaria. Su autorización reemplaza únicamente la restricción histórica de no asignación para ella; no amplía otros permisos.
- Exportación server-side PDF/Excel mediante botón único Exportar, reutilizando filtros del listado. Alcances limitados no exportan egresos, Cuenta ni saldos. El cierre 05/08 aprobó una dependencia de escritura Excel distinta de la librería vulnerable; implementación/dependencia definitiva y validación real siguen pendientes de confirmar.
- Puerto Copilot separado de MyTreat cuando 3001 esté ocupado. QA aislado de esta etapa utilizó 3017; servidor cerrado al terminar.
- Motor Fiscal DGI inicialmente SOLO EASY DIGITAL AGENCY SAS; Summer87 fuera de alcance. No implementar motor ni corregir catálogo CFE hasta cerrar reglas con la contadora. No repetir scripts históricos sin las respuestas.
- No commit, push, deploy ni migraciones sin autorización puntual. No leer secretos ni modificar credenciales para diagnosticar.

## Implementado y validado en esta etapa

Permiso acotado, tabla compartida, panel y controles server-side descritos en el documento técnico. 156 pruebas dirigidas correctas, TypeScript, lint y build correctos en copia aislada; Playwright MCP con datos ficticios en escritorio y móvil. Sin escritura real ni activación de permisos de Camila. Migración creada solamente como archivo.

## Pendientes anteriores que siguen abiertos

- Login local HTTP 500, posible loop `/login` y configuración service role: causa no demostrada en el cierre 05/08, no verificada ni modificada hoy. PIN no identificado como causa. Reproducir con logs/Network antes de tocar datos o configuración.
- Exportación PDF/Excel: existen cambios locales, pero no se confirma finalización ni publicación. Validación real autenticada pendiente; cierre anterior condiciona continuación a acceso normal. Prueba preexistente de exportación falla también en baseline sin este cambio; detalle en el documento técnico.
- Fiscal: historial ZETA↔DGI conciliado en ventas marzo–noviembre 2025 aproximadamente al peso, compras diciembre 2025 por redondeo; son antecedentes, no consultas repetidas hoy. Diciembre ventas difiere +$3.901,95 sin causa demostrada. Enero/febrero 2025 tienen historia insuficiente.
- Confirmar con contadora: computabilidad de CFE `EnConsulta`, aplicación de retención/e-Resguardo $720 de agosto, fórmula/base de anticipo IRAE (incluidas exportaciones) y regla de Patrimonio (cambio de $584 a $1.180). No inferir fórmulas por correlaciones.
- IVA agosto 2026 $193.548,73 es hipótesis NO validada; no declarar IVA, IRAE, Patrimonio ni total DGI definitivos. Tras respuestas, revisar reglas, conciliar enero–julio y recalcular agosto con trazabilidad/confianza; después definir implementación.
- Catálogo CFE pendiente: 112/122 NC, 113/123 ND, 181 e-Remito, 182 e-Resguardo. Fuente histórica del cierre fiscal; no se corrigió hoy. Evitar listas contradictorias y conservar reglas versionadas.

## Verificaciones faltantes y próximo paso exacto

Obtener autorización puntual para la activación; verificar producción real (Vercel rama/SHA/root/proyecto), aislar la publicación de cambios de exportación pendientes, aplicar la migración compatible y publicar el cambio; configurar el permiso de Banco del usuario de Camila identificado y comprobar el flujo real. Antes de dar por corregida Acquagarden, comparar movement_id y workspace de ambas sesiones: la causa de esa discrepancia aún NO está demostrada.

No tocar: saldos/importadores, registros históricos, conciliaciones financieras reales, credenciales, motor fiscal/catálogo CFE, Discovery y pendientes locales ajenos. No reejecutar limpieza, auditorías fiscales ni migraciones automáticamente.

## Referencias

- [Cambio Camila y evidencia](technical/bank-camila-inflow-assignment.md)
- [Normalización de saldos](architecture/bank-import-balance-normalization.md)
- [RBAC API](security/copilot-api-rbac.md)
- `PROJECT_CONTEXT.md`, `AGENTS.md` y cierres adjuntos del 05/08 y 21/09.
