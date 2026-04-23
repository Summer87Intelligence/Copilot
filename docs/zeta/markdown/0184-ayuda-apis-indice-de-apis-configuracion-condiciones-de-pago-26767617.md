# API Condiciones de Pago - ZetaSoftware

Fuente:
- URL original: https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/condiciones-de-pago/
- URL final: https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/condiciones-de-pago/

---

## Contenido

# API Condiciones de Pago

Esta API permite gestionar condiciones de pago utilizadas en la empresa para definir plazos, cuotas, recargos y vencimientos. Su objetivo es exponer la parametrización funcional de las condiciones de pago para su uso en procesos comerciales, financieros y de integración.

La funcionalidad asociada en el sistema se encuentra en Configuración > Condiciones de Pago.

## Casos de uso

-   Consultar condiciones de pago configuradas en la empresa.
-   Crear nuevas condiciones de pago.
-   Modificar parámetros de cuotas, vencimientos y recargos.
-   Sincronizar condiciones de pago con sistemas externos.

## Endpoint del servicio

-   **WSDL:** [https://api.zetasoftware.com/z.apis.asoapcondicionespagov1?wsdl](https://api.zetasoftware.com/z.apis.asoapcondicionespagov1?wsdl)
-   **Servicio:** [https://api.zetasoftware.com/z.apis.asoapcondicionespagov1](https://api.zetasoftware.com/z.apis.asoapcondicionespagov1)

## Método Query

Permite obtener un listado paginado de condiciones de pago configuradas en la empresa.

### Requisitos previos

-   Contar con acceso habilitado a la API.
-   Definir el rango de códigos a consultar.

### Parámetros de entrada

| Parámetro | Tipo | Obligatorio | Descripción |
| --- | --- | --- | --- |
| `CodigoDesde` | T(3) | Sí | Código inicial del rango de condiciones de pago a consultar. |
| `CodigoHasta` | T(3) | Sí | Código final del rango de condiciones de pago a consultar. |
| `NombreContiene` | T(20) | No | Texto a buscar dentro del nombre de la condición de pago. |
| `Page` | N(2) | Sí | Número de página a consultar. |

### Estructura del request

```
CodigoDesde
CodigoHasta
NombreContiene
Page
```

### Estructura del response

```
Codigo
Nombre
CuotasIguales
CantidadCuotas
Desde
PorcentajeRecargo
VencimientoDias
VencimientoMes
SeparacionDias
SeparacionMes
DecimalesCuota1
```

### Campos devueltos

| Campo | Descripción |
| --- | --- |
| `Codigo` | Código de la condición de pago. |
| `Nombre` | Nombre de la condición de pago. |
| `CuotasIguales` | Indica si las cuotas se calculan en importes iguales. |
| `CantidadCuotas` | Cantidad de cuotas definidas para la condición. |
| `Desde` | Parámetro de referencia utilizado para el cálculo de vencimientos. |
| `PorcentajeRecargo` | Porcentaje de recargo aplicado a la condición. |
| `VencimientoDias` | Cantidad de días para el vencimiento. |
| `VencimientoMes` | Parámetro mensual asociado al vencimiento. |
| `SeparacionDias` | Cantidad de días entre cuotas. |
| `SeparacionMes` | Separación mensual entre cuotas. |
| `DecimalesCuota1` | Indica el criterio aplicado a decimales en la primera cuota. |

### Ejemplo de request

```
{
  "CodigoDesde": "001",
  "CodigoHasta": "999",
  "NombreContiene": "",
  "Page": 1
}
```

### Ejemplo de response

```
[
  {
    "Codigo": "001",
    "Nombre": "30 días",
    "CuotasIguales": "S",
    "CantidadCuotas": 1,
    "Desde": "F",
    "PorcentajeRecargo": 0.00,
    "VencimientoDias": 30,
    "VencimientoMes": 0,
    "SeparacionDias": 0,
    "SeparacionMes": 0,
    "DecimalesCuota1": "S"
  }
]
```

## Método Save

Permite crear o actualizar una condición de pago.

### Parámetros de entrada

| Campo | Tipo | Obligatorio | Descripción |
| --- | --- | --- | --- |
| `Codigo` | T(3) | Sí | Código de la condición de pago. |
| `Nombre` | T(30) | Sí | Nombre de la condición de pago. |
| `CuotasIguales` | T(1) | Sí | Indica si las cuotas son iguales. |
| `CantidadCuotas` | N(2) | Sí | Cantidad de cuotas. |
| `Desde` | T(1) | No | Referencia base para cálculo de vencimientos. |
| `PorcentajeRecargo` | N(3.2) | No | Porcentaje de recargo. |
| `VencimientoDias` | N(4) | No | Días hasta el vencimiento. |
| `VencimientoMes` | N(4) | No | Parámetro mensual de vencimiento. |
| `SeparacionDias` | N(4) | No | Días de separación entre cuotas. |
| `SeparacionMes` | N(4) | No | Separación mensual entre cuotas. |
| `DecimalesCuota1` | T(1) | No | Criterio de decimales aplicado a la primera cuota. |

### Resultado

```
Succeed
Error
Mensaje
```

## Observaciones

-   Los parámetros `CodigoDesde`, `CodigoHasta` y `Page` son obligatorios en el método `Query`.
-   La API expone la configuración de condiciones de pago y permite su mantenimiento.
-   La definición de cuotas, vencimientos y recargos impacta directamente en procesos comerciales y financieros.

## Consideraciones de integración

-   Se recomienda consumir esta API como fuente de parametrización para comprobantes, ventas, compras y cuentas corrientes.
-   Persistir localmente las condiciones de pago si otros procesos dependen de ellas.
-   Validar previamente la lógica de cuotas y vencimientos antes de automatizar cálculos externos.
-   Controlar el impacto de cambios en recargos y vencimientos sobre procesos ya integrados.

[API Condiciones de Pago - PreviousAPI Conceptos](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/conceptos/)[Next - API Condiciones de PagoAPI Contactos](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/contactos/)

---

## Links relacionados

- [API Condiciones de Pago - PreviousAPI Conceptos](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/conceptos/)
- [Next - API Condiciones de PagoAPI Contactos](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/contactos/)

