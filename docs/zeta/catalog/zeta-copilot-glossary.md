# Glosario ZetaSoftware ↔ Summer87 Copilot

Objetivo: alinear vocabulario de la **ayuda Zeta**, del **modelo ERP** y de las **tablas/proto** del Copilot para evitar errores de diseño en integraciones.

---

## Entidades Zeta (negocio)

### Contacto

En Zeta, un **contacto** es un registro maestro de tercero que puede actuar como **cliente**, **proveedor**, ambos o ninguno, según flags (`EsCliente`, `EsProveedor`, etc.). Tiene código interno (`Codigo`), nombre, razón social, documento, direcciones y datos de contacto.

**Fuente:** `docs/zeta/markdown/0185-ayuda-apis-indice-de-apis-configuracion-contactos-45110885.md`

### Cliente (rol sobre contacto)

Un **cliente** en Zeta es típicamente un **contacto** con `EsCliente = S` (según filtros de la API Contactos y la UI de “Clientes y Proveedores”). No confundir con “empresa” del workspace Copilot.

**Fuente:** misma página API Contactos; ayuda general de contactos.

### Proveedor (rol sobre contacto)

Un **proveedor** es un **contacto** con `EsProveedor = S` en los mismos términos.

### Empresa (Zeta — tenant de datos)

La **empresa** cuyos datos se operan en las APIs Zeta es la del **cliente contratante**: se identifica con `EmpresaCodigo` / `EmpresaClave` en el bloque `Connection`. Un mismo desarrollador puede operar **varias** empresas Zeta.

**Fuente:** `0082-ayuda-apis-datos-de-conexion-d56f74a1.md`

---

## Entidades Copilot (persistencia / contexto)

### `proto_companies`

Tabla (familia proto) donde Copilot suele persistir **empresas clientes del estudio** o vistas importadas desde Zeta mapeadas como “compañía” en el dominio del producto. El **mapeo desde Zeta** (p. ej. filas de `RESTContactosV3Query`) puede usar campos tipo código o RUT según el importador.

**Nota:** el nombre “companies” en Copilot **no** equivale automáticamente a “empresa Zeta” (`EmpresaCodigo`); muchas veces representa al **cliente de negocio** del workspace.

**Referencia código:** comentarios en `lib/copilot-api-auth.ts`, rutas `app/api/zeta/test-clients-mapped`, importadores.

### `proto_contacts`

Contactos persistidos en Copilot; el import inicial desde Zeta puede vincularse a `proto_companies` por reglas de negocio (código/RUT).

**Referencia:** `app/api/zeta/import-contacts-initial/route.ts`

### `workspace_company_id` / workspace

Identificador de la **compañía del workspace** (multi-tenant del producto Copilot). Debe mantenerse **separado** del `EmpresaCodigo` de Zeta y de los ids de `proto_*` según reglas de API del Copilot.

**Referencia:** mensajes de validación en `lib/copilot-api-auth.ts`.

### `company_id` (en payloads Copilot)

En APIs proto del Copilot, `company_id` suele referir al **cliente** (`proto_companies.id`), **no** al id interno del workspace.

**Referencia:** `lib/copilot-api-auth.ts`

---

## Documentos y dinero

### Comprobante

En Zeta (módulo gestión / facturación), documento comercial con tipo (`CodigoComprobante`), serie, número, fechas, totales, cliente, líneas, etc. La API Facturas de Clientes **genera** comprobantes pero la **emisión electrónica (CFE)** es un paso posterior en Zeta.

**Fuente:** `0159-ayuda-apis-indice-de-apis-gestion-y-contabilidad-facturas-de-clientes-c92a871f.md`

### Saldo pendiente

Importe adeudado u posición de un comprobante de venta a crédito según consultas de cartera. En Copilot se consume vía **`RESTFacturaClienteV4QuerySaldosPendientes`** (respuesta con ítems que incluyen saldos, fechas, comprobante, etc. según ejemplo en ayuda REST).

**Fuente:** `0135-ayuda-apis-soap-y-rest-4f8f8fd9.md`, pipeline `zeta-saldos-pipeline.ts`

### Cuota

Cuota de un plan de pagos asociado a cliente y/o proveedor; API dedicada en Zeta (`asoapcuotasv1` en ayuda).

**Fuente:** `0158-ayuda-apis-indice-de-apis-gestion-y-contabilidad-cuotas-de-cliente-y-proveedor-e050b125.md`

### Recibo (cobro / pago)

Comprobante de **cobranza** o **pago** según APIs `asoapreciboscobranzav2` y `asoaprecibospagosv1`.

**Fuente:** ayuda API recibo de cobro / recibo de pago (markdown índice APIs).

---

## Contabilidad

### Asiento

Registro contable en partida doble; la API “Consulta de asientos” expone consulta vía servicio documentado (`asoapasientov1`).

**Fuente:** `0157-…-consulta-de-asientos-95083d11.md`; contexto contable `0092-ayuda-preguntas-frecuentes-contabilidad-ad980608.md`

### Balance (contable)

Informe de saldos por cuenta para un balance **ya generado** en Zeta; la API balance **no** crea el balance ni ejecuta cierre.

**Fuente:** `0152-…-balance-contable-8da7726c.md`

### Plan de cuentas

Estructura de cuentas contables de la empresa; API de configuración documentada (`asoapplancuentasv2`).

**Fuente:** `0212-…-plan-de-cuentas-cae9de14.md`

---

## Protocolos

### REST (preferido)

JSON sobre HTTPS; URL tipo `https://api.zetasoftware.com/rest/APIs/{MethodName}`; cuerpo con `Connection` + `Data` en los ejemplos Copilot/Zeta.

**Fuente:** `0135-ayuda-apis-soap-y-rest-4f8f8fd9.md`

### SOAP (legacy)

Servicios `https://api.zetasoftware.com/z.apis.asoap…`; ayuda por entidad suele detallar SOAP aunque REST sea el recomendado para integraciones nuevas.

**Fuente:** mismo documento de protocolos.

---

*Este glosario no sustituye la documentación oficial Zeta; sirve para comunicación interna del equipo Copilot.*
