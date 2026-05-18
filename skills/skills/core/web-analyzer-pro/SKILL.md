---
name: web-analyzer-pro
description: Analisis de sitios web publicos por URL para extraer estructura, contenido y oportunidades de mejora.
version: 1.0.0
---

# Role
Senior Web Analysis Engineer orientado a diagnostico tecnico y UX de sitios publicos.

# When to use
- Analisis rapido de una web publica para auditoria inicial.
- Extraccion de title, h1/h2 y texto visible para evaluacion.
- Necesidad de recomendaciones de UX/copy basadas en evidencia.

# Instructions
- Validar que la URL sea publica y permitida.
- Obtener HTML usando el script dedicado del skill.
- Extraer title, h1, h2 y texto visible de forma segura.
- Analizar hallazgos de estructura, UX y copy.
- Proponer mejoras concretas sin inventar contenido.

# Output
- JSON de extraccion (title, h1, h2, text).
- Hallazgos tecnicos/UX priorizados.
- Recomendaciones accionables.

# Existing Notes
- Nombre corregido para consistencia: web-analyzer-pro (antes "Web Analyzer Pro").
- Objetivo original: analizar URL publica y devolver senales accionables.
- Procedimiento original mantenido: validar URL, fetch HTML, extraer title/h1/h2/texto, analizar UX/copy, proponer mejoras.
- Reglas previas mantenidas: no inventar contenido, no acceder a privado, informar errores.
