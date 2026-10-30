import { CheckCircle2, CloudOff, HardDrive, TriangleAlert } from "lucide-react";
import { driveStatus } from "@/lib/drive/client";
import { disconnectDrive } from "@/lib/actions/drive";

const NOTICES: Record<string, { ok: boolean; text: string }> = {
  connected: { ok: true, text: "Google Drive is connected. Family members can now post photos." },
  cancelled: { ok: false, text: "Connecting was cancelled. Nothing changed." },
  expired: { ok: false, text: "That sign-in took too long. Please press Connect again." },
  forbidden: { ok: false, text: "Only admins can connect Google Drive." },
  "not-configured": { ok: false, text: "Drive isn't set up on the server yet (see the setup steps below)." },
  "missing-permission": { ok: false, text: "Google didn't give the Drive permission. Press Connect again and tick the Drive box." },
  failed: { ok: false, text: "Couldn't connect to Google Drive. Please try again." },
  "bad-client": {
    ok: false,
    text: "Google rejected the Client ID or Client secret. In Vercel, re-copy GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET from the same Google client (Google Auth Platform → Clients), redeploy, then connect again.",
  },
  "redirect-mismatch": {
    ok: false,
    text: "Google doesn't recognise this site's return address. In Google Auth Platform → Clients → your web client, add https://www.bigfatfamilytree.com.au/api/drive/callback under Authorised redirect URIs.",
  },
  "api-disabled": {
    ok: false,
    text: "The Google Drive API isn't switched on. In Google Cloud → APIs and services → Library, open Google Drive API and press Enable, wait a minute, then connect again.",
  },
  "bad-key": {
    ok: false,
    text: "DRIVE_TOKEN_KEY in Vercel isn't a valid key. Make a new one (32 random bytes, base64), save it in Vercel, redeploy, then connect again.",
  },
};

/**
 * Admin page card: where timeline photos are stored. Only an admin connects
 * the family's Google Drive, once; members never sign in to Google.
 */
export async function DriveCard({ notice }: { notice?: string }) {
  const status = await driveStatus();
  const n = notice ? NOTICES[notice] : undefined;
  const button =
    "inline-flex min-h-11 items-center rounded-full px-5 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2";

  return (
    <section aria-labelledby="drive-title" className="mb-8 rounded-[20px] border border-[var(--border)] bg-[var(--card)] p-5">
      <div className="flex items-start gap-3">
        <HardDrive className="mt-0.5 h-5 w-5 shrink-0 text-[var(--muted-foreground)]" aria-hidden />
        <div className="min-w-0 flex-1">
          <h2 id="drive-title" className="text-[17px] font-bold text-[var(--foreground)]">
            Photo storage: Google Drive
          </h2>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            Timeline photos are saved in a &ldquo;Big Fat Family Tree&rdquo; folder in the connected Google account. The site can only see that folder,
            and photos are never shared publicly. Family members don&apos;t need to do anything.
          </p>

          {n && (
            <p role="status" className={`mt-3 rounded-xl px-3 py-2 text-sm font-semibold ${n.ok ? "bg-[#E3EEDF] text-[#2F5A27]" : "bg-[var(--primary-soft)] text-[var(--primary)]"}`}>
              {n.text}
            </p>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-3">
            {status.state === "connected" && (
              <p className="flex items-center gap-2 text-sm font-semibold text-[#2F5A27]">
                <CheckCircle2 className="h-5 w-5" aria-hidden />
                Connected{status.email ? ` as ${status.email}` : ""}
              </p>
            )}
            {status.state === "broken" && (
              <p className="flex items-center gap-2 text-sm font-semibold text-[var(--destructive)]">
                <TriangleAlert className="h-5 w-5" aria-hidden />
                {status.message}
              </p>
            )}
            {status.state === "not-connected" && (
              <p className="flex items-center gap-2 text-sm font-semibold text-[var(--muted-foreground)]">
                <CloudOff className="h-5 w-5" aria-hidden />
                Not connected. Members can post stories and videos; photo uploads are off.
              </p>
            )}
            {status.state === "not-configured" && (
              <p className="text-sm text-[var(--muted-foreground)]">
                Add GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and DRIVE_TOKEN_KEY to the server&apos;s environment, then come back here to connect.
              </p>
            )}
          </div>

          {status.state !== "not-configured" && (
            <div className="mt-4 flex flex-wrap gap-2">
              {/* A plain link: the browser must leave the site for Google's sign-in page. */}
              <a href="/api/drive/connect" className={`${button} bg-[var(--primary)] text-[var(--primary-foreground)] hover:bg-[var(--primary-hover)]`}>
                {status.state === "connected" ? "Reconnect Google Drive" : status.state === "broken" ? "Reconnect Google Drive" : "Connect Google Drive"}
              </a>
              {(status.state === "connected" || status.state === "broken") && (
                <form action={disconnectDrive}>
                  <button type="submit" className={`${button} border border-[var(--border-strong)] bg-[var(--card)] text-[var(--foreground)] hover:bg-[var(--muted)]`}>
                    Disconnect
                  </button>
                </form>
              )}
            </div>
          )}
          {(status.state === "connected" || status.state === "broken") && (
            <p className="mt-2 text-xs text-[var(--muted-foreground)]">
              Disconnecting turns photo uploads off and hides existing photos until you reconnect the same Google account. The files stay in the Drive.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
