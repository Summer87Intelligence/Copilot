"use client";

import { createContext, useContext } from "react";

export type CopilotPermissions = {
  canWrite: boolean;
  isReadOnly: boolean;
  readOnlyLabel: string | null;
};

const defaultPermissions: CopilotPermissions = {
  canWrite: true,
  isReadOnly: false,
  readOnlyLabel: null,
};

export const CopilotPermissionsContext =
  createContext<CopilotPermissions>(defaultPermissions);

export function useCopilotPermissions(): CopilotPermissions {
  return useContext(CopilotPermissionsContext);
}
