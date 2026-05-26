/**
 * Datos de la empresa emisora del estado de cuenta.
 * Se usan como fallback cuando no se puede cargar la empresa del workspace desde la DB.
 *
 * Para cambiar los datos reales de la empresa, cargarlos desde proto_companies
 * en el route y pasarlos como `issuer` a renderAccountStatementPdf.
 */
export type IssuerInfo = {
  name: string;
  rut?: string;
  addressLine?: string;
  phone?: string;
  city?: string;
};

export const ISSUER_FALLBACK: IssuerInfo = {
  name: "Easy Digital Agency S.A.S.",
  rut: "RUT 020590350018",
  addressLine: "ITALIA 7777 404",
  phone: "Tel. 094 735 020",
  city: "CIUDAD DE LA COSTA",
};
