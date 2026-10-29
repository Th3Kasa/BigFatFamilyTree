// The first-time-user journey as one pure function: which screen does this
// person see, given what we know about them? Used by /welcome, the home page
// and the middleware's routing, and unit-tested without a browser or database.
//
//   signed out ──► landing ──► sign up ──► check email ──► find yourself (1)
//   request sent ─► waiting for an admin (2) ──► approved ──► tour (3) ──► app
//   request declined ─► kind message + "try again" ─► find yourself

export type RequestState = "none" | "pending" | "declined" | "cancelled" | "approved";

export type JourneyInput = {
  signedIn: boolean;
  approved: boolean;
  /** profiles.person_id is set. */
  linked: boolean;
  /** The member's most relevant link request ("pending" wins, else the latest). */
  request: RequestState;
  /** profiles.onboarded_at is set (they already saw the tour). */
  onboarded: boolean;
};

export type JourneyScreen =
  | "landing" // signed out
  | "find" // step 1: search for yourself (also after a cancel)
  | "pending" // step 2: request sent, waiting for an admin
  | "declined" // an admin said no: kind message + try again
  | "tour" // step 3: approved and linked, first visit: send to /?tour=1
  | "app"; // approved, nothing special

export function journeyScreen(i: JourneyInput): JourneyScreen {
  if (!i.signedIn) return "landing";
  if (!i.approved) {
    if (i.request === "pending") return "pending";
    if (i.request === "declined") return "declined";
    return "find";
  }
  if (i.linked && !i.onboarded) return "tour";
  return "app";
}

/** Which of the three progress dots is current: Find yourself, Admin confirms, Explore. */
export function journeyStep(screen: JourneyScreen): 1 | 2 | 3 {
  if (screen === "pending") return 2;
  if (screen === "tour" || screen === "app") return 3;
  return 1;
}

/** The most relevant request for the screens: a pending one wins, otherwise the newest. */
export function latestRequestState(
  requests: ReadonlyArray<{ status: string; created_at: string }>,
): RequestState {
  if (requests.some((r) => r.status === "pending")) return "pending";
  const newest = [...requests].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  if (!newest) return "none";
  return newest.status === "declined" || newest.status === "cancelled" || newest.status === "approved"
    ? newest.status
    : "none";
}

// ── the home page ───────────────────────────────────────────────────────────

export type HomeParams = {
  from?: string | string[];
  to?: string | string[];
  focus?: string | string[];
  tour?: string | string[];
};

const DEEP_LINK_KEYS = ["from", "to", "focus", "tour"] as const;

/** `/?from=…&to=…` (and focus / tour) are deep links into the tree. */
export function deepLinkSearch(params: HomeParams): string {
  const qs = new URLSearchParams();
  for (const key of DEEP_LINK_KEYS) {
    const v = params[key];
    const first = Array.isArray(v) ? v[0] : v;
    if (typeof first === "string" && first.length > 0 && first.length <= 200) qs.set(key, first);
  }
  return qs.toString();
}

export type HomeEntry =
  | { kind: "landing" } // render the warm landing page: NO data queries
  | { kind: "login"; next: string } // signed-out deep link: sign in first
  | { kind: "app" }; // signed in: render the tree (RLS decides what they can read)

export function homeEntry(input: { signedIn: boolean; params: HomeParams }): HomeEntry {
  if (input.signedIn) return { kind: "app" };
  const search = deepLinkSearch(input.params);
  if (search) return { kind: "login", next: `/?${search}` };
  return { kind: "landing" };
}

/**
 * First visit after approval: an approved, linked member who has not seen the
 * tour goes to /?tour=1 once. Arriving WITH ?tour=1 is the moment to stamp
 * onboarded_at instead.
 */
export function firstVisitAction(i: {
  approved: boolean;
  linked: boolean;
  onboarded: boolean;
  hasTourParam: boolean;
}): "redirect-to-tour" | "mark-onboarded" | "none" {
  if (!i.approved || !i.linked || i.onboarded) return "none";
  return i.hasTourParam ? "mark-onboarded" : "redirect-to-tour";
}
