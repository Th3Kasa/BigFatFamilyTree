"use client";

import { createContext, useCallback, useContext, useMemo } from "react";

/** Who the signed-in member may edit: everyone (admins) or a list of person ids (editors' close family). */
export type EditableScope = "all" | readonly string[];

type RoleState = { role?: string; editable: EditableScope; userId?: string };

const RoleContext = createContext<RoleState>({ editable: [] });

/**
 * The signed-in member's role ("admin" | "editor" | "viewer") and which people
 * they may edit, for client UI that shows or hides editing controls. Mounted by
 * AppShell. The database (RLS, can_edit_person) still enforces every write; this
 * only decides what we offer.
 */
export function RoleProvider({
  role,
  editable = [],
  userId,
  children,
}: {
  role?: string;
  editable?: EditableScope;
  /** The signed-in account id: editors may delete only people they added. */
  userId?: string;
  children: React.ReactNode;
}) {
  const value = useMemo(() => ({ role, editable, userId }), [role, editable, userId]);
  return <RoleContext.Provider value={value}>{children}</RoleContext.Provider>;
}

export function useRole(): {
  role: string | undefined;
  /** May add people and edit someone (editors and admins). */
  canEdit: boolean;
  isAdmin: boolean;
  /** May edit this particular person (admins: anyone; editors: their close family and people they added). */
  canEditPerson: (personId: string | null | undefined) => boolean;
  /** May delete this person (admins: anyone; editors: people they added themselves). The database has the final say. */
  canDeletePerson: (person: { id: string; created_by?: string | null } | null | undefined) => boolean;
} {
  const { role, editable, userId } = useContext(RoleContext);
  const canEdit = role === "admin" || role === "editor";
  const ids = useMemo(() => (editable === "all" ? null : new Set(editable)), [editable]);
  const canEditPerson = useCallback(
    (personId: string | null | undefined) => canEdit && !!personId && (ids === null || ids.has(personId)),
    [canEdit, ids],
  );
  const isAdmin = role === "admin";
  const canDeletePerson = useCallback(
    (person: { id: string; created_by?: string | null } | null | undefined) =>
      !!person && (isAdmin || (canEdit && !!userId && person.created_by === userId)),
    [isAdmin, canEdit, userId],
  );
  return { role, canEdit, isAdmin, canEditPerson, canDeletePerson };
}
