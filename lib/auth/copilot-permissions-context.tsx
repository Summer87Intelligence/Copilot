"use client";

import { createContext, useContext } from "react";

export type CopilotPermissions = {
  canWrite: boolean;
  isReadOnlyDemo: boolean;
};

const defaultPermissions: CopilotPermissions = {
  canWrite: true,
  isReadOnlyDemo: false,
};

export const CopilotPermissionsContext =
  createContext<CopilotPermissions>(defaultPermissions);

export function useCopilotPermissions(): CopilotPermissions {
  return useContext(CopilotPermissionsContext);
}
