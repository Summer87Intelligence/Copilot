# Zeta Integration Checklist

Checklist obligatoria antes de implementar cualquier integracion con ZetaSoftware.
Aplicar a: endpoints nuevos, parsers, enrichments, DTOs, retries, auth, syncs.

Marcar cada item antes de considerar la tarea lista.

---

## 1. Documentacion previa

- [ ] Leer `docs/vendors/z/endpoints.md` para confirmar que el endpoint existe
- [ ] Leer `docs/vendors/z/data-models.md` para conocer campos del response
- [ ] Leer `docs/vendors/z/auth.md` para confirmar estructura del bloque Connection
- [ ] Leer `docs/vendors/z/query-guidelines.md` si el endpoint es de tipo Query
- [ ] Leer `docs/vendors/z/known-limitations.md` para detectar items BLOQUEADO
- [ ] Leer `docs/vendors/z/KNOWN-DIVERGENCES.md` para conocer shapes reales ya validados
- [ ] Leer `docs/zeta/catalog/copilot-zeta-coverage.md` para ver cobertura actual
- [ ] Si el endpoint no esta en ninguna doc: declarar BLOCKED, no implementar

## 2. Payload real

- [ ] Verificar que existe un payload real observado (log con `kind: *_shape_detected` o Postman)
- [ ] Confirmar que los campos clave estan presentes en el payload real
- [ ] Comparar shape documentado vs shape real
- [ ] Si hay divergencia: documentar en `KNOWN-DIVERGENCES.md` ANTES de adaptar parser

## 3. Parser

- [ ] El parser retorna `null` solo cuando el shape es irreconocible (nunca silenciosamente)
- [ ] El parser loggea `kind: *_shape_detected` con `detected_shape` y `rows_detected`
- [ ] El parser tiene fallbacks para shapes alternativos del mismo endpoint
- [ ] El parser no hardcodea keys de un solo tenant (usa lista priorizada)
- [ ] El parser respeta `Succeed: false` / `"N"` como indicador de error
- [ ] Existe test o validacion manual del parser con el payload real

## 4. Campos de moneda y montos

- [ ] `MonedaCodigo` mapeado: "1"=UYU, "2"=USD (o simbolo si viene texto)
- [ ] `MonedaSimbolo` mapeado: "$"=UYU, "U$S"=USD
- [ ] Nunca convertir montos (solo transportar el valor original)
- [ ] Moneda escrita en `currency_code` como ISO ("USD" | "UYU") para la columna
- [ ] Moneda escrita en `zeta_metadata` con `moneda_codigo` + `moneda_simbolo` + `moneda_source`

## 5. Sync e idempotencia

- [ ] El sync tiene `upsert` o lookup-by-key antes de insert
- [ ] La clave de identidad es deterministica (no depende de `id` interno de Zeta si cambia)
- [ ] El sync registra `synced_at` en cada fila procesada
- [ ] El sync registra `zeta_sync_run` al inicio y al final
- [ ] El sync tiene manejo de errores row-by-row (un error no aborta todo el lote)
- [ ] El sync es seguro para ejecutar dos veces sin efectos secundarios

## 6. Enrichment post-sync

- [ ] El enrichment corre DESPUES del sync principal (hook no-bloqueante)
- [ ] El enrichment NO toca: `total_amount`, `balance_amount`, `issue_date`, `invoice_number`, `company_id`
- [ ] El enrichment tiene guard rail: skip si los campos ya coinciden
- [ ] El enrichment soporta `dryRun` para validacion previa
- [ ] El enrichment retorna `invoices_updated`, `invoices_skipped`, `invoices_not_matched`, `errors`, `duration_ms`

## 7. Seguridad

- [ ] Credenciales de Zeta solo en variables de entorno server-side
- [ ] No loguear el bloque `Connection` completo (usuario/clave)
- [ ] Endpoint de sync protegido con `requireCopilotTenantContext`
- [ ] RLS activo o equivalente en tablas destino (`workspace_company_id` scoped)
- [ ] No mezclar datos entre tenants

## 8. Retries y timeouts

- [ ] Timeout configurado en `config.timeoutMs` (no hardcodeado)
- [ ] Retry solo para errores transitorios (`zeta_http`, `zeta_timeout`, `zeta_unknown`)
- [ ] No retry para errores de config (`zeta_config`) o shape (`zeta_shape`)
- [ ] Backoff: `sleep(ms * attempt)` antes de cada reintento
- [ ] Max retries acotado (default 2-3, nunca infinito)

## 9. Logging estructurado

- [ ] Log `kind: "start"` al inicio con `mes`, `anio`, `request_id`, `workspace_company_id`
- [ ] Log `kind: "summary"` al final con metricas completas
- [ ] Errores loggean `kind: "*_error"` o `kind: "*_exception"` con mensaje
- [ ] Logs usan `JSON.stringify({...})` para trazabilidad en produccion
- [ ] Ningun log expone credenciales

## 10. TypeScript

- [ ] `npx tsc --noEmit` pasa sin errores
- [ ] No hay `any` implicito en parsers (usar `unknown` + type guards)
- [ ] Tipos de resultado exportados (`*Result`, `*Options`) para uso en pipeline principal

## 11. Documentacion post-implementacion

- [ ] Si se detectaron divergencias: actualizar `KNOWN-DIVERGENCES.md`
- [ ] Si hay limitaciones nuevas: actualizar `known-limitations.md`
- [ ] Si hay campos nuevos confirmados: actualizar `data-models.md` o `invoices.md`
- [ ] ADR creado si la decision tecnica afecta arquitectura general

---

## Estados validos

| Estado | Significado |
|---|---|
| BLOCKED | Falta documentacion critica o payload real — no implementar |
| PENDIENTE | Doc existe pero payload real no validado aun |
| CONFIRMADO | Doc + payload real validados, parser adaptado |
| RESUELTO | Divergencia corregida y documentada |
