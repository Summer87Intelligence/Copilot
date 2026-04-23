# Zeta API — Ejemplos reales (Postman)

Documentación derivada de la colección **`ZetaSoftware-REST-10-2025.json`** y de la guía PDF **`Postman-Ejemplo-de-consultas.pdf`** en esta misma carpeta. Sirve para alinear el conector server-side (Next.js) con el contrato que ZetaSoftware publica en Postman/OpenAPI.

**Relacionado:** índice tabular de todos los métodos en [`zeta-api-endpoints.md`](./zeta-api-endpoints.md).

---

## PDF — Postman: Ejemplo de consultas

**Archivo:** `Postman-Ejemplo-de-consultas.pdf` (título interno *Postman: Ejemplo de consultas*, render Google Docs).

En este entorno no se extrajo texto legible del PDF sin herramientas adicionales; los **enlaces HTTP embebidos** en el PDF (anotaciones URI) son:

- `https://zetasoftware.info/`
- `https://zetasoftware.info/ayuda/apis/indice-de-apis/`
- `https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/articulos/`
- `https://zetasoftware.info/ayuda/apis/indice-de-apis/gestion-y-contabilidad/facturas-de-clientes/`
- `https://zetasoftware.info/ayuda/apis/indice-de-apis/gestion-y-contabilidad/facturas-de-clientes/#método-agregar`
- `https://zetasoftware.info/ayuda/apis/indice-de-apis/gestion-y-contabilidad/facturas-de-clientes/#método-querysaldospendientes`

La guía PDF complementa la colección con contexto de ayuda oficial (facturas de clientes, saldos pendientes, artículos).

---

## Convención común (todos los ejemplos siguientes)

## Endpoint

`POST https://api.zetasoftware.com/rest/APIs/{NombreMetodoREST}`

(En Postman: `{{baseUrl}}/APIs/...` con `baseUrl` = `https://api.zetasoftware.com/rest`.)

## Método

`POST`

## Headers

| Header | Valor |
|--------|--------|
| `Content-Type` | `application/json` |
| `Accept` | `application/json` |

---

## RESTComprobantesClienteV1Query — Comprobantes por cliente

Carpeta Postman: **Comprobantes por Cliente**.

### Body esperado (JSON de la colección)

```json
{
  "QueryIn": {
    "Connection": {
      "DesarrolladorCodigo": "<string>",
      "DesarrolladorClave": "<string>",
      "EmpresaCodigo": "<string>",
      "EmpresaClave": "<string>",
      "UsuarioCodigo": "<long>",
      "UsuarioClave": "<string>",
      "RolCodigo": "<integer>"
    },
    "Data": {
      "ClienteCodigo": "<string>",
      "Mes": "<integer>",
      "Anio": "<integer>",
      "FechaDesde": "<date>",
      "FechaHasta": "<date>"
    }
  }
}
```

### Observaciones

- **Wrapper:** raíz **`QueryIn`**, no body plano `{ Connection, Data }`.
- **Sin `Page` / `Filters`:** el `Data` de este método es plano respecto al negocio (período + cliente).
- **Nombres WSDL alternativos:** en integraciones SOAP el tipo puede aparecer como `ComprobantesClienteV1QueryIn`; en **esta** exportación REST Postman el nombre de la clave raíz es **`QueryIn`**. Un **400 Bad Request** suele indicar que el deserializador del gateway no reconoce la raíz enviada (p. ej. enviar `ComprobantesClienteV1QueryIn` si el binding espera `QueryIn`, o viceversa).
- **Tipos:** la plantilla marca `Mes`/`Anio` como `<integer>`; en la práctica conviene probar **enteros JSON** o **strings numéricos** según comportamiento del tenant (ver reglas implícitas abajo).

### Response (ejemplo de colección)

Estructura documentada bajo **`QueryOut`** con `Response.ListaMovimientos[]` (detalle de comprobantes, líneas, formas de pago). El parser de Copilot ya considera `QueryOut` y `ComprobantesClienteV1QueryOut`.

---

## RESTComprobantesV1Query — Catálogo de comprobantes (no “por cliente”)

Carpeta Postman: **Comprobantes**.

### Body esperado

```json
{
  "QueryIn": {
    "Connection": {
      "DesarrolladorCodigo": "<string>",
      "DesarrolladorClave": "<string>",
      "EmpresaCodigo": "<string>",
      "EmpresaClave": "<string>",
      "UsuarioCodigo": "<long>",
      "UsuarioClave": "<string>",
      "RolCodigo": "<integer>"
    },
    "Data": {
      "Page": "<long>",
      "Filters": {
        "CodigoDesde": "<integer>",
        "CodigoHasta": "<integer>",
        "NombreContiene": "<string>",
        "Tipo": "<integer>",
        "LocalCodigo": "<integer>",
        "Activo": "<string>"
      }
    }
  }
}
```

