import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import {
  parseCopilotSessionValue,
  serializeCopilotSessionValue,
} from "@/lib/copilot-session-cookie";
import {
  COPILOT_SESSION_TEST_SIGNING_SECRET,
  CopilotSessionSigningSecretMissingError,
  requireCopilotSessionSigningSecret,
  signCopilotSessionPayload,
} from "@/lib/copilot-session-signing";

describe("copilot-session-cookie signed (Fase 5 / P1-002)", () => {
  const uid = "10000000-0000-4000-8000-000000000001";
  const cid = "20000000-0000-4000-8000-000000000002";

  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "test");
    delete process.env.COPILOT_SESSION_SIGNING_SECRET;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("cookie válida firmada → parse OK", () => {
    const raw = serializeCopilotSessionValue(uid, "owner", cid, 7);
    expect(raw).toContain(".");
    const v = parseCopilotSessionValue(raw);
    expect(v).toEqual({
      userId: uid,
      role: "owner",
      companyId: cid,
      credentialVersion: 7,
    });
  });

  it("cookie modificada role user→superadmin → inválida", () => {
    const raw = serializeCopilotSessionValue(uid, "user", cid, 1);
    const dot = raw.lastIndexOf(".");
    const payload = raw.slice(0, dot);
    const sig = raw.slice(dot + 1);
    const parts = payload.split(":");
    parts[1] = "superadmin";
    const tamperedPayload = parts.join(":");
    const tampered = `${tamperedPayload}.${sig}`;
    expect(parseCopilotSessionValue(tampered)).toBeNull();
  });

  it("cookie modificada companyId → inválida", () => {
    const raw = serializeCopilotSessionValue(uid, "owner", cid, 1);
    const dot = raw.lastIndexOf(".");
    const payload = raw.slice(0, dot);
    const sig = raw.slice(dot + 1);
    const parts = payload.split(":");
    parts[2] = "30000000-0000-4000-8000-000000000003";
    const tampered = `${parts.join(":")}.${sig}`;
    expect(parseCopilotSessionValue(tampered)).toBeNull();
  });

  it("cookie legacy sin firma → inválida", () => {
    expect(parseCopilotSessionValue(`${uid}:owner:${cid}:1`)).toBeNull();
    expect(parseCopilotSessionValue(`${uid}:owner`)).toBeNull();
    expect(parseCopilotSessionValue(`${uid}:owner:${cid}`)).toBeNull();
  });

  it("secret ausente en production → error seguro al firmar", () => {
    vi.stubEnv("NODE_ENV", "production");
    delete process.env.COPILOT_SESSION_SIGNING_SECRET;
    expect(() => requireCopilotSessionSigningSecret()).toThrow(
      CopilotSessionSigningSecretMissingError
    );
    expect(() => serializeCopilotSessionValue(uid, "owner", cid, 1)).toThrow(
      CopilotSessionSigningSecretMissingError
    );
  });

  it("parse rechaza cookie sin firma cuando production no tiene secret", () => {
    vi.stubEnv("NODE_ENV", "production");
    delete process.env.COPILOT_SESSION_SIGNING_SECRET;
    const payload = `${uid}:owner:${cid}:1`;
    const sig = signCopilotSessionPayload(payload, COPILOT_SESSION_TEST_SIGNING_SECRET);
    expect(parseCopilotSessionValue(`${payload}.${sig}`)).toBeNull();
  });

  it("usa COPILOT_SESSION_SIGNING_SECRET cuando está definido", () => {
    vi.stubEnv("COPILOT_SESSION_SIGNING_SECRET", "custom-prod-secret");
    const raw = serializeCopilotSessionValue(uid, "cobranza", cid, 2);
    expect(parseCopilotSessionValue(raw)?.role).toBe("cobranza");
  });
});
