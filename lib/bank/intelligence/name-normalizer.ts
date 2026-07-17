/**
 * FASE DOMAIN-IA-BANK-001 — Normalizador PURO y CONSERVADOR de nombres de pagador.
 *
 * Objetivo: reconocer que "PEPITO S.A.", "Pepito SA" y "P E P I T O  S.A." son
 * la MISMA forma normalizada, SIN unir nombres distintos por error. El nombre
 * normalizado es una AYUDA de matching (última señal), nunca un identificador
 * único. Conserva siempre el valor original aparte.
 *
 * No toca DB. Determinístico y versionado.
 */

export const NAME_NORMALIZER_VERSION = 1;

/** Sufijos societarios que se remueven SOLO para comparar (no del original). */
const CORPORATE_SUFFIXES = [
  "sociedad anonima",
  "s a s", // SAS espaciado
  "sas",
  "srl",
  "s r l",
  "s a",
  "sa",
  "ltda",
  "limitada",
  "s c",
  "sc",
];

function stripDiacritics(value: string): string {
  return value.normalize("NFD").replace(/\p{M}/gu, "");
}

/**
 * Forma normalizada para COMPARACIÓN (no para mostrar):
 *  - minúsculas, sin acentos;
 *  - puntuación irrelevante → espacio;
 *  - colapsa espacios (incluye "P E P I T O" → "pepito" solo si quedan tokens de 1 letra
 *    contiguos, ver joinSingleLetters);
 *  - remueve sufijos societarios al final.
 */
export function normalizePayerName(raw: string | null | undefined): string {
  if (!raw) return "";
  let s = stripDiacritics(String(raw)).toLowerCase();
  s = s.replace(/[^a-z0-9\s]/g, " ");
  s = s.replace(/\s+/g, " ").trim();
  if (!s) return "";

  // Estripar el sufijo societario ANTES de unir letras sueltas evita que "S.A."
  // ("s a") se fusione dentro del nombre ("p e p i t o s a" → "pepitosa").
  s = stripCorporateSuffix(s);
  s = joinSingleLetters(s);
  return s.replace(/\s+/g, " ").trim();
}

/**
 * Une secuencias de ≥3 letras sueltas separadas por espacios ("p e p i t o" →
 * "pepito"). Conservador: solo colapsa runs de tokens de 1 carácter; no toca
 * palabras normales. Evita fusionar iniciales cortas (2 letras) por accidente.
 */
export function joinSingleLetters(value: string): string {
  const tokens = value.split(" ");
  const out: string[] = [];
  let run: string[] = [];
  const flush = () => {
    if (run.length >= 3) out.push(run.join(""));
    else out.push(...run);
    run = [];
  };
  for (const t of tokens) {
    if (t.length === 1) run.push(t);
    else {
      flush();
      out.push(t);
    }
  }
  flush();
  return out.join(" ").trim();
}

function stripCorporateSuffix(value: string): string {
  let s = value;
  // Remueve un único sufijo societario al final (el más largo que matchee).
  const sorted = [...CORPORATE_SUFFIXES].sort((a, b) => b.length - a.length);
  for (const suf of sorted) {
    if (s === suf) return ""; // solo era el sufijo
    if (s.endsWith(" " + suf)) {
      s = s.slice(0, s.length - suf.length - 1).trim();
      break;
    }
  }
  return s;
}

/** True si dos nombres comparten forma normalizada NO vacía. */
export function payerNamesMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = normalizePayerName(a);
  const nb = normalizePayerName(b);
  return na.length > 0 && na === nb;
}
