"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { HEARTBEAT_INTERVAL_MS } from "@/lib/presence/rules";

/**
 * Tells the server "still here, on this page" about once a minute while the
 * tab is visible, so admins can see who is on the site (/admin/live). Sends
 * only the bare pathname. Hidden tabs go quiet and drop off within minutes.
 * Renders nothing; failures are ignored.
 */
export function PresenceHeartbeat() {
  const pathname = usePathname();

  useEffect(() => {
    const send = () => {
      if (document.visibilityState !== "visible") return;
      void fetch("/api/presence", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ path: pathname }),
        keepalive: true,
      }).catch(() => {});
    };

    send();
    const timer = window.setInterval(send, HEARTBEAT_INTERVAL_MS);
    document.addEventListener("visibilitychange", send);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", send);
    };
    // Re-run on every page change, so the new page is reported at once.
  }, [pathname]);

  return null;
}
