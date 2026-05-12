/**
 * Mapper PURO de cuotas pendientes (`RESTCuotasV1QueryCliente`).
 *
 * Convierte filas crudas de Zeta (`ZetaInstallmentRecord`) en `ProtoInstallmentInput`
 * — el shape de dominio que el (futuro) pipeline de upsert consumirá. NO toca DB,
 * NO toca pipelines, NO toca Supabase. Solo transforma datos.
 *
 * El `RegistroId` Zeta es la clave que linkea cada cuota con su factura local vía
 * `proto_invoices.zeta_metadata.zeta_customer_voucher_v1.zeta_registro_id`.
 *
 * Reglas de mapeo (alineadas con el resto de mappers Zeta):
 *  - Defensivo ante camelCase / PascalCase / strings numéricos / nulls.
 *  - Devuelve `{ ok: true, installment }` o `{ ok: false, error }` por fila.
 *  - Normaliza fechas a `YYYY-MM-DD` (sin hora).
 *  - `currency_code` se resuelve desde `MonedaCodigo` numérico via mapa estándar:
 *      0 → null   (sin moneda)
 *      1 → "UYU"  (peso uruguayo)
 *      2 → "USD"  (dólar)
 *      Otros → null (con warning en logs estructurados desde el caller).
 *  - `cuota_saldo` y `cuota_total` se exponen como números con 5 decimales (igual
 *    que Zeta) — el pipeline futuro debe redondear al guardar.
 *
 * Sin tests todavía: el archivo de tests (`zeta-installments-mapper.test.ts`)
 * cubre todos los casos edge.
 */

export type ProtoInstallmentInput = Readonly<{
  /** RegistroId Zeta de la FACTURA (linkea con `proto_invoices.zeta_metadata.…zeta_registro_id`). */
  zeta_registro_id: number;
  /** Código del cliente Zeta (no necesario para upsert si se infiere desde la factura, pero útil para auditoría). */
  cliente_codigo: string | null;
  /** Número de cuota (1..N). */
  cuota_numero: number;
  /** Fecha de vencimiento real, `YYYY-MM-DD`. */
  cuota_vencimiento: string;
  /** Código moneda Zeta (numérico, raw). */
  moneda_codigo: number | null;
  /** Moneda normalizada (`"UYU" | "USD" | null`). */
  currency_code: "UYU" | "USD" | null;
  /** Importe total de la cuota. */
  cuota_total: number;
  /** Saldo pendiente de la cuota (≤ cuota_total). */
  cuota_saldo: number;
  /** Flag Zeta `EsEntregaInicial` ("S"/"N" o boolean). */
  es_entrega_inicial: boolean | null;
  /** Payload crudo (para `raw_payload` en la tabla). */
  raw_payload: Readonly<Record<string, unknown>>;
}>;

export type MapInstallmentResult =
  | { ok: true; installment: ProtoInstallmentInput }
  | { ok: false; error: string };

export type MapInstallmentsBatchResult = {
  mapped: ProtoInstallmentInput[];
  discards: Array<{ index: number; reason: string; sample_keys: string[] }>;
};

function readCI(rec: Record<string, unknown>, names: readonly string[]): unknown {
  for (const n of names) {
    if (Object.prototype.hasOwnProperty.call(rec, n)) return rec[n];
    const lc = n.toLowerCase();
    for (const k of Object.keys(rec)) {
      if (k.toLowerCase() === lc) return rec[k];
    }
  }
  return undefined;
}

function asNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const t = v.trim();
    if (!t) return null;
    // Zeta a veces devuelve "15000.00000" o "15.000,00" (es-UY). Soportar ambos.
    // Heurística: si tiene tanto "," como ".", asumir "1.234,56" (es-UY).
    const hasDot = t.includes(".");
    const hasComma = t.includes(",");
    let normalized = t;
    if (hasDot && hasComma) {
      normalized = t.replace(/\./g, "").replace(",", ".");
    } else if (hasComma && !hasDot) {
      normalized = t.replace(",", ".");
    }
    const n = Number(normalized);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function asInteger(v: unknown): number | null {
  const n = asNumber(v);
  if (n === null) return null;
  return Number.isInteger(n) ? n : Math.trunc(n);
}

function asString(v: unknown): string | null {
  if (typeof v === "string") {
    const t = v.trim();
    return t.length > 0 ? t : null;
  }
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return null;
}

function asBoolean(v: unknown): boolean | null {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") {
    const lv = v.trim().toLowerCase();
    if (lv === "s" || lv === "true" || lv === "y" || lv === "yes" || lv === "1") return true;
    if (lv === "n" || lv === "false" || lv === "no" || lv === "0") return false;
  }
  if (typeof v === "number") {
    if (v === 1) return true;
    if (v === 0) return false;
  }
  return null;
}

