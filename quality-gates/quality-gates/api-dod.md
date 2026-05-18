# API Definition of Done

Antes de considerar lista una API:

## Contrato
- Input schema definido
- Output schema definido
- Errores definidos
- Status codes correctos

## Seguridad
- Auth/autorización validada
- Rate limit si aplica
- Validación de input
- No expone secretos

## Operación
- Logs con correlation_id si aplica
- Idempotencia si aplica
- Retries/fallbacks documentados
- Tests/manual checks definidos

## Cierre
- Documentación mínima
- PROJECT_CONTEXT.md actualizado
