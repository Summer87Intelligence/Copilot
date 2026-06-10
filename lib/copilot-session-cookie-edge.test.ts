import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import { serializeCopilotSessionValue } from "@/lib/copilot-session-cookie";
import {
  isValidCopilotSessionCookieAsync,
  parseCopilotSessionValueAsync,
} from "@/lib/copilot-session-cookie-edge";
import { signCopilotSessionPayload } from "@/lib/copilot-session-signing";
import { COPILOT_SESSION_TEST_SIGNING_SECRET } from "@/lib/copilot-session-signing-secret";
import { verifyCopilotSessionSignatureEdge } from "@/lib/copilot-session-signing-edge";

describe("copilot-session-cookie Edge verifier", () => {
  const uid = "10000000-0000-4000-8000-000000000001";
  const cid = "20000000-0000-4000-8000-000000000002";

  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "test");
    delete process.env.COPILOT_SESSION_SIGNING_SECRET;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("cookie firmada con Node verifica OK en Edge verifier", async () => {
    const raw = serializeCopilotSessionValue(uid, "owner", cid, 3);
    const parsed = await parseCopilotSessionValueAsync(raw);
    expect(parsed).toEqual({
      userId: uid,
      role: "owner",
      companyId: cid,
      credentialVersion: 3,
    });
    expect(await isValidCopilotSessionCookieAsync(raw)).toBe(true);
  });

  it("payload modificado role → inválida en Edge", async () => {
    const raw = serializeCopilotSessionValue(uid, "user", cid, 1);
    const dot = raw.lastIndexOf(".");
    const payload = raw.slice(0, dot);
    const sig = raw.slice(dot + 1);
    const parts = payload.split(":");
    parts[1] = "superadmin";
    const tampered = `${parts.join(":")}.${sig}`;
    expect(await parseCopilotSessionValueAsync(tampered)).toBeNull();
  });

  it("firma inválida → inválida en Edge", async () => {
    const raw = serializeCopilotSessionValue(uid, "owner", cid, 1);
    const dot = raw.lastIndexOf(".");
    const tampered = `${raw.slice(0, dot)}.deadbeef`;
    expect(await parseCopilotSessionValueAsync(tampered)).toBeNull();
  });

  it("legacy sin firma → inválida en Edge", async () => {
    expect(await parseCopilotSessionValueAsync(`${uid}:owner:${cid}:1`)).toBeNull();
    expect(await isValidCopilotSessionCookieAsync(`${uid}:owner`)).toBe(false);
  });

  it("Node sign y Edge verifyCoinciden en hex", async () => {
    const payload = `${uid}:cobranza:${cid}:2`;
    const nodeSig = signCopilotSessionPayload(payload, COPILOT_SESSION_TEST_SIGNING_SECRET);
    const edgeOk = await verifyCopilotSessionSignatureEdge(
      payload,
      nodeSig,
      COPILOT_SESSION_TEST_SIGNING_SECRET
    );
    expect(edgeOk).toBe(true);
  });
});
