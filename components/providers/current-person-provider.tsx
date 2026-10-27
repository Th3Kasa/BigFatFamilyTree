"use client";

import { createContext, useContext } from "react";
import type { CurrentPerson } from "@/lib/members/types";

const CurrentPersonContext = createContext<CurrentPerson | null>(null);

/**
 * Makes the signed-in user's own tree person available to client components
 * (the "You" badge, "Center on me", relationship-finder default, ...).
 * Mounted once in app/layout.tsx.
 */
export function CurrentPersonProvider({
  person,
  children,
}: {
  person: CurrentPerson | null;
  children: React.ReactNode;
}) {
  return <CurrentPersonContext.Provider value={person}>{children}</CurrentPersonContext.Provider>;
}

/** The signed-in user's linked person, or null when signed out / not linked yet. */
export function useCurrentPerson(): CurrentPerson | null {
  return useContext(CurrentPersonContext);
}

/** Convenience: is this person id the signed-in user? */
export function useIsCurrentPerson(personId: string | null | undefined): boolean {
  const me = useCurrentPerson();
  return !!me && !!personId && me.id === personId;
}
