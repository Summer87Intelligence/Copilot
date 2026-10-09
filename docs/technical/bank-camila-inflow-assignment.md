# Banco — Camila: asignación de clientes sobre ingresos

Fecha: 2026-10-09. Fuente: pedido y confirmación de Daniel en este chat; inspección del checkout Copilot y pruebas locales. Estado: cambio local; sin publicación ni cambio de permisos reales.

## Decisión autorizada

Camila puede asignar clientes y consultar asociaciones, exclusivamente sobre ingresos. Se conserva el aislamiento por empresa y la privacidad de saldos. No se concede edición de movimientos, borrado, ocultamiento, cambio de estado, revocación/reasignación ni conciliación financiera. `inflow_readonly` conserva su comportamiento para los demás lectores.

## Implementación

Nuevo nivel de módulo `bank_movements=inflow_associate`, etiqueta «Solo ingresos · Asignar clientes». Rango genérico por debajo de lectura/escritura completas. La excepción de asignación vive en `requireBankMovementClientAssignmentAccess`, utilizado únicamente por POST `bank-reconciliation/client-identifications`; las demás mutaciones siguen requiriendo `write|admin`.

Movimientos reutiliza `SimpleReconciliationList`: Fecha, Descripción Santander, Importe, Cliente, Estado y Acción. El panel se abre desde esta única pestaña para el nuevo permiso. No monta Importar, Historial, Tesorería ni la conciliación financiera; oculta Salidas y la diferencia entradas−salidas. Los lectores completos mantienen su navegación previa.

El listado y el panel leen las identificaciones existentes; el panel conserva el fallback a un link financiero cuando corresponde. GET association rechaza egresos y movimientos ocultos con 404, antes de consultar su asociación, y elimina metadata.balance para ambos alcances limitados. POST valida todo el lote antes de escribir: movimientos visibles de ingreso del mismo workspace, sin duplicados operativos, y cliente activo de la misma empresa. Reutiliza el escritor existente; no crea otra fuente de asociaciones.

La migración `20261009140000_bank_movements_inflow_associate_access_level.sql` amplía las restricciones de `app_user_permissions` y limita el nuevo nivel a Banco. Está preparada, NO aplicada; no actualiza usuarios automáticamente. La UI de administración ofrece el nuevo permiso y la API de administración rechaza asignarlo a otro módulo.

## Evidencia y límites

- Vitest: 156/156 en 12 archivos dirigidos: niveles, autorización por módulo, cobertura RBAC, administración, preflight, endpoints reales con dependencias simuladas, escritor existente, contrato del panel y privacidad de saldos.
- TypeScript: sin errores; lint dirigido: sin errores. Build Next.js de la copia aislada: correcto, sin página auxiliar de QA y con configuración ficticia. El primer intento falló por DNS de Google Fonts en el sandbox; la repetición con acceso de red compiló y generó 141 páginas correctamente.
- Playwright MCP disponible y usado con servidor local aislado y endpoints simulados. Escritorio: seis columnas, Asignar cliente/Ver asociación, asignación ficticia actualiza cliente/estado y convierte el botón a Ver asociación. Móvil 390×844: panel y cliente visibles. Acciones fuera de alcance ausentes; Salidas ausente. Sin errores de consola en la validación final.
- No se usaron PIN, credenciales ni secretos reales, ni se modificaron datos de producción. La página auxiliar de QA fue retirada y no forma parte del cambio.
- No se validaron contra la base real la identidad/permiso actual de Camila, Acquagarden ni la persistencia real. La captura muestra una discrepancia de asociación; su causa no queda demostrada solo por el permiso de lectura. Debe contrastarse el mismo movement_id y workspace en ambas sesiones durante QA productiva autorizada.
- Exportación: una prueba preexistente en `build-bank-movements-export-rows.test.ts:79` falla por esperar una fila de julio usando el período mensual por defecto en octubre. Se reprodujo en una copia del código original sin este cambio. No se modificó esa implementación ni su prueba.

## Gate de activación pendiente

Requiere autorización puntual de Daniel para migración, commit, push y despliegue. Antes de publicar, verificar rama/SHA de producción mediante Vercel, aislar este cambio de los pendientes locales de exportación y cumplir los controles de esa base de publicación. Aplicar la migración compatible, publicar el cambio y configurar SOLO el permiso Banco de Camila a `inflow_associate` mediante administración autenticada, confirmando usuario y workspace. No actualizar por email ni usar `write` como atajo.

QA real posterior: solo ingresos aun manipulando direction=outflow; egreso por URL da 404; lista y panel muestran la misma asociación; buscar cliente de su empresa y confirmar solamente una asociación expresamente autorizada; los demás endpoints de escritura dan 403; comprobar que otros lectores y administradores conservan su alcance. Ingreso de PIN/credenciales manual cuando corresponda.

Referencia: `docs/architecture/bank-import-balance-normalization.md`, `docs/security/copilot-api-rbac.md`, `PROJECT_CONTEXT.md` (histórico, secciones Banco consultadas). Reglas fiscales permanecen fuera de alcance.
