"use client";

import { useEffect } from "react";
import { shell } from "@/lib/client/shell-store";

/**
 * Tells the shell whose profile is open, so the Add menu can offer
 * "Adding to <name>". Renders nothing; clears itself when the page unmounts.
 */
export function PagePersonContext({ id, slug, name }: { id: string; slug: string | null; name: string }) {
  useEffect(() => {
    shell.setPagePerson({ id, slug, name });
    return () => shell.setPagePerson(null);
  }, [id, slug, name]);
  return null;
}
