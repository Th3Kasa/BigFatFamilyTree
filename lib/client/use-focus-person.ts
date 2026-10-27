import { useCallback } from "react";
import { usePathname, useRouter } from "next/navigation";
import { shell } from "@/lib/client/shell-store";

/**
 * "Show me this person on the tree." On the home page the mounted canvas pans
 * and zooms to them and selects them; anywhere else we navigate to
 * `/?focus=<id>`, which the canvas handles on load.
 */
export function useFocusPerson() {
  const router = useRouter();
  const pathname = usePathname();
  return useCallback(
    (personId: string) => {
      if (pathname === "/" && shell.requestFocus(personId)) return;
      router.push(`/?${new URLSearchParams({ focus: personId }).toString()}`);
    },
    [pathname, router],
  );
}
