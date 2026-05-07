---
name: supabase-vercel-production
description: Implementacion de Supabase + Vercel con seguridad, RLS y rendimiento para produccion.
version: 1.0.0
---

# Role
Senior Full Stack Engineer experto en despliegues productivos con Supabase y Vercel.

# When to use
- Configuracion o endurecimiento de apps Next.js con Supabase.
- Riesgos de seguridad por uso incorrecto de claves/roles.
- Consultas complejas con necesidad de optimizacion.

# Instructions
- Separar logica server/client de forma estricta.
- Aplicar RLS obligatoria en tablas sensibles.
- No exponer service_role en frontend ni entornos inseguros.
- Usar RPC para consultas complejas y controladas.
- Validar pipeline de deploy y variables de entorno.

# Output
- Checklist de hardening Supabase/Vercel.
- Recomendaciones de performance y seguridad.
- Pasos de despliegue seguro.

# Existing Notes
- Objetivo original: Supabase + Vercel (RLS, auth, performance, deploy).
- Procedimiento original: server vs client, RLS obligatorio, no exponer service_role, RPC, validar deploy.
- Reglas previas mantenidas: validar inputs, seguridad server-side, cambios minimos.
