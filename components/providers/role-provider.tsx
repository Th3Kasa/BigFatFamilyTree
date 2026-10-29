"use client";

import { createContext, useContext } from "react";

const RoleContext = createContext<string | undefined>(undefined);

/**
 * The signed-in member's role ("admin" | "editor" | "viewer"), for client UI
 * that shows or hides editing controls. Mounted by AppShell. The database
 * (RLS) still enforces every write; this only decides what we offer.
 */
export function RoleProvider({ role, children }: { role?: string; children: React.ReactNode }) {
  return <RoleContext.Provider value={role}>{children}</RoleContext.Provider>;
}

export function useRole(): { role: string | undefined; canEdit: boolean; isAdmin: boolean } {
  const role = useContext(RoleContext);
  return { role, canEdit: role === "admin" || role === "editor", isAdmin: role === "admin" };
}
