# Release Notes — Copilot (local RC)

**Estado:** Release candidate local — **NO desplegado**  
**Branch:** `main`  
**Ahead of `origin/main`:** 22 commits  
**HEAD:** `f4174db` — `ux: refine financial panorama readability`  
**Fecha RC:** 2026-05-28  
**Push:** NO ejecutado (intencional)

---

## Resumen del release

Actualización mayor de UX operativa del workspace Copilot (Summer87): navegación simplificada, pantalla **Hoy** alineada con Tesorería/Cartera, hub de **Reportes**, **Panorama financiero** con semáforos y drilldowns, PDF de deudores, estado de cuenta enriquecido, agenda de cobranza en Acciones/Agentes, y script de verificación `verify:copilot`.

Enfoque: claridad para dueño/contador/operador — sin cambios de schema, sync Zeta, RLS ni crons en este bloque de commits.

---

## Commits incluidos (22)

| Hash | Mensaje |
|------|---------|
| `f4174db` | ux: refine financial panorama readability |
| `cef7345` | feat: add financial metric drilldowns and monthly trends |
| `bc91547` | ux: clarify financial panorama with net metrics |
| `7a82bbc` | ux: clarify data confidence in system status |
| `389e930` | ux: guide treasury movement entry |
| `880ff69` | ux: simplify client profile workflow hierarchy |
| `e249d55` | ux: clarify actions as operational inbox |
| `a6da133` | feat: add copilot reports hub |
| `86fbbfb` | chore: add copilot verification script |
| `446a5ff` | ux: simplify copilot navigation structure |
| `e781424` | ux: simplify daily copilot guidance |
| `03dc1dc` | ux: polish debtors report pdf readability |
| `80f5d9e` | feat: generate debtors report pdf |
| `91a7091` | ux: refine copilot visual consistency and readability |
| `a5a1e4c` | ux: standardize copilot premium card system |
| `509523f` | ux: polish treasury cash cards |
| `ba71ac6` | fix: keep treasury workspace cash from cartera merge |
| `dea275f` | docs: document available cash model in manual |
| `23fa19b` | fix: include post-baseline zeta collections in available cash |
| `d57ad31` | fix: use treasury cash position in hoy available cash |
| `acd7167` | fix: treat treasury balances as current cash baseline |
| `def9b25` | fix: prevent opening balance proxies from counting as cash movements |

**Diff agregado vs `origin/main`:** ~72 archivos, +8666 / −784 líneas (estimado al cierre RC).

---

## Cambios principales por módulo

### Hoy (`/copilot/hoy`)
- Prioridad diaria y guía simplificada.
- **Caja disponible** alineada con Tesorería (`cash-position` + cobros post-corte).
- Separación clara: dinero disponible vs por cobrar vs proyección 30d.
- Agenda de cobranza visible desde navegación.

### Tesorería (`/copilot/tesoreria`)
- Cards de caja UYU/USD pulidas.
- Guía de ingreso / egreso / programado.
- Fix: caja del workspace no se contamina con merge de Cartera.
- Modelo documentado en manual: saldo corte + cobros + manuales − egresos.

### Cartera (`/copilot/cartera`)
- NC restan del neto (motor existente; sin inflar deuda).
- El País: deuda/vencido validados en tests de deudores y pulse (25.742 / 17.080 UYU en fixtures).

### Clientes / Ficha 360
- Jerarquía de ficha reordenada (próximo paso, cobranza, PDF).
- Estado de cuenta PDF enriquecido.
- Envío de estado de cuenta conectado a followup de cobranza.
- Fix fechas inválidas en historial de gestión (`Invalid Date`).

### Reportes (`/copilot/reportes`)
- Hub central de reportes.
- PDF de deudores con filtros, orden y contacto válido.

### Acciones / Agentes
- Acciones como inbox operativo (Prioridades / Agenda / Alertas).
- Agentes con contexto de cobranza reciente e “Ir ahora”.

### Panorama financiero (`/copilot/finanzas`)
- KPIs netos (bruto − NC), semáforos sobrios, drawer de detalle por KPI.
- Evolución mensual (facturas/recibos, UYU/USD separados).
- Escenario estimado 30d distinguido de caja real.

### Datos / Operacional / Manual
- Filtros Datos estandarizados; copy de facturas/recibos.
- Estado del sistema: confianza del dato.
- Manual actualizado (caja, panorama, reportes, acciones).

