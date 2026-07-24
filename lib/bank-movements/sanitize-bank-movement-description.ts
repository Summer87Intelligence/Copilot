/**
 * REGLA FUNCIONAL PERMANENTE del motor de importación bancaria (todo banco,
 * todo formato, presente y futuro — ver docs/architecture/bank-import-
 * balance-normalization.md): el saldo de cuenta NO forma parte de un
 * movimiento bancario. Cualquier texto que lo represente ("Saldo final",
 * "Saldo inicial", "Saldo disponible", "Saldo contable", "Nuevo saldo",
 * "Balance", "Closing balance", "Opening balance", "Available balance",
 * "Ledger balance", o cualquier variante equivalente) se descarta ANTES de
 * persistir el movimiento — para todos los usuarios, sin excepción. No
 * depende de rol, permiso, workspace ni frontend: corre una sola vez, en el
 * builder compartido por todos los importadores (`buildMovementInsertFromPreview`).
 *
 * Único helper de normalización de descripciones bancarias del proyecto.
 * Todo importador (Santander PDF, Santander Excel, y cualquier banco o
 * formato futuro) DEBE reutilizar esta función — nunca duplicar expresiones
 * regulares ni lógica de limpieza de saldo en otro archivo.
 *
 * No es una capa de privacidad por usuario — eso sigue siendo
 * `bank-movement-balance-privacy.ts`, que resuelve un problema distinto
 * (el campo numérico `metadata.balance`, no texto embebido en la
 * descripción). Ver el comentario en ese archivo.
 *
 * Causa raíz real (confirmada con extractos de julio 2026): el parser PDF
 * arma el `raw_text` de la ÚLTIMA fila de la tabla a partir del bloque
 * completo entre esa fecha y el fin del texto extraído — sin una fecha
 * siguiente que lo corte, ese bloque incluye la línea "Saldo final X" (y a
 * veces el valor de saldo de la propia fila, duplicado), seguida a menudo
 * por el aviso fijo "El saldo informado no incluye movimientos en
 * tránsito." Esta función sanea el resultado final sin importar qué parser
 * o combinación de artefactos lo haya producido — es la defensa por
 * defecto, no un parche puntual del bug del PDF.
 */

import { parseUruguayMoney } from "@/lib/treasury/santander-pdf-statement-parser";

const MONEY_SRC = String.raw`-?\d{1,3}(?:\.\d{3})*(?:,\d{2})?|-?\d+(?:,\d{2})?`;
const CURRENCY_SRC = String.raw`(?:UYU|USD|U\$S)`;
/** Lista cerrada de variantes conocidas (español + inglés) — nunca un
 *  genérico "saldo + cualquier palabra" (evitaría falsos positivos en
 *  descripciones legítimas como "PAGO SALDO TARJETA"). Bancos/formatos
 *  futuros que agreguen una variante nueva la suman acá, en un único lugar. */
const BALANCE_LABEL_SRC = String.raw`(?:nuevo\s+saldo|saldo\s+(?:final|inicial|disponible|contable)|opening\s+balance|closing\s+balance|available\s+balance|ledger\s+balance|balance)`;

const BALANCE_CLAUSE_RE = new RegExp(
  String.raw`${BALANCE_LABEL_SRC}\s*:?\s*(?:${CURRENCY_SRC}\s*)?(${MONEY_SRC})?(?:\s*${CURRENCY_SRC})?`,
  "gi"
);
const TRAILING_MONEY_RE = new RegExp(String.raw`(${MONEY_SRC})\s*$`);

/**
 * Frase fija de pie de extracto Santander real ("El saldo informado no
 * incluye movimientos en tránsito.") — no es una cláusula label+monto, es
 * una oración de aviso sin número asociado. Se descarta aparte, antes del
 * pase de cláusulas, porque el patrón label+monto no la cubre.
 */
const KNOWN_FOOTER_SENTENCE_RE =
  /el\s+saldo\s+informado\s+no\s+incluye\s+movimientos?\s+en\s+tr[aá]nsito\.?/gi;

function moneyEquals(a: string | null, b: string | null): boolean {
  if (a == null || b == null) return false;
  const na = parseUruguayMoney(a);
  const nb = parseUruguayMoney(b);
  return na != null && nb != null && na === nb;
}

/**
 * Elimina toda referencia a saldo de cuenta de un texto de movimiento
 * (descripción / raw_text / raw_description), preservando el resto del
 * contenido intacto: importe real, referencia, número de operación, nombre
 * de pagador, etc. Nunca toca importes que no estén inmediatamente
 * adyacentes a una etiqueta de saldo reconocida.
 */
export function sanitizeBankMovementDescription(text: string | null | undefined): string {
  if (!text) return "";
  // Saltos de línea / espacios múltiples se colapsan primero: el patrón de
  // saldo puede quedar partido en varias líneas del PDF ("...\nSaldo final\n5.969,41").
  let working = text.replace(/ /g, " ").replace(/\s+/g, " ").trim();
  if (!working) return "";

  working = working.replace(KNOWN_FOOTER_SENTENCE_RE, " ").replace(/\s+/g, " ").trim();
  if (!working) return "";

  const matches = [...working.matchAll(BALANCE_CLAUSE_RE)];
  if (matches.length === 0) return working;

  // De atrás para adelante: recortar no debe invalidar los índices de los
  // matches que todavía quedan por procesar.
  for (let i = matches.length - 1; i >= 0; i--) {
    const match = matches[i]!;
    const clauseStart = match.index!;
    const clauseEnd = clauseStart + match[0].length;
    const trailingMoney = match[1] ?? null;

    let removeStart = clauseStart;

    const before = working.slice(0, clauseStart);
    const precedingMatch = TRAILING_MONEY_RE.exec(before);
    if (precedingMatch) {
      const precedingMoney = precedingMatch[1]!;
      // Con valor final presente: solo se descarta el precedente si es el
      // MISMO saldo duplicado (p.ej. "122,00 5.969,41 Saldo final 5.969,41" —
      // el "122,00" real del movimiento debe sobrevivir). Sin valor final
      // (etiqueta sola u orden alterado por OCR): el precedente es el saldo.
      const shouldRemovePreceding = trailingMoney
        ? moneyEquals(precedingMoney, trailingMoney)
        : true;
      if (shouldRemovePreceding) {
        removeStart = clauseStart - precedingMatch[0].length;
      }
    }

    working = `${working.slice(0, removeStart)} ${working.slice(clauseEnd)}`;
  }

  return working.replace(/\s+/g, " ").trim();
}
