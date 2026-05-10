/**
 * Mapeo estable Zeta Contacto → campos proto (sin persistencia).
 */

import type { ZetaContact } from "@/lib/integrations/zeta/contracts/zeta-contacts.contract";
import { cleanZetaString, scrubZetaMappedString } from "@/lib/integrations/zeta/zeta-client-mapper";

function mapFreeText(raw: unknown): string | null {
  return scrubZetaMappedString(cleanZetaString(raw));
}

function ynFlag(raw: unknown): boolean | null {
  const s = cleanZetaString(raw);
  if (!s) return null;
  const u = s.toUpperCase();
  if (u === "S" || u === "Y" || u === "1" || u === "TRUE") return true;
  if (u === "N" || u === "0" || u === "FALSE") return false;
  return null;
}

function readOwn(contact: ZetaContact, keys: readonly string[]): unknown {
  for (const k of keys) {
    if (Object.prototype.hasOwnProperty.call(contact, k)) return contact[k];
    const want = k.toLowerCase();
    for (const key of Object.keys(contact)) {
      if (key.toLowerCase() === want) return contact[key];
    }
  }
  return undefined;
}

export type ZetaContactProtoShape = {
  external_id: string | null;
  name: string | null;
  document: string | null;
  email: string | null;
  email2: string | null;
  telefono: string | null;
  celular: string | null;
  es_cliente: boolean | null;
  es_proveedor: boolean | null;
  /** Copia JSON-serializable del contacto Zeta (auditoría / reprocesos). */
  raw_payload: Record<string, unknown>;
};

/**
 * Mínimo acordado + `raw_payload` para no perder atributos no mapeados explícitamente.
 */
export function mapZetaContactToProto(contact: ZetaContact): ZetaContactProtoShape {
  const raw_payload: Record<string, unknown> = {};
  for (const k of Object.keys(contact)) {
    raw_payload[k] = contact[k];
  }

  const codigo = cleanZetaString(readOwn(contact, ["Codigo", "codigo"]));
  const nombre = mapFreeText(readOwn(contact, ["Nombre", "nombre"]));
  const razon = mapFreeText(readOwn(contact, ["RazonSocial", "razonSocial", "Razon_Social"]));
  const name = nombre ?? razon ?? null;
  const document = cleanZetaString(readOwn(contact, ["Documento", "documento", "RUT", "rut"]));
  const email = mapFreeText(readOwn(contact, ["Email1", "email1", "Email", "email"]));
  const email2 = mapFreeText(readOwn(contact, ["Email2", "email2"]));
  const telefono = cleanZetaString(
    readOwn(contact, ["Telefono", "telefono", "Telefono1", "telefono1"])
  );
  const celular = cleanZetaString(
    readOwn(contact, ["Celular", "celular", "Movil", "movil"])
  );

  return {
    external_id: codigo,
    name,
    document,
    email: email ? email.toLowerCase() : null,
    email2: email2 ? email2.toLowerCase() : null,
    telefono,
    celular,
    es_cliente: ynFlag(readOwn(contact, ["EsCliente", "esCliente"])),
    es_proveedor: ynFlag(readOwn(contact, ["EsProveedor", "esProveedor"])),
    raw_payload,
  };
}