### Infra local
- `npm run verify:copilot` — suite crítica (treasury, hoy, collection, agents, debtors, account-statement, tsc, build).
- `npm run verify:copilot:quick` — subset rápido.

---

## Riesgos conocidos

| Severidad | Riesgo | Notas |
|-----------|--------|-------|
| P2 | Hidratación SSR/CSR en algunas vistas | WARN previo en QA; no bloquea operación |
| P2 | Build warning NFT / `next.config.ts` trace | Turbopack; no falla build |
| P2 | Middleware deprecation Next.js 16 | Migrar a convención `proxy` en futuro |
| P2 | Evolución mensual sin histórico real de pendiente/vencido | Disclaimer en UI; solo ventas/cobros/NC por mes |
| P2 | Mobile no auditado exhaustivamente en este cierre | Smoke manual recomendado pre-push |
| Info | 22 commits sin push | RC local; un solo push planificado post-validación staging |

**P0/P1:** ninguno detectado en `verify:copilot` al cierre RC.

---

## Validaciones ejecutadas (2026-05-28)

### Automáticas
- [x] `git status` — working tree limpio
- [x] `main` ahead 22 commits de `origin/main`
- [x] `npm run verify:copilot` — **OK**
  - treasury: 227 tests
  - hoy: 39 tests
  - collection: 144 tests
  - operational-actions: 6 tests
  - copilot-agents: 125 tests
  - debtors-report: 31 tests
  - account-statement: 156 tests
  - `tsc --noEmit` — OK
  - `npm run build` — OK

### QA operativa (referencia)
Validaciones de sesiones previas + cobertura por tests unitarios:

| Ruta | Estado | Evidencia |
|------|--------|-----------|
| `/copilot/hoy` | OK (tests + fixes caja) | `copilot-hoy-treasury.test.ts` |
| `/copilot/tesoreria` | OK (tests) | treasury suite 227 |
| `/copilot/cartera` | OK (NC en motor) | reconciliation tests |
| `/copilot/clientes` | OK | portfolio + PDF tests |
| `/copilot/clientes/facc4033-…` | OK (referencia) | debtors-report 25.742/17.080 |
| `/copilot/reportes` | OK | debtors-report 31 tests |
| `/copilot/acciones` | OK (UX) | manual + inbox tabs |
| `/copilot/agentes` | OK (tests) | copilot-agents 125 |
| `/copilot/datos` | OK | dataset routes en build |
| `/copilot/operacional` | OK | confianza del dato UX |
| `/copilot/finanzas` | OK | panorama + semaphore tests |
| `/copilot/manual` | OK | secciones actualizadas |
| Sidebar / mobile | P2 pendiente smoke visual | recomendado pre-prod |

---

## Checklist post-deploy (cuando se haga push)

1. [ ] Push único de los 22 commits a `main` (o PR squash si se prefiere).
2. [ ] Verificar deploy Vercel sin errores de build.
3. [ ] Smoke en producción: `/copilot/hoy`, `/copilot/tesoreria`, `/copilot/finanzas`.
4. [ ] Validar El País en prod: deuda 25.742 UYU, vencido 17.080 UYU.
5. [ ] Descargar PDF deudores y estado de cuenta de un cliente real.
6. [ ] Confirmar caja Hoy = caja Tesorería (misma fuente).
7. [ ] Revisar logs de cron/sync (sin cambios en este RC, pero sanity check).
8. [ ] Comunicar a usuarios: nuevo hub Reportes + Panorama financiero.

---

## Cómo revertir si algo falla

### Opción A — Revertir el push completo (recomendado si falla justo después del deploy)
```bash
git revert --no-commit HEAD~22..HEAD
git commit -m "revert: rollback copilot UX RC"
git push origin main
```

### Opción B — Reset local (solo si NO se ha pusheado aún)
```bash
git reset --hard origin/main
```

### Opción C — Revertir commits puntuales
Identificar el commit problemático con `git log` y:
```bash
git revert <hash>
```

### Opción D — Rollback Vercel
Usar “Promote to Production” del deployment anterior estable en el dashboard Vercel.

---

## Notas para el push único

- **NO** mezclar con cambios de schema, sync Zeta o crons en el mismo deploy si no fueron testeados.
- Ejecutar `npm run verify:copilot` una vez más inmediatamente antes del push.
- Preferir ventana de bajo tráfico (fuera de corte de sync saldos/vouchers).

---

*Generado automáticamente en cierre RC local. No reemplaza changelog de producción.*