### Observaciones

- Misma raíz **`QueryIn`**, pero `Data` con **paginación** y **filtros** de catálogo; no confundir con comprobantes por cliente.

---

## RESTFacturaClienteV4QuerySaldosPendientes — Saldos pendientes

Carpeta Postman: **Facturas de Clientes**.

### Body esperado

```json
{
  "QuerySaldosPendientesIn": {
    "Connection": {
      "DesarrolladorCodigo": "<string>",
      "DesarrolladorClave": "<string>",
      "EmpresaCodigo": "<string>",
      "EmpresaClave": "<string>",
      "UsuarioCodigo": "<long>",
      "UsuarioClave": "<string>",
      "RolCodigo": "<integer>"
    },
    "Data": {
      "Page": "<long>",
      "Filters": {
        "ClienteCodigo": "<string>",
        "RegistroId": "<long>",
        "ComprobanteCodigo": "<integer>",
        "FechaDesde": "<date>",
        "FechaHasta": "<date>",
        "Serie": "<string>",
        "Numero": "<long>",
        "MonedaCodigo": "<integer>",
        "LocalCodigo": "<integer>",
        "SaldoDesde": "<double>",
        "SaldoHasta": "<double>",
        "Emitido": "<string>"
      }
    }
  }
}
```

### Observaciones

- Raíz **`QuerySaldosPendientesIn`** (no `QueryIn`). Enviar el body de comprobantes por cliente a este método produce **400** aunque la URL exista.

---

## RESTRecibosCobranzaV2QueryComprobantes — Comprobantes en recibos de cobranza

Carpeta Postman: **Recibo de Cobro**.

### Body esperado

```json
{
  "QueryComprobantesIn": {
    "Connection": {
      "DesarrolladorCodigo": "<string>",
      "DesarrolladorClave": "<string>",
      "EmpresaCodigo": "<string>",
      "EmpresaClave": "<string>",
      "UsuarioCodigo": "<long>",
      "UsuarioClave": "<string>",
      "RolCodigo": "<integer>"
    },
    "Data": {
      "Page": "<long>",
      "Filters": {
        "Anio": "<integer>",
        "Mes": "<integer>",
        "FechaDesde": "<date>",
        "FechaHasta": "<date>",
        "ClienteCodigo": "<string>",
        "ComprobanteCodigo": "<integer>",
        "MonedaCodigo": "<integer>",
        "LocalCodigo": "<integer>",
        "CobradorCodigo": "<string>"
      }
    }
  }
}
```

### Observaciones

- Raíz **`QueryComprobantesIn`**. Útil si el producto llama “comprobantes” en contexto de **cobranza**; no es el mismo contrato que **Comprobantes por Cliente**.

---

## RESTVouchersV1Query — Tarjetas recibidas (vouchers)

Carpeta Postman: **Tarjetas Recibidas**.

### Body esperado

```json
{
  "QueryIn": {
    "Connection": {
      "DesarrolladorCodigo": "<string>",
      "DesarrolladorClave": "<string>",
      "EmpresaCodigo": "<string>",
      "EmpresaClave": "<string>",
      "UsuarioCodigo": "<long>",
      "UsuarioClave": "<string>",
      "RolCodigo": "<integer>"
    },
    "Data": {
      "Page": "<long>",
      "Filters": {
        "LocalCodigo": "<integer>",
        "Estado": "<string>",
        "Anio": "<integer>",
        "Mes": "<integer>",
        "Fecha": "<date>",
        "FinancieraCodigo": "<string>",
        "ClienteCodigo": "<string>",
        "ComprobanteCodigo": "<integer>",
        "MonedaCodigo": "<integer>",
        "CajaCodigo": "<integer>"
      }
    }
  }
}
```

### Observaciones

- “Vouchers” en Zeta = **tarjetas recibidas**; query con **`QueryIn`** + `Page` + `Filters`.

---

## RESTContactosV3Query — Contactos (clientes / proveedores)

Carpeta Postman: **Contactos**.

### Body esperado

```json
{
  "QueryIn": {
    "Connection": {
      "DesarrolladorCodigo": "<string>",
      "DesarrolladorClave": "<string>",
      "EmpresaCodigo": "<string>",
      "EmpresaClave": "<string>",
      "UsuarioCodigo": "<long>",
      "UsuarioClave": "<string>",
      "RolCodigo": "<integer>"
    },
    "Data": {
      "Page": "<long>",
      "Filters": {
        "Search": "<string>",
        "CodigoDesde": "<string>",
        "CodigoHasta": "<string>",
        "RUTContiene": "<string>",
        "DocumentoContiene": "<string>",
        "EsCliente": "<string>",
        "EsProveedor": "<string>",
        "ContactoActivo": "<string>",
        "PaisCodigo": "<string>",
        "ZonaCodigo": "<string>",
        "GiroCodigo": "<string>",
        "GrupoCodigo": "<string>",
        "OrigenCodigo": "<string>",
        "PropietarioCodigo": "<integer>",
        "FechaRegistroDesde": "<date>",
        "FechaRegistroHasta": "<date>"
      }
    }
  }
}
```

