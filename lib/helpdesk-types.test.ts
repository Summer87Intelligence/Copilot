import { describe, expect, it } from "vitest";
import {
  isValidTicketType,
  isValidPriority,
  isValidStatus,
  isValidModuleKey,
  getHelpdeskModuleRoute,
  HELPDESK_TICKET_TYPES,
  HELPDESK_PRIORITIES,
  HELPDESK_STATUSES,
  HELPDESK_MODULE_KEYS,
  HELPDESK_STATUS_LABELS,
  HELPDESK_PRIORITY_LABELS,
  HELPDESK_TICKET_TYPE_LABELS,
  HELPDESK_MODULE_KEY_LABELS,
  type HelpdeskTicket,
} from "./helpdesk-types";

describe("isValidTicketType", () => {
  it("accepts valid types", () => {
    for (const t of HELPDESK_TICKET_TYPES) {
      expect(isValidTicketType(t)).toBe(true);
    }
  });
  it("accepts feature type", () => {
    expect(isValidTicketType("feature")).toBe(true);
  });
  it("rejects invalid values", () => {
    expect(isValidTicketType("invalid")).toBe(false);
    expect(isValidTicketType(null)).toBe(false);
    expect(isValidTicketType(undefined)).toBe(false);
    expect(isValidTicketType(123)).toBe(false);
  });
});

describe("isValidPriority", () => {
  it("accepts valid priorities", () => {
    for (const p of HELPDESK_PRIORITIES) {
      expect(isValidPriority(p)).toBe(true);
    }
  });
  it("rejects invalid values", () => {
    expect(isValidPriority("critical")).toBe(false);
    expect(isValidPriority("")).toBe(false);
    expect(isValidPriority(null)).toBe(false);
  });
});

describe("isValidStatus", () => {
  it("accepts all defined statuses", () => {
    for (const s of HELPDESK_STATUSES) {
      expect(isValidStatus(s)).toBe(true);
    }
  });
  it("accepts planned status", () => {
    expect(isValidStatus("planned")).toBe(true);
  });
  it("accepts published status", () => {
    expect(isValidStatus("published")).toBe(true);
  });
  it("rejects invalid status values", () => {
    expect(isValidStatus("open")).toBe(false);
    expect(isValidStatus("closed")).toBe(false);
    expect(isValidStatus("")).toBe(false);
    expect(isValidStatus(null)).toBe(false);
  });
});

describe("isValidModuleKey", () => {
  it("accepts all defined module keys", () => {
    for (const m of HELPDESK_MODULE_KEYS) {
      expect(isValidModuleKey(m)).toBe(true);
    }
  });
  it("rejects unknown module keys", () => {
    expect(isValidModuleKey("unknown_module")).toBe(false);
    expect(isValidModuleKey("")).toBe(false);
    expect(isValidModuleKey(null)).toBe(false);
  });
});

describe("getHelpdeskModuleRoute", () => {
  it("returns route for known module keys", () => {
    expect(getHelpdeskModuleRoute("cobranza")).toBe("/copilot/cobranza");
    expect(getHelpdeskModuleRoute("tesoreria")).toBe("/copilot/tesoreria");
    expect(getHelpdeskModuleRoute("hoy")).toBe("/copilot/hoy");
  });
  it("returns null for 'other' (no route)", () => {
    expect(getHelpdeskModuleRoute("other")).toBeNull();
  });
  it("returns null for null or undefined", () => {
    expect(getHelpdeskModuleRoute(null)).toBeNull();
    expect(getHelpdeskModuleRoute(undefined)).toBeNull();
  });
});

describe("label coverage", () => {
  it("every ticket type has a label", () => {
    for (const t of HELPDESK_TICKET_TYPES) {
      expect(HELPDESK_TICKET_TYPE_LABELS[t]).toBeTruthy();
    }
  });
  it("feature type has label 'Nueva funcionalidad'", () => {
    expect(HELPDESK_TICKET_TYPE_LABELS["feature"]).toBe("Nueva funcionalidad");
  });

  it("every priority has a label", () => {
    for (const p of HELPDESK_PRIORITIES) {
      expect(HELPDESK_PRIORITY_LABELS[p]).toBeTruthy();
    }
  });

  it("every status has a label", () => {
    for (const s of HELPDESK_STATUSES) {
      expect(HELPDESK_STATUS_LABELS[s]).toBeTruthy();
    }
  });
  it("planned status has label 'Planificado'", () => {
    expect(HELPDESK_STATUS_LABELS["planned"]).toBe("Planificado");
  });
  it("published status has label 'Publicado'", () => {
    expect(HELPDESK_STATUS_LABELS["published"]).toBe("Publicado");
  });

  it("every module key has a label", () => {
    for (const m of HELPDESK_MODULE_KEYS) {
      expect(HELPDESK_MODULE_KEY_LABELS[m]).toBeTruthy();
    }
  });
});

describe("status semantics", () => {
  it("new is the default status", () => {
    expect(HELPDESK_STATUSES[0]).toBe("new");
  });

  it("resolved and rejected are terminal states", () => {
    expect(HELPDESK_STATUSES).toContain("resolved");
    expect(HELPDESK_STATUSES).toContain("rejected");
  });

  it("planned and published are product lifecycle states", () => {
    expect(HELPDESK_STATUSES).toContain("planned");
    expect(HELPDESK_STATUSES).toContain("published");
  });
});

describe("priority ordering", () => {
  it("priorities are ordered low, medium, high", () => {
    expect(HELPDESK_PRIORITIES).toEqual(["low", "medium", "high"]);
  });
});

describe("HelpdeskTicket.resolution_note", () => {
  it("resolution_note can be null", () => {
    const ticket: Partial<HelpdeskTicket> = { resolution_note: null };
    expect(ticket.resolution_note).toBeNull();
  });
  it("resolution_note can be a string", () => {
    const ticket: Partial<HelpdeskTicket> = { resolution_note: "Publicado en v1.2.0." };
    expect(typeof ticket.resolution_note).toBe("string");
  });
});
