import { describe, expect, it } from "vitest";

import {
  canRead,
  canWrite,
  isReadOnlyRole,
  isSuperAdmin,
  ROLE_DEMO_READONLY,
  ROLE_SUPERADMIN,
  ROLE_USUARIO,
} from "@/lib/auth/permissions";

describe("permissions", () => {
  describe("isSuperAdmin", () => {
    it("devuelve true para superadmin", () => {
      expect(isSuperAdmin("superadmin")).toBe(true);
    });
    it("es case-insensitive", () => {
      expect(isSuperAdmin("SUPERADMIN")).toBe(true);
      expect(isSuperAdmin("SuperAdmin")).toBe(true);
    });
    it("devuelve false para otros roles", () => {
      expect(isSuperAdmin("demo_readonly")).toBe(false);
      expect(isSuperAdmin("admin")).toBe(false);
      expect(isSuperAdmin("user")).toBe(false);
      expect(isSuperAdmin("")).toBe(false);
    });
  });

  describe("isReadOnlyRole", () => {
    it("devuelve true para demo_readonly", () => {
      expect(isReadOnlyRole("demo_readonly")).toBe(true);
      expect(isReadOnlyRole(ROLE_DEMO_READONLY)).toBe(true);
    });
    it("no trata usuario como read-only global (RBAC por módulo)", () => {
      expect(isReadOnlyRole("usuario")).toBe(false);
      expect(isReadOnlyRole(ROLE_USUARIO)).toBe(false);
      expect(isReadOnlyRole("USUARIO")).toBe(false);
    });
    it("es case-insensitive para demo_readonly", () => {
      expect(isReadOnlyRole("DEMO_READONLY")).toBe(true);
    });
    it("devuelve false para otros roles", () => {
      expect(isReadOnlyRole("superadmin")).toBe(false);
      expect(isReadOnlyRole("admin")).toBe(false);
      expect(isReadOnlyRole("user")).toBe(false);
      expect(isReadOnlyRole("")).toBe(false);
    });
  });

  describe("canWrite", () => {
    it("permite escritura solo a superadmin", () => {
      expect(canWrite(ROLE_SUPERADMIN)).toBe(true);
      expect(canWrite("superadmin")).toBe(true);
    });
    it("niega escritura a demo_readonly", () => {
      expect(canWrite(ROLE_DEMO_READONLY)).toBe(false);
      expect(canWrite("demo_readonly")).toBe(false);
    });
    it("niega escritura a usuario", () => {
      expect(canWrite(ROLE_USUARIO)).toBe(false);
      expect(canWrite("usuario")).toBe(false);
    });
    it("niega escritura a cualquier otro rol", () => {
      expect(canWrite("admin")).toBe(false);
      expect(canWrite("user")).toBe(false);
      expect(canWrite("member")).toBe(false);
      expect(canWrite("")).toBe(false);
      expect(canWrite("unknown_role")).toBe(false);
    });
  });

  describe("canRead", () => {
    it("permite lectura a cualquier rol autenticado", () => {
      expect(canRead(ROLE_SUPERADMIN)).toBe(true);
      expect(canRead(ROLE_DEMO_READONLY)).toBe(true);
      expect(canRead(ROLE_USUARIO)).toBe(true);
      expect(canRead("admin")).toBe(true);
      expect(canRead("user")).toBe(true);
      expect(canRead("")).toBe(true);
    });
  });

  describe("invariants", () => {
    it("superadmin no es readonly", () => {
      expect(isReadOnlyRole(ROLE_SUPERADMIN)).toBe(false);
    });
    it("demo_readonly no puede escribir", () => {
      expect(canWrite(ROLE_DEMO_READONLY)).toBe(false);
    });
    it("demo_readonly puede leer", () => {
      expect(canRead(ROLE_DEMO_READONLY)).toBe(true);
    });
    it("usuario no puede escribir", () => {
      expect(canWrite(ROLE_USUARIO)).toBe(false);
    });
    it("usuario puede leer", () => {
      expect(canRead(ROLE_USUARIO)).toBe(true);
    });
    it("usuario no es read-only global; escritura se decide por módulo", () => {
      expect(isReadOnlyRole(ROLE_USUARIO)).toBe(false);
    });
  });
});
