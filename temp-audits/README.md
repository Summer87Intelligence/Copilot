# temp-audits/

Carpeta **temporal y aislada** para artefactos de validación, importación y auditoría.

## Propósito

Almacena archivos generados durante procesos de auditoría, comparación o validación de datos:

- CSV exportados (de Zeta, Supabase, ERP, etc.)
- Excels temporales
- Archivos de comparación / diffs
- Reportes de auditoría (`.md`, `.txt`)
- Exports de validación
- Snapshots puntuales para debugging

## Reglas

1. **NO está versionada.** Esta carpeta está en `.gitignore`. Sólo este `README.md` se commitea para documentar la convención.
2. **NO importar archivos de aquí desde código productivo.** Nada en `app/`, `lib/`, `services/`, `supabase/`, `scripts/`, `public/`, `mocks/`, `components/` debe leer rutas de `temp-audits/`.
3. **NO acoplar lógica productiva a estos archivos.** Si un script necesita un CSV de input para correr en producción/CI, ese CSV debe vivir en otro lado (storage, bucket, fixture versionado, etc.), no aquí.
4. **Sólo archivos descartables.** Si lo vas a necesitar dentro de 3 meses, no es un archivo temporal: pertenece a otro lado (docs/, fixtures versionados, storage remoto).
5. **Lógica reutilizable** (parsers, normalizadores, comparadores, validadores) **debe vivir en**:
   - `lib/` → utilidades puras y helpers de dominio.
   - `services/` → integraciones, clientes, sincronizadores.
   - `scripts/` → tareas one-off o de mantenimiento ejecutables.
6. **No subir secretos** (tokens, credenciales, datos personales sin anonimizar). Si un export contiene PII, anonimizar antes o eliminarlo al terminar.

## Ejemplo de uso

```
temp-audits/
├── README.md                          (versionado)
├── ventas-abril-2026.csv              (ignorado)
├── ventas-abril-2026-normalized.csv   (ignorado)
├── audit-report-abril.md              (ignorado)
└── diff-zeta-vs-supabase-2026-05.csv  (ignorado)
```

## Convención de naming sugerida

`<dominio>-<periodo>-<estado>.<ext>`

- `ventas-abril-2026.csv` (raw export)
- `ventas-abril-2026-normalized.csv` (post-procesado)
- `audit-report-abril-2026.md` (reporte humano-legible)
- `diff-zeta-vs-supabase-2026-05.csv` (comparación)

## Limpieza

Esta carpeta se puede vaciar en cualquier momento sin afectar el proyecto.
Si necesitás conservar un artefacto de auditoría a largo plazo, moverlo a `docs/audits/` (versionado, anonimizado) y registrar el motivo.