/**
 * Normaliza `CuotaVencimiento` a `YYYY-MM-DD`. Acepta:
 *   - `"2026-03-20"` (canonical Zeta) — pass-through.
 *   - `"2026-03-20T00:00:00"` — strip tiempo.
 *   - `"2026-03-20T00:00:00.000Z"` — strip tiempo + zona.
 *   - `"20/03/2026"` (es-UY) — re-ordenar.
 *   - `Date` — `toISOString().slice(0,10)`.
 *   - `number` (epoch ms) — `new Date(n).toISOString().slice(0,10)`.
 */
function normalizeDate(v: unknown): string | null {
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    return v.toISOString().slice(0, 10);
  }
  if (typeof v === "number" && Number.isFinite(v)) {
    const d = new Date(v);
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    return null;
  }
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t) return null;
  const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const [, y, m, d] = iso;
    return `${y}-${m}-${d}`;
  }
  const dmy = t.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (dmy) {
    const [, d, m, y] = dmy;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  const parsed = new Date(t);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return null;
}

/**
 * Mapa estándar Zeta UY (validado contra `RESTMonedasV1Query` muestreos previos):
 *   1 = UYU (peso uruguayo), 2 = USD (dólar). Otros = null hasta confirmar.
 */
function mapCurrencyCode(monedaCodigo: number | null): "UYU" | "USD" | null {
  if (monedaCodigo === 1) return "UYU";
  if (monedaCodigo === 2) return "USD";
  return null;
}

/**
 * Mapea UNA fila cruda a `ProtoInstallmentInput`.
 */
export function mapZetaInstallment(raw: unknown): MapInstallmentResult {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: "row no es objeto" };
  }
  const r = raw as Record<string, unknown>;

  const registroId = asInteger(readCI(r, ["RegistroId", "registroId", "registro_id"]));
  if (registroId === null || registroId <= 0) {
    return { ok: false, error: "RegistroId ausente o inválido" };
  }
  const cuotaNumero = asInteger(readCI(r, ["CuotaNumero", "cuotaNumero", "cuota_numero"]));
  if (cuotaNumero === null || cuotaNumero <= 0) {
    return { ok: false, error: "CuotaNumero ausente o inválido" };
  }
  const cuotaVencimientoRaw = readCI(r, ["CuotaVencimiento", "cuotaVencimiento", "cuota_vencimiento"]);
  const cuotaVencimiento = normalizeDate(cuotaVencimientoRaw);
  if (!cuotaVencimiento) {
    return { ok: false, error: "CuotaVencimiento ausente o no parseable" };
  }
  const cuotaTotal = asNumber(readCI(r, ["CuotaTotal", "cuotaTotal", "cuota_total"]));
  if (cuotaTotal === null) {
    return { ok: false, error: "CuotaTotal ausente o no parseable" };
  }
  const cuotaSaldo = asNumber(readCI(r, ["CuotaSaldo", "cuotaSaldo", "cuota_saldo"]));
  if (cuotaSaldo === null) {
    return { ok: false, error: "CuotaSaldo ausente o no parseable" };
  }
  const monedaCodigo = asInteger(readCI(r, ["MonedaCodigo", "monedaCodigo", "moneda_codigo"]));
  const clienteCodigo = asString(readCI(r, ["ClienteCodigo", "clienteCodigo", "cliente_codigo"]));
  const esEntregaInicial = asBoolean(readCI(r, ["EsEntregaInicial", "esEntregaInicial", "es_entrega_inicial"]));

  return {
    ok: true,
    installment: {
      zeta_registro_id: registroId,
      cliente_codigo: clienteCodigo,
      cuota_numero: cuotaNumero,
      cuota_vencimiento: cuotaVencimiento,
      moneda_codigo: monedaCodigo,
      currency_code: mapCurrencyCode(monedaCodigo),
      cuota_total: cuotaTotal,
      cuota_saldo: cuotaSaldo,
      es_entrega_inicial: esEntregaInicial,
      raw_payload: r,
    },
  };
}

/**
 * Mapea un batch de filas. Devuelve `mapped` y `discards` con detalles.
 */
export function mapZetaInstallmentsBatch(rows: readonly unknown[]): MapInstallmentsBatchResult {
  const mapped: ProtoInstallmentInput[] = [];
  const discards: MapInstallmentsBatchResult["discards"] = [];
  for (let i = 0; i < rows.length; i++) {
    const result = mapZetaInstallment(rows[i]);
    if (result.ok) {
      mapped.push(result.installment);
    } else {
      const sampleKeys =
        rows[i] && typeof rows[i] === "object" && !Array.isArray(rows[i])
          ? Object.keys(rows[i] as Record<string, unknown>).slice(0, 8)
          : [];
      discards.push({ index: i, reason: result.error, sample_keys: sampleKeys });
    }
  }
  return { mapped, discards };
}
