import { describe, expect, it } from "vitest";

import {
  parseCopilotSessionValue,
  serializeCopilotSessionValue,
} from "@/lib/copilot-session-cookie";

describe("copilot-session-cookie SECURITY-02", () => {
  const uid = "10000000-0000-4000-8000-000000000001";
  const cid = "20000000-0000-4000-8000-000000000002";

  it("parses legacy 2-part with credentialVersion 1", () => {
    const v = parseCopilotSessionValue(`${uid}:owner`);
    expect(v).toEqual({
      userId: uid,
      role: "owner",
      companyId: null,
      credentialVersion: 1,
    });
  });

  it("parses legacy 3-part with credentialVersion 1", () => {
    const raw = `${uid}:owner:${cid}`;
    const v = parseCopilotSessionValue(raw);
    expect(v?.credentialVersion).toBe(1);
    expect(v?.companyId).toBe(cid);
  });

  it("roundtrips 4-part with credential version", () => {
    const raw = serializeCopilotSessionValue(uid, "owner", cid, 7);
    const v = parseCopilotSessionValue(raw);
    expect(v).toEqual({
      userId: uid,
      role: "owner",
      companyId: cid,
      credentialVersion: 7,
    });
  });

  it("rejects invalid fourth segment (non-numeric)", () => {
    const bad = `${uid}:owner:${cid}:x`;
    expect(parseCopilotSessionValue(bad)).toBeNull();
  });
});
