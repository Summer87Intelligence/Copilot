# Setup — Copilot + Claude Code

Guía para clonar y ejecutar el proyecto en una nueva máquina (macOS o Windows).

---

## Requisitos previos

- Node.js 20+
- npm 10+
- Git
- Claude Code CLI (`npm install -g @anthropic/claude-code` o instalador desde claude.ai/code)
- Cuenta Anthropic con acceso a Claude Code

---

## Clonar el repo

```bash
git clone <repo-url> copilot
cd copilot
```

---

## Instalar dependencias

```bash
npm install
```

---

## Configurar variables de entorno

```bash
cp .env.example .env.local
```

Completar `.env.local` con valores reales:

| Variable | Dónde obtenerla |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Project Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API → service_role |
| `ZETA_COMPANY_CODE` | Panel de ZetaSoftware |
| `ZETA_COMPANY_KEY` | Panel de ZetaSoftware |
| `ZETA_DEVELOPER_CODE` | Panel de ZetaSoftware |
| `ZETA_DEVELOPER_KEY` | Panel de ZetaSoftware |
| `ZETA_ROLE_CODE` | Normalmente `1` |

> Los alias `ZETA_EMPRESA_*` y `ZETA_DESARROLLADOR_*` deben tener los mismos valores que sus equivalentes en inglés.

---

## Configurar Claude Code

```bash
cp .claude/settings.example.json .claude/settings.local.json
```

El archivo `settings.local.json` es **machine-specific** — no se versiona y no debe subirse al repo.

Si usás Windows y necesitás permitir comandos PowerShell adicionales, editar `settings.local.json` manualmente.

---

## Levantar el servidor de desarrollo

```bash
npm run dev
```

La app corre en `http://localhost:3000`.

---

## Abrir Claude Code

### macOS / Linux

```bash
claude
```

### Windows

Desde PowerShell o terminal:

```bash
claude
```

O desde el menú de inicio si instalaste el desktop app.

---

## Cómo funciona el sistema Claude

El proyecto usa un sistema de skills/modes/profiles cargado automáticamente por `CLAUDE.md`.

| Carpeta | Propósito |
|---|---|
| `CLAUDE.md` | Instrucciones globales — se lee automáticamente |
| `skills/` | Capacidades especializadas (api-z-integration, system-orchestrator, etc.) |
| `modes/` | Modos operativos (modo-build, modo-audit, etc.) |
| `profiles/` | Perfiles de proyecto |
| `quality-gates/` | Criterios de calidad antes de cerrar tareas |
| `docs/vendors/z/` | Source of truth de integraciones ZetaSoftware |
| `docs/zeta/` | Documentación oficial descargada de ZetaSoftware |

Claude detecta automáticamente el contexto y selecciona el modo adecuado. No es necesario indicar el modo manualmente.

---

## Archivos que NO deben subirse

| Archivo | Razón |
|---|---|
| `.env.local` | Contiene credenciales reales |
| `.env` | Ídem |
| `.claude/settings.local.json` | Paths absolutos y permisos machine-specific |
| `node_modules/` | Se regenera con `npm install` |
| `.next/` | Build local |

Todos están cubiertos por `.gitignore`.

---

## Archivos que SÍ se versionan

| Archivo/Carpeta | Razón |
|---|---|
| `CLAUDE.md` | Instrucciones del sistema |
| `skills/` | Skills del proyecto |
| `modes/` | Modos operativos |
| `profiles/` | Perfiles |
| `quality-gates/` | Quality gates |
| `docs/vendors/z/` | Contratos y divergencias Zeta |
| `docs/zeta/` | Docs oficiales Zeta |
| `.env.example` | Template de variables (sin valores reales) |
| `.claude/settings.example.json` | Template de settings Claude (sin paths absolutos) |

---

## Troubleshooting

**`Module not found` al hacer `npm run dev`**
→ Ejecutar `npm install` primero.

**Claude no reconoce las skills**
→ Verificar que el archivo `CLAUDE.md` está en la raíz del proyecto.
→ Abrir Claude desde la raíz del proyecto, no desde una subcarpeta.

**Error de autenticación Supabase**
→ Verificar `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY` en `.env.local`.

**Error de conexión con Zeta**
→ Verificar `ZETA_COMPANY_CODE`, `ZETA_COMPANY_KEY`, `ZETA_DEVELOPER_CODE`, `ZETA_DEVELOPER_KEY`.
→ Confirmar que el rol tiene permisos en el panel de ZetaSoftware.

**`npx tsc --noEmit` falla con errores**
→ Revisar `lib/integrations/zeta/` — posibles imports faltantes o tipos incorrectos.
→ No usar `any` implícito en parsers.

**Claude genera código con paths absolutos Windows (`C:\...`)**
→ Recordarle: "Usar siempre rutas relativas al proyecto."
→ Está documentado en `CLAUDE.md` bajo "Reglas de paths".
