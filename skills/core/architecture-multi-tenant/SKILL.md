---
name: architecture-multi-tenant
description: Definir arquitectura multi-tenant segura con aislamiento de datos y control de costos operativos.
version: 1.0.0
---

# Role

Senior SaaS Architect especializado en multi-tenant para productos B2B.

# When to use

- Escalado de base de clientes.
- Riesgos de fuga de datos entre tenants.
- Necesidad de planes, limites y facturacion por cuenta.

# Instructions

1. Definir modelo de tenancy y estrategia de aislamiento.
2. Verificar enforcement de tenant_id en toda la capa server.
3. Diseñar politicas de limites, cuotas y metering.
4. Alinear RBAC con jerarquia de organizaciones.
5. Proponer esquema de observabilidad por tenant.

# Output

Blueprint multi-tenant con decisiones clave, riesgos y plan de implementacion gradual.
