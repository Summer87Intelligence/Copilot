# ADR-001 — Credenciales de Integración Zeta por Workspace

## Estado
Propuesta

## Fecha
2026-05-17

## Contexto
Las credenciales Zeta (`ZETA_EMPRESA_CODIGO`, `ZETA_EMPRESA_CLAVE`, `ZETA_DESARROLLADOR_CODIGO`,
`ZETA_DESARROLLADOR_CLAVE`) están hardcoded como variables de entorno en Vercel.
`lib/integrations/zeta/zeta-config.ts → loadZetaServerConfig()` las lee exclusivamente de `process.env`.

Esto funciona para el workspace actual (Summer87, `EmpresaCodigo=250218923`) pero se vuelve
bloqueante en cuanto se quiera incorporar un segundo cliente:
- Requiere re-deploy o segunda instancia Vercel con variables distintas.
- Rotación de credenciales exige acceso al panel Vercel.
- No hay audit trail de quién ni cuándo se modificaron.

## Decisión
Migrar credenciales Zeta a tabla `workspace_integrations` en Supabase con encriptación en reposo.

```sql
create table public.workspace_integrations (
  id uuid primary key default gen_random_uuid(),
  workspace_company_id uuid not null references public.companies(id) on delete cascade,
  provider text not null check (provider in ('zeta')),
  credentials_encrypted jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_company_id, provider)
);
-- RLS: solo service_role puede leer credentials_encrypted
```

`loadZetaServerConfig()` acepta `workspaceCompanyId` opcional:
- Si se provee: lee desde `workspace_integrations` (con service_role key).
- Si no se provee: fallback a `process.env` (compatibilidad backward).

Encriptación: `pgcrypto.pgp_sym_encrypt` con clave maestra en Supabase Vault o env var
`WORKSPACE_INTEGRATION_ENCRYPTION_KEY` (server-side only, nunca en cliente).

## Consecuencias

- Positivas:
  - Onboarding de nuevo cliente sin re-deploy de Vercel.
  - Rotación de credenciales sin downtime (update en DB).
  - Audit trail con `updated_at` por workspace.
  - Compatibilidad backward mantenida via fallback a env vars.

- Negativas:
  - +1 query DB por contexto de llamada Zeta (mitigable con caché en-memory por request).
  - Requiere manejo explícito de encriptación/decriptación server-side.
  - Complejidad operativa: backfill de credencial actual al migrar.

- Riesgos:
  - Si `WORKSPACE_INTEGRATION_ENCRYPTION_KEY` se filtra, todas las credenciales quedan expuestas.
  - Service role key nunca debe llegar al cliente — mantener acceso solo desde API routes.

## Alternativas consideradas

1. **Múltiples instancias Vercel** (una por cliente): no escala, costo lineal, overhead de deploy.
2. **AWS Secrets Manager / GCP Secret Manager**: overhead de infraestructura excesivo para etapa actual.
3. **Mantener env vars con naming convention** (`ZETA_EMPRESA_CODIGO_<slug>`): frágil, no auditable, sigue requiriendo re-deploy.

## Criterio de revisión
Revisar cuando se incorpore el segundo cliente activo o cuando el número de pipelines Zeta
por workspace supere 10 (posible necesidad de rotación frecuente).
