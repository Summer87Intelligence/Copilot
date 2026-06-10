/**
 * Firma HMAC-SHA256 para cookie — Edge Runtime (Web Crypto only).
 */

function hexToBytes(hex: string): Uint8Array | null {
  if (hex.length % 2 !== 0) return null;
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    const byte = Number.parseInt(hex.slice(i, i + 2), 16);
    if (Number.isNaN(byte)) return null;
    bytes[i / 2] = byte;
  }
  return bytes;
}

function bytesToHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function importHmacKey(secret: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  return crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

/** Firma payload (tests / paridad con Node). */
export async function signCopilotSessionPayloadEdge(
  payload: string,
  secret: string
): Promise<string> {
  const key = await importHmacKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return bytesToHex(sig);
}

export async function verifyCopilotSessionSignatureEdge(
  payload: string,
  signatureHex: string,
  secret: string
): Promise<boolean> {
  if (!signatureHex || !/^[0-9a-f]+$/i.test(signatureHex)) return false;
  try {
    const key = await importHmacKey(secret);
    const sigBytes = hexToBytes(signatureHex);
    if (!sigBytes) return false;
    const sigBuffer = new ArrayBuffer(sigBytes.length);
    new Uint8Array(sigBuffer).set(sigBytes);
    return crypto.subtle.verify(
      "HMAC",
      key,
      sigBuffer,
      new TextEncoder().encode(payload)
    );
  } catch {
    return false;
  }
}
