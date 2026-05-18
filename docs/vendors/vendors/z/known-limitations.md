# ZetaSoftware API — Known Limitations

## 1) Obligatoriedad global de UsuarioCodigo/UsuarioClave no confirmada
- Impacto: puede romper autenticación en algunos endpoints si se asume formato único.
- Riesgo: errores de integración intermitentes o rechazo de requests.
- Mitigación: parametrizar variantes de `Connection` por método y validar contra docs oficiales.
- Estado: `PENDIENTE`.

## 2) Lifecycle/rotación de claves no documentado
- Impacto: incertidumbre operativa en gestión de credenciales.
- Riesgo: exposición prolongada o credenciales inválidas sin proceso claro.
- Mitigación: política interna de rotación conservadora y runbook interno.
- Estado: `PENDIENTE`.

## 3) Scopes/permisos por endpoint no documentados
- Impacto: no se puede predecir autorización por operación.
- Riesgo: fallas en producción por permisos insuficientes.
- Mitigación: matriz de pruebas por endpoint/rol antes de habilitar producción.
- Estado: `PENDIENTE`.

## 4) BaseUrl exacta por entorno pendiente de confirmación
- Impacto: riesgo de usar URL incorrecta por proyecto.
- Riesgo: errores 404/timeout o ambiente equivocado.
- Mitigación: validar baseUrl explícita por tenant/entorno antes de desplegar.
- Estado: `PENDIENTE`.

## 5) Clientes completos sin endpoint confirmado
- Impacto: no se puede implementar sync robusto de clientes.
- Riesgo: modelo incompleto y decisiones con datos parciales.
- Mitigación: bloquear desarrollo de sync completo hasta recibir contrato oficial.
- Estado: `BLOQUEADO`.

## 6) Pagos/cobros completos sin endpoint confirmado
- Impacto: no se puede reconstruir historial financiero completo.
- Riesgo: inconsistencias contables si se infiere desde saldos.
- Mitigación: usar solo saldos como indicador y bloquear flujo completo.
- Estado: `BLOQUEADO`.

## 7) Webhooks no documentados
- Impacto: no hay arquitectura event-driven oficial disponible.
- Riesgo: implementación incorrecta de eventos o seguridad.
- Mitigación: operar con sync controlado hasta contar con docs de webhooks.
- Estado: `BLOQUEADO`.

## 8) Rate limits no documentados
- Impacto: no hay umbrales oficiales de consumo.
- Riesgo: sobrecarga o bloqueo por uso intensivo.
- Mitigación: estrategia conservadora de frecuencia y backoff.
- Estado: `PENDIENTE`.

## 9) Paginación no confirmada en todos los endpoints
- Impacto: puede haber pérdida o duplicación de datos al sincronizar.
- Riesgo: datasets incompletos en histórico.
- Mitigación: implementar manejo defensivo por endpoint y validar contrato real.
- Estado: `PENDIENTE`.

## 10) Fechas de modificación/incremental sync no confirmadas
- Impacto: difícil definir sync incremental confiable en todos los casos.
- Riesgo: barridos completos frecuentes o desactualización.
- Mitigación: usar ventanas controladas y registrar `last_sync_at` con validaciones.
- Estado: `PENDIENTE`.
