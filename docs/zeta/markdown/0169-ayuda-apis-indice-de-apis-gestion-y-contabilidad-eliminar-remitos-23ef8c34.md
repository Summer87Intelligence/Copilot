# API Eliminar Remitos - ZetaSoftware

Fuente:
- URL original: https://zetasoftware.info/ayuda/apis/indice-de-apis/gestion-y-contabilidad/eliminar-remitos/
- URL final: https://zetasoftware.info/ayuda/apis/indice-de-apis/gestion-y-contabilidad/eliminar-remitos/

---

## Contenido

# API Eliminar Remitos

Esta API permite eliminar comprobantes del tipo movimiento de stock (No CFEs) emitidos a clientes o proveedores. La eliminación es definitiva y actualiza automáticamente el stock de los artículos incluidos en el comprobante.

Está orientada a integraciones que requieren eliminar remitos sin intervención manual desde la interfaz de ZetaSoftware.

## Endpoint del servicio

-   **Servicio:** [https://api.zetasoftware.com/z.apis.asoapeliminarremitov1](https://api.zetasoftware.com/z.apis.asoapeliminarremitov1)
-   **WSDL:** [https://api.zetasoftware.com/z.apis.asoapeliminarremitov1?wsdl](https://api.zetasoftware.com/z.apis.asoapeliminarremitov1?wsdl)

## Propósito funcional

-   Eliminar remitos de ingreso de proveedores.
-   Eliminar remitos de egreso de clientes.
-   Revertir el impacto del comprobante sobre el stock.
-   Registrar la eliminación en la papelera de comprobantes.

## Comprobantes admitidos

La API admite únicamente comprobantes del tipo básico **Movimiento de Stock de Cliente o Proveedor**.

-   Remitos de ingreso de proveedores.
-   Remitos de egreso de clientes.

No admite otros comprobantes, como facturas, Recibos u otros tipos documentales.

## Requisitos previos

-   Contar con el identificador interno del comprobante.
-   Contar con el código del local comercial asociado al remito.
-   Verificar que el comprobante no haya sido emitido como CFE.
-   Verificar que el remito no tenga vínculos con comprobantes posteriores de entrega o facturación.

## Parámetros de entrada

| Campo | Tipo | Obligatorio | Descripción |
| --- | --- | --- | --- |
| `Local` | N(3) | Sí | Código del local comercial donde fue emitido el remito. |
| `Registro` | N(9) | Sí | Identificador interno del comprobante a eliminar. |

## Estructura del request

```
Local
Registro
```

## Ejemplo de request

```
{
  "Local": 1,
  "Registro": 123456789
}
```

## Respuesta esperada

Si la operación se ejecuta correctamente, la API devuelve un mensaje de confirmación con los datos principales del comprobante eliminado.

```
Se ha eliminado el comprobante Remito Nº A1234 del 01/04/25. Total $ 3.211,00
```

## Efectos de la operación

-   El remito se elimina completamente del sistema.
-   El evento se registra en la **Papelera de Comprobantes**.
-   El texto del evento indica que el comprobante fue eliminado mediante API.
-   El usuario técnico asignado al registro será siempre el `usuario 1`.
-   Se actualiza automáticamente el stock de todos los artículos incluidos en el comprobante eliminado.

## Errores y validaciones

La API valida que el local y el comprobante existan y que el remito esté en condiciones de ser eliminado.

-   `Error, el identificador del registro no es válido: Debe ser mayor a cero.`
-   `Error, el identificador del registro no es válido: No pertenece a ningún comprobante.`
-   `Error, el identificador del local comercial no es válido: Debe ser mayor a cero.`
-   `Error, el identificador del local comercial no está registrado.`
-   `Error, el comprobante no es del tipo básico Movimiento de Stock de Cliente o Proveedor.`
-   `Error, el CFE ya ha sido emitido, por lo tanto no puede ser eliminado.`
-   `Error, no es posible eliminar el comprobante: ya se ha vinculado con comprobantes de entrega o facturación de mercadería.`
-   `Error, el comprobante tiene fecha menor a la fecha de trabado.`

## Observaciones importantes

-   La eliminación es definitiva y no puede deshacerse.
-   El comprobante eliminado deja trazabilidad en la papelera de comprobantes.
-   La API no elimina otros tipos documentales fuera de movimientos de stock básicos.

## Consideraciones de integración

-   Validar previamente que el remito no tenga vínculos posteriores antes de invocar la API.
-   No utilizar esta API como mecanismo de reversión general para cualquier comprobante.
-   Persistir el identificador del registro eliminado para auditoría en el sistema integrador.
-   Considerar que la eliminación impacta inmediatamente en el stock.

## Advertencia operativa

**Importante:** la operación elimina el remito en forma definitiva. No existe mecanismo de deshacer una vez ejecutada.

[API Eliminar Remitos - PreviousAPI Tarjetas Recibidas](https://zetasoftware.info/ayuda/apis/indice-de-apis/gestion-y-contabilidad/tarjetas-recibidas/)[Next - API Eliminar RemitosConfiguración](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/)

---

## Links relacionados

- [Next - API Eliminar RemitosConfiguración](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/)
- [API Eliminar Remitos - PreviousAPI Tarjetas Recibidas](https://zetasoftware.info/ayuda/apis/indice-de-apis/gestion-y-contabilidad/tarjetas-recibidas/)

