/**
 * Vista previa de mapping Zeta → campos candidatos tipo `proto_companies`.
 * Solo transformación en memoria; no persiste ni fija el esquema final de Supabase.
 */

const GARBAGE_STRINGS = new Set(["", ".", "http://."]);

export type ProtoCompanyMappingPreview = {
  /** Identificador en Zeta (preview de `external_id` o equivalente). */
  external_id: string | null;
  name: string | null;
  display_name: string | null;
  rut: string | null;
  is_active: boolean | null;
  email_primary: string | null;
  email_secondary: string | null;
  phone: string | null;
  address: string | null;
  department: string | null;
  city: string | null;
  country: string | null;
  website: string | null;
  industry: string | null;
  group_name: string | null;
  zone_name: string | null;
  /** Valor crudo o ISO según venga de Zeta; sin parsear a Date obligatorio. */
  registered_at: string | null;
};

function asRecord(input: unknown): Record<string, unknown> | null {
  if (input === null || input === undefined) return null;
  if (typeof input !== "object" || Array.isArray(input)) return null;
  return input as Record<string, unknown>;
}

/**
 * Trata como vacío: `""`, `"."`, `"http://."` (tras trim).
 * También descarta solo espacios.
 */
export function cleanZetaString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  if (s.length === 0) return null;
  if (GARBAGE_STRINGS.has(s)) return null;
  return s;
}

/**
 * Limpieza extra para textos libres / dirección: quita prefijos basura (`.,`, `.` repetidos al inicio),
 * colapsa espacios múltiples; deja `null` si queda vacío o basura conocida.
 * No aplicar a `Codigo` / identificadores que deban conservar formato.
 */
export function scrubZetaMappedString(value: string | null): string | null {
  if (value == null) return null;
  let s = value.trim();
  let prev = "";
  while (prev !== s) {
    prev = s;
    s = s.replace(/^\.+,+/u, "").trim();
    s = s.replace(/^\.+/u, "").trim();
  }
  s = s.replace(/\s{2,}/g, " ").trim();
  if (s.length === 0 || GARBAGE_STRINGS.has(s)) return null;
  return s;
}

function mapFreeText(raw: unknown): string | null {
  return scrubZetaMappedString(cleanZetaString(raw));
}

function mapZetaCode(raw: unknown): string | null {
  return cleanZetaString(raw);
}

/** RUT: solo basura global y espacios duplicados; no eliminar puntos/guiones del documento. */
export function mapRutField(raw: unknown): string | null {
  const c = cleanZetaString(raw);
  if (!c) return null;
  const collapsed = c.replace(/\s{2,}/g, " ").trim();
  return collapsed.length ? collapsed : null;
}

function pickFirstClean(
  row: Record<string, unknown>,
  keys: string[]
): string | null {
  for (const k of keys) {
    if (!(k in row)) continue;
    const c = cleanZetaString(row[k]);
    if (c) return c;
  }
  return null;
}

/** Alineado a Zeta: activo solo si `ContactoActivo` es `S` (comparación case-insensitive). */
function parseContactoActivo(value: unknown): boolean | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  if (s.length === 0) return null;
  const u = s.toUpperCase();
  if (u === "S") return true;
  if (u === "N") return false;
  return null;
}

function firstUsefulPhone(row: Record<string, unknown>): string | null {
  const t = mapFreeText(row.Telefono);
  if (t) return t;
  return mapFreeText(row.Celular);
}

/**
 * Mapea una fila cruda de `RESTContactosV3Query` a una estructura candidata (preview).
 * Claves Zeta en PascalCase según integración validada; filas no objeto devuelven campos nulos.
 */
export function mapZetaClientToProtoCompanyPreview(
  input: unknown
): ProtoCompanyMappingPreview {
  const row = asRecord(input);
  if (!row) {
    return {
      external_id: null,
      name: null,
      display_name: null,
      rut: null,
      is_active: null,
      email_primary: null,
      email_secondary: null,
      phone: null,
      address: null,
      department: null,
      city: null,
      country: null,
      website: null,
      industry: null,
      group_name: null,
      zone_name: null,
      registered_at: null,
    };
  }

  const razon = mapFreeText(row.RazonSocial);
  const nombre = mapFreeText(row.Nombre);
  const addrRaw = pickFirstClean(row, ["DireccionCompleta", "Direccion"]);
  const address = scrubZetaMappedString(addrRaw);

  return {
    external_id: mapZetaCode(row.Codigo),
    name: razon ?? nombre ?? null,
    display_name: nombre ?? razon ?? null,
    rut: mapRutField(row.RUT),
    is_active: parseContactoActivo(row.ContactoActivo),
    email_primary: mapFreeText(row.Email1),
    email_secondary: mapFreeText(row.Email2),
    phone: firstUsefulPhone(row),
    address,
    department: mapFreeText(row.DepartamentoNombre),
    city: mapFreeText(row.Localidad),
    country: mapFreeText(row.PaisNombre),
    website: mapFreeText(row.Web),
    industry: mapFreeText(row.GiroNombre),
    group_name: mapFreeText(row.GrupoNombre),
    zone_name: mapFreeText(row.ZonaNombre),
    registered_at: mapFreeText(row.FechaRegistro),
  };
}
