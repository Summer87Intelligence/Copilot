import { describe, expect, it } from "vitest";

import {
  DELETED_ACCOUNT_LOGIN_MESSAGE,
  INACTIVE_ACCOUNT_LOGIN_MESSAGE,
  buildDeletedEmailPlaceholder,
  buildDeletedUsernamePlaceholder,
  isAccountLoginAllowed,
  isLastActiveSuperadminGuard,
  loginBlockReason,
} from "@/lib/auth/app-user-lifecycle";

describe("app-user-lifecycle", () => {
  it("loginBlockReason — cuenta activa no bloquea", () => {
    expect(loginBlockReason({ is_active: true, deleted_at: null })).toBeNull();
    expect(isAccountLoginAllowed({ is_active: true, deleted_at: null })).toBe(true);
  });

  it("loginBlockReason — cuenta inactiva devuelve mensaje esperado", () => {
    expect(loginBlockReason({ is_active: false, deleted_at: null })).toBe(
      INACTIVE_ACCOUNT_LOGIN_MESSAGE
    );
    expect(INACTIVE_ACCOUNT_LOGIN_MESSAGE).toBe(
      "Tu cuenta está inactiva. Contactá al administrador."
    );
  });

  it("loginBlockReason — cuenta eliminada (soft delete)", () => {
    expect(
      loginBlockReason({ is_active: false, deleted_at: "2026-07-13T12:00:00.000Z" })
    ).toBe(DELETED_ACCOUNT_LOGIN_MESSAGE);
  });

  it("isLastActiveSuperadminGuard — protege al último superadmin activo", () => {
    expect(isLastActiveSuperadminGuard("superadmin", 1)).toBe(true);
    expect(isLastActiveSuperadminGuard("superadmin", 2)).toBe(false);
    expect(isLastActiveSuperadminGuard("usuario", 1)).toBe(false);
  });

  it("buildDeletedEmailPlaceholder — libera email único para nuevos usuarios", () => {
    const id = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    expect(buildDeletedEmailPlaceholder(id)).toBe(
      "deleted+aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee@removed.copilot.local"
    );
  });

  it("buildDeletedUsernamePlaceholder — username anonimizado estable", () => {
    const id = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    expect(buildDeletedUsernamePlaceholder(id)).toMatch(/^deleted_/);
  });
});
