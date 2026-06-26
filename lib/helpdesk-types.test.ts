import { describe, expect, it } from "vitest";
import {
  isValidTicketType,
  isValidPriority,
  isValidStatus,
  isValidModuleKey,
  HELPDESK_TICKET_TYPES,
  HELPDESK_PRIORITIES,
  HELPDESK_STATUSES,
  HELPDESK_MODULE_KEYS,
  HELPDESK_STATUS_LABELS,
  HELPDESK_PRIORITY_LABELS,
  HELPDESK_TICKET_TYPE_LABELS,
  HELPDESK_MODULE_KEY_LABELS,
} from "./helpdesk-types";

describe("isValidTicketType", () => {
  it("accepts valid types", () => {
    for (const t of HELPDESK_TICKET_TYPES) {
      expect(isValidTicketType(t)).toBe(true);
    }
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

describe("label coverage", () => {
  it("every ticket type has a label", () => {
    for (const t of HELPDESK_TICKET_TYPES) {
      expect(HELPDESK_TICKET_TYPE_LABELS[t]).toBeTruthy();
    }
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
});

describe("priority ordering", () => {
  it("priorities are ordered low, medium, high", () => {
    expect(HELPDESK_PRIORITIES).toEqual(["low", "medium", "high"]);
  });
});
