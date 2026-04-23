# Protocolos soportados: SOAP y REST - ZetaSoftware

Fuente:
- URL original: https://zetasoftware.info/ayuda/apis/soap-y-rest/
- URL final: https://zetasoftware.info/ayuda/apis/soap-y-rest/

---

## Contenido

# Protocolos soportados: SOAP y REST

ZetaSoftware expone sus APIs bajo dos protocolos: **SOAP** y **REST**. REST es el protocolo oficial y recomendado para todas las integraciones nuevas. El soporte SOAP se mantiene exclusivamente para integraciones existentes y se encuentra en proceso de descontinuación.

* * *

## SOAP (soporte limitado — en descontinuación)

SOAP es un protocolo basado en XML con estructura de mensaje fija (encabezado + cuerpo) y descripción de servicios mediante archivos WSDL.

| Característica | Detalle |
| --- | --- |
| Formato de mensaje | XML estricto |
| Autenticación | WS-Security |
| Estado de soporte | Mantenimiento de compatibilidad únicamente. Sin nuevas versiones ni actualizaciones funcionales. |

**Todas las integraciones nuevas deben implementarse sobre REST.**  
Las integraciones SOAP existentes continuarán operando, pero no recibirán mantenimiento futuro.

* * *

## REST (protocolo recomendado)

REST es el estándar oficial de ZetaSoftware. Utiliza métodos HTTP estándar (`GET`, `POST`, `PUT`, `DELETE`) y transfiere datos en formato JSON.

| Característica | Detalle |
| --- | --- |
| Formato de datos | JSON |
| Modelo | Stateless: cada request es independiente |
| Acceso a recursos | Cada entidad se opera mediante una URL única |
| Compatibilidad | Aplicaciones web, móviles y servicios de terceros |

* * *

## Ejemplo de request y response

El siguiente ejemplo consulta los saldos pendientes de un cliente específico mediante el endpoint `RESTFacturaClienteV4QuerySaldosPendientes`.

### Request — Python

```
import requests, json

# Credenciales y parámetros
desarrollador_codigo = "TU_CODIGO_DESARROLLADOR"
desarrollador_clave  = "TU_CLAVE_DESARROLLADOR"
empresa_codigo       = "TU_CODIGO_EMPRESA"
empresa_clave        = "TU_CLAVE_EMPRESA"
cliente_codigo       = "CODIGO_DE_CLIENTE_A_CONSULTAR"

payload = {
    "QuerySaldosPendientesIn": {
        "Connection": {
            "DesarrolladorCodigo": desarrollador_codigo,
            "DesarrolladorClave":  desarrollador_clave,
            "EmpresaCodigo":       empresa_codigo,
            "EmpresaClave":        empresa_clave,
            "RolCodigo":           "1"
        },
        "Data": {
            "Page": "1",
            "Filters": {
                "ClienteCodigo": cliente_codigo
            }
        }
    }
}

url     = "https://api.zetasoftware.com/rest/APIs/RESTFacturaClienteV4QuerySaldosPendientes"
headers = {"Content-Type": "application/json"}

r = requests.post(url, headers=headers, json=payload)

if r.ok:
    print(json.dumps(r.json(), indent=2, ensure_ascii=False))
else:
    print(f"Error {r.status_code}: {r.text}")
```

### Response

```
{
  "QuerySaldosPendientesOut": {
    "IsLastPage": true,
    "Succeed": true,
    "Response": [
      {
        "ClienteCodigo":          "C123",
        "ClienteNombre":          "Cliente prueba API",
        "ClienteRazonSocial":     "Cliente prueba API",
        "ComprobanteAbreviacion": "e-Vta.Cred",
        "ComprobanteCodigo":      701,
        "ComprobanteNombre":      "Venta Crédito (CFE)",
        "ComprobanteTipo":        1,
        "ComprobanteTipoNombre":  "Venta Crédito",
        "CondicionCodigo":        "",
        "CondicionNombre":        "",
        "Emitido":                "N",
        "Fecha":                  "2025-07-10",
        "LocalCodigo":            1,
        "LocalNombre":            "Casa Central",
        "MonedaCodigo":           1,
        "MonedaNombre":           "Pesos",
        "MonedaSimbolo":          "$",
        "Notas":                  "",
        "Numero":                 "0",
        "RegistroId":             "5469",
        "Saldo":                  "61.00",
        "SaldoSigno":             "61.00",
        "Serie":                  "",
        "Total":                  "61.00",
        "TotalSigno":             "61.00"
      }
    ]
  }
}
```

* * *

## Colección Postman

ZetaSoftware publica una colección Postman con todos los endpoints disponibles, agrupados por entidad (Factura Clientes, Artículos, Cajas, etc.).

[  
Descargar colección Postman (JSON)  
](https://zetasoftware.info/wp-content/uploads/2025/10/Api-ZetaSoftware-collection_28-10-2025.zip)

Para importarla: _File → Import → Upload Files_ en Postman, seleccionando el archivo descargado.

**Nota:** los endpoints agrupados bajo _Finanzas_ no están disponibles para integraciones externas y deben ignorarse.

[Protocolos soportados: SOAP y REST - PreviousMétodos de la API](https://zetasoftware.info/ayuda/apis/metodos-generales/)[Next - Protocolos soportados: SOAP y RESTÍndice de APIs](https://zetasoftware.info/ayuda/apis/indice-de-apis/)

---

## Links relacionados

- [Next - Protocolos soportados: SOAP y RESTÍndice de APIs](https://zetasoftware.info/ayuda/apis/indice-de-apis/)
- [Protocolos soportados: SOAP y REST - PreviousMétodos de la API](https://zetasoftware.info/ayuda/apis/metodos-generales/)

