import { describe, expect, it } from "vitest";

import {
  ADMIN_LANDING_PATH,
  NO_ACCESS_LANDING_PATH,
  OPERATIONAL_LANDING_PATH,
  getDefaultLandingForUser,
} from "@/lib/auth/default-landing";

describe("getDefaultLandingForUser", () => {
  it("superadmin siempre aterriza en /copilot/hoy, sin importar permisos", () => {
    expect(getDefaultLandingForUser("superadmin", {})).toBe(ADMIN_LANDING_PATH);
    expect(getDefaultLandingForUser("superadmin", { hoy: "none" })).toBe(ADMIN_LANDING_PATH);
  });

  it("usuario con daily_tasks aterriza en /copilot/tareas-diarias", () => {
    const perms = { hoy: "none", daily_tasks: "write" };
    expect(getDefaultLandingForUser("usuario", perms)).toBe(OPERATIONAL_LANDING_PATH);
  });

  it("Daniel (admin) prefiere Hoy aunque también tenga daily_tasks", () => {
    const perms = { hoy: "admin", daily_tasks: "admin" };
    expect(getDefaultLandingForUser("superadmin", perms)).toBe(ADMIN_LANDING_PATH);
  });

  it("sin daily_tasks cae al primer módulo permitido del orden de fallback", () => {
    const perms = { daily_tasks: "none", clientes: "none", cartera: "read" };
    expect(getDefaultLandingForUser("usuario", perms)).toBe("/copilot/cartera");
  });

  it("access_level 'read'/'write'/'admin' cuentan como acceso; 'none' no", () => {
    expect(getDefaultLandingForUser("usuario", { daily_tasks: "read" })).toBe(
      OPERATIONAL_LANDING_PATH
    );
    expect(getDefaultLandingForUser("usuario", { daily_tasks: "none" })).not.toBe(
      OPERATIONAL_LANDING_PATH
    );
  });

  it("sin ningún módulo del fallback accesible → /copilot/alertas (sin gate, nunca hace loop)", () => {
    const perms = {
      daily_tasks: "none",
      clientes: "none",
      cartera: "none",
      bank_movements: "none",
      tesoreria: "none",
      finanzas: "none",
      reportes: "none",
    };
    expect(getDefaultLandingForUser("usuario", perms)).toBe(NO_ACCESS_LANDING_PATH);
    expect(NO_ACCESS_LANDING_PATH).toBe("/copilot/alertas");
  });

  it("mapa de permisos vacío (no cargado) nunca manda a un módulo inexistente", () => {
    expect(getDefaultLandingForUser("usuario", {})).toBe(NO_ACCESS_LANDING_PATH);
  });

  it("respeta el orden de fallback: daily_tasks antes que clientes", () => {
    const perms = { daily_tasks: "write", clientes: "read" };
    expect(getDefaultLandingForUser("usuario", perms)).toBe(OPERATIONAL_LANDING_PATH);
  });

  it("usuario con solo bank_movements aterriza en Banco", () => {
    const perms = {
      daily_tasks: "none",
      clientes: "none",
      cartera: "none",
      bank_movements: "write",
    };
    expect(getDefaultLandingForUser("tesoreria", perms)).toBe("/copilot/movimientos-bancarios");
  });
});
