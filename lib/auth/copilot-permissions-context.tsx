"use client";

import { createContext, useContext } from "react";

export type CopilotPermissions = {
  canWrite: boolean;
  isReadOnly: boolean;
  readOnlyLabel: string | null;
  /** Mapa module_key → access_level efectivo del usuario actual. {} = no cargado aún. */
  modulePermissions: Record<string, string>;
};

const defaultPermissions: CopilotPermissions = {
  canWrite: true,
  isReadOnly: false,
  readOnlyLabel: null,
  modulePermissions: {},
};

export const CopilotPermissionsContext =
  createContext<CopilotPermissions>(defaultPermissions);

export function useCopilotPermissions(): CopilotPermissions {
  return useContext(CopilotPermissionsContext);
}
