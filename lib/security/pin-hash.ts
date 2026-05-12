/**
 * SECURITY-02: hashing Argon2id para PIN + comparación constant-time de strings cortos (legacy).
 */

import { timingSafeEqual, createHash } from "node:crypto";

import argon2 from "argon2";

const ARGON2_TYPE = argon2.argon2id;
const MEMORY_COST = 65_536;
const TIME_COST = 3;
const PARALLELISM = 4;

export async function hashPin(pin: string): Promise<string> {
  return argon2.hash(pin, {
    type: ARGON2_TYPE,
    memoryCost: MEMORY_COST,
    timeCost: TIME_COST,
    parallelism: PARALLELISM,
  });
}

export async function verifyPinAgainstHash(
  pin: string,
  storedHash: string
): Promise<boolean> {
  const trimmed = storedHash.trim();
  if (!trimmed) return false;
  try {
    return await argon2.verify(trimmed, pin);
  } catch {
    return false;
  }
}

/**
 * Comparación timing-safe para PIN legacy (transición): SHA-256 fijo 32 bytes.
 */
export function safeEqualPlaintextPin(a: string, b: string): boolean {
  const da = createHash("sha256").update(a, "utf8").digest();
  const db = createHash("sha256").update(b, "utf8").digest();
  return timingSafeEqual(da, db);
}