### Observaciones

- Consulta por cliente en sentido **CRM/contactos**, no comprobantes.

---

## RESTClienteV3Query — Datos comerciales del cliente

Carpeta Postman: **Datos Comerciales Cliente**.

### Body esperado

```json
{
  "QueryIn": {
    "Connection": {
      "DesarrolladorCodigo": "<string>",
      "DesarrolladorClave": "<string>",
      "EmpresaCodigo": "<string>",
      "EmpresaClave": "<string>",
      "UsuarioCodigo": "<long>",
      "UsuarioClave": "<string>",
      "RolCodigo": "<integer>"
    },
    "Data": {
      "Page": "<long>",
      "Filters": {
        "CodigoDesde": "<string>",
        "CodigoHasta": "<string>",
        "NombreContiene": "<string>",
        "FechaRegistroDesde": "<date>",
        "FechaRegistroHasta": "<date>"
      }
    }
  }
}
```

### Observaciones

- Incluye campo comercial `ComprobantesPorCliente` en **Save** (otro método); para **Query** el foco es listado paginado de clientes.

---

# Reglas implícitas de Zeta API

Síntesis para reducir **HTTP 400** y errores de contrato en Copilot.

| Tema | Regla práctica |
|------|----------------|
| **Body plano vs anidado** | Casi siempre **anidado**: una clave raíz `*In` contiene `Connection` y, según método, `Data`, `Codigo`, `Movimiento`, etc. **No** asumir `{ Connection, Data }` en la raíz salvo evidencia explícita del método. |
| **Nombre de la raíz** | Depende del método: `QueryIn`, `QuerySaldosPendientesIn`, `QueryComprobantesIn`, `AgregarIn`, … Mezclar raíz entre métodos produce **400** en gateway ASP.NET típico. |
| **`QueryIn` vs nombre WSDL** | Para `RESTComprobantesClienteV1Query`, la colección oficial usa **`QueryIn`**. Si el runtime exige el nombre del contrato SOAP (`ComprobantesClienteV1QueryIn`), hay que confirmarlo con **prueba en tenant** o soporte Zeta; ambas hipótesis aparecen en discusiones de integración. |
| **Strings vs números** | Las plantillas usan `<integer>` / `<long>`; JSON permite número o string. Si un binder es estricto, **400** puede deberse a tipo (p. ej. `Mes` como string `"04"` vs entero `4`). |
| **`UsuarioCodigo` / `UsuarioClave`** | Aparecen en todas las plantillas; muchas integraciones solo envían desarrollador + empresa + rol. Si hay 400 sin causa clara, probar **omitir** vs **enviar null** vs **enviar 0** según política del tenant. |
| **Errores HTTP** | A menudo el cuerpo es un envelope genérico `{"error":{"code":400,"message":"Bad Request"}}` sin detalle; el diagnóstico pasa por **Postman**, log del payload exacto y comparación **carácter a carácter** con la colección. |
| **Errores de negocio (200 + fallo)** | Algunos métodos devuelven 200 con `Succeed: false` / `Error` dentro de `*Out`; no confundir con éxito. |
| **Finanzas** | La documentación oficial advierte que endpoints agrupados bajo **Finanzas** pueden no estar habilitados para integraciones externas; ignorarlos en diseños Copilot salvo confirmación contractual. |

### Posibles causas del **400 Bad Request** (comprobantes por cliente)

1. **Raíz JSON incorrecta** respecto al binding (`QueryIn` vs `ComprobantesClienteV1QueryIn` vs plano).
2. **`Data` con forma equivocada** (p. ej. meter `Page`/`Filters` copiados de otro método).
3. **Mezcla de contratos** (body de saldos pendientes contra URL de comprobantes por cliente o viceversa).
4. **Tipos** `Mes`/`Anio` no aceptados por el binder (string vs número).
5. **Headers** ausentes (`Content-Type` / `Accept` JSON).

---

## Confirmación

- **Archivos creados o actualizados en** `docs/zeta/reference/`:
  - `ZetaSoftware-REST-10-2025.json` (copia de la colección subida por el usuario)
  - `Postman-Ejemplo-de-consultas.pdf` (copia del PDF subido)
  - `zeta-api-endpoints.md` (índice + tablas por dominio)
  - `zeta-postman-examples.md` (este archivo)
