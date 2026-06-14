# DRIFT-001 — Postmortem & Runbook

**Fecha incidente:** 2026-06-13 / 2026-06-14
**Severidad:** P1 (riesgo de exposición tenant) + P2 (notificaciones silenciosamente deshabilitadas)
**Estado:** mitigado en repo, deploy pendiente.
**Owner:** Summer87 Copilot.

---

## 1. Resumen ejecutivo

Auditoría DRIFT-001 detectó tres tipos de divergencia entre repo, base productiva y comportamiento real:

1. **RLS-A — Policies tenant débiles.** Varias políticas en familia `proto_*` y tablas internas
   permitían lecturas sin filtro estricto por `workspace_company_id`.
2. **SSR-B — Páginas sin auth.** `/admin` y `/account` aceptaban requests anónimos en SSR.
3. **RLS-C — Tablas sin política.** 2 tablas internas exponían filas sin RLS; falta tabla
   `zeta_daily_snapshots` (no se había creado).
4. **FIN-D — Columnas inexistentes.** Consumidores de `invoice_financials` y
   `planned_cash_obligations.due_time` consultaban columnas que la base nunca expuso, generando
   ~30 errores/h en Postgres y deshabilitando silenciosamente:
   - el diagnóstico `balance-divergence` (mapa vacío)
   - las notificaciones `treasury_payment_due`

## 2. Cronología

| UTC | Evento |
|---|---|
| 2026-06-13 ~22:00 | Inicio auditoría DRIFT-001 |
| 2026-06-13 ~23:00 | Commit `52adba5` — hardening RLS tenant isolation (RLS-A) |
| 2026-06-13 ~23:30 | Commit `dc38280` — close anon access `/admin` y `/account` SSR (SSR-B) |
| 2026-06-13 ~23:45 | Commit `dbeaab8` — scope RLS-C a 2 tablas + crear `zeta_daily_snapshots` (RLS-C) |
| 2026-06-13 ~23:17 | Commit `6aecd2d` — align `due_time` y `invoice_financials` con schema real (FIN-D) |
| 2026-06-14 01:41 | Primer snapshot `zeta_daily_snapshots` ejecutado en producción |
| 2026-06-14 02:00 | Cron schedule normal aplica (`0 2 * * *`) |

## 3. Root cause por hallazgo

### RLS-A — policies tenant débiles
Las políticas originales en familia `proto_*` se escribieron asumiendo que toda inserción
provenía del backend con `service_role`. Cuando se introdujo lectura desde el cliente
autenticado, las políticas SELECT no aplicaban `workspace_company_id =
copilot_current_workspace_company_id()` de forma estricta. Riesgo: un usuario con JWT válido
podía, en queries directas a PostgREST, leer filas de otro workspace.

### SSR-B — anon en /admin y /account
Next.js App Router server components no llamaban a `requireSession()` antes de renderizar.
Resultado: requests sin cookie devolvían el shell del dashboard (sin datos por RLS, pero
con metadata sensible: nombres de rutas, structure del menú admin).

### RLS-C — tablas internas sin política
`zeta_daily_snapshots` (nueva en este pase) y otras 2 tablas internas creadas durante el
módulo OIC quedaron con `ENABLE ROW LEVEL SECURITY` pero sin ninguna policy → cualquier
SELECT bajo `authenticated` devolvía 0 filas (fail-closed), pero ningún test alertaba sobre
la ausencia de policy.

### FIN-D — columnas inexistentes
- `invoice_financials` es una VIEW con shape `(id, total_amount, payments, balance)`. Consumers
  pedían `invoice_id`, `workspace_company_id`, `computed_balance`, `net_balance`,
  `balance_amount` (5 columnas inexistentes). Causa: refactor de schema en su día sin
  actualizar todos los call sites; tests no cubrían el path porque mockeaban la respuesta.
- `planned_cash_obligations.due_time` vive dentro de `metadata` JSONB. Una sola query en
  `generate-operational-notifications.ts` lo pedía como columna top-level → la función bailaba
  con HTTP 400 y nunca generaba `treasury_payment_due`.

## 4. Por qué pasó desapercibido

- **Tests pasaban.** Vitest unit-tests con mocks. No había integration test que ejercitara
  el SELECT real contra la base.
- **Errores silenciosos.** Los call sites manejaban error como "no hay datos" → fallback
  vacío sin alertar.
- **Sin alerta por error rate de Postgres logs.** Los ~30 errores/h se acumulaban sin
  dispararse.

## 5. Acciones tomadas (en repo, sin deploy)

| Commit | Cambio |
|---|---|
| `52adba5` | RLS-A: hardening policies tenant |
| `dc38280` | SSR-B: requireSession en `/admin` y `/account` |
| `dbeaab8` | RLS-C: 2 tablas + tabla `zeta_daily_snapshots` con policy |
| `6aecd2d` | FIN-D: align consumers a shape real de `invoice_financials` + leer `due_time` desde metadata |
| (este turno) | Observabilidad: `snapshot_gap_detected` en cron + `npm run lint:rls` estático |

## 6. Acciones pendientes (orden de ejecución)

1. ⏳ **Validaciones locales** (`tsc`, tests, build, `lint:rls`).
2. ⏳ **Push** branch `fix/rls-public-policies` → PR.
3. ⏳ **Deploy Vercel** (genera promotion).
4. ⏳ **Registrar 4 migraciones aplicadas** en `supabase_migrations.schema_migrations`
   (post-deploy, una vez confirmado que los call sites nuevos están en producción).
5. ⏳ Configurar alerta para `snapshot_gap_detected` (Slack via `CRON_ALERT_WEBHOOK_URL`).

## 7. Verificación post-deploy

- [ ] Postgres logs (24h): 0 ocurrencias de `column planned_cash_obligations.due_time does not exist`.
- [ ] Postgres logs (24h): 0 ocurrencias de `column invoice_financials.workspace_company_id does not exist`.
- [ ] `zeta_daily_snapshots`: snapshot del día actual + día anterior consecutivos.
- [ ] `/copilot/notificaciones`: aparece al menos 1 `treasury_payment_due` cuando hay obligación próxima.
- [ ] `/admin` y `/account` redirigen a `/login` para anónimo.
- [ ] Acceso cross-tenant: con JWT del workspace A, query directa PostgREST a `proto_invoices`
      del workspace B devuelve 0 filas.

## 8. Runbook — repetir esta auditoría

Si en el futuro hay sospecha de drift schema↔código:

```powershell
# 1) Static lint de policies (offline, no toca producción)
npm run lint:rls

# 2) Buscar errores recientes en Postgres logs vía MCP Supabase
#    (filtrar por error_severity=ERROR y agrupar por event_message)

# 3) Validar shape real vs. consumers:
#    SELECT column_name FROM information_schema.columns
#    WHERE table_schema='public' AND table_name='<tabla>';

# 4) Para vistas, repetir lo mismo apuntando a la VIEW.

# 5) Antes de PUSH:
npx tsc --noEmit
npm run test -- --run
npm run build
npm run lint:rls
```

## 9. Lecciones

- **Toda VIEW debe documentar su shape**. Cualquier consumer que pida columnas fuera del
  shape debe fallar en CI, no en producción.
- **Toda tabla nueva en `public` debe nacer con policy explícita**. El lint:rls debe correr
  en CI (pendiente: incorporar a `check:deploy`).
- **Error rate alarms** en Postgres logs son baratos y atrapan FIN-D antes de que dure 24h.
