# ZetaSoftware API — Examples

## Regla

Los ejemplos de este archivo son estructurales. No contienen credenciales reales.

## RESTFacturaClienteV4Agregar — estructura

{
  "AgregarIn": {
    "Connection": {
      "DesarrolladorCodigo": "<string>",
      "DesarrolladorClave": "<string>",
      "EmpresaCodigo": "<string>",
      "EmpresaClave": "<string>",
      "RolCodigo": "1"
    },
    "Data": {
      "Movimiento": {
        "CodigoComprobante": 701,
        "Fecha": "20250710",
        "CodigoMoneda": 1,
        "CodigoCliente": "C123",
        "CodigoDepositoOrigen": 1,
        "CodigoDepositoDestino": 1,
        "CodigoReferencia": "12345",
        "Notas": "Comprobante prueba",
        "CodigoLocal": 1,
        "CodigoCaja": 1,
        "CodigoUsuario": 1,
        "Lineas": [
          {
            "CodigoArticulo": "12345",
            "Concepto": "Descripción Artículo",
            "Cantidad": 1,
            "PrecioUnitario": 500,
            "Descuento1": 0,
            "Descuento2": 0,
            "Descuento3": 0,
            "CodigoIVA": 2,
            "Notas": "Nota línea"
          }
        ]
      }
    }
  }
}

## RESTFacturaClienteV4VentasDetalladas — estructura

{
  "VentasDetalladasIn": {
    "Connection": {
      "DesarrolladorCodigo": "<string>",
      "DesarrolladorClave": "<string>",
      "EmpresaCodigo": "<string>",
      "EmpresaClave": "<string>",
      "RolCodigo": "1"
    },
    "Data": {
      "Mes": "06",
      "Anio": "2025"
    }
  }
}

## RESTQuerySaldoPendienteCliente — estructura

{
  "QuerySaldosPendientesIn": {
    "Connection": {
      "DesarrolladorCodigo": "<string>",
      "DesarrolladorClave": "<string>",
      "EmpresaCodigo": "<string>",
      "EmpresaClave": "<string>",
      "RolCodigo": "1"
    },
    "Data": {
      "Page": "1",
      "Filters": {
        "ClienteCodigo": "C123"
      }
    }
  }
}
