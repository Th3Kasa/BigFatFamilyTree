import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  deepLinkSearch,
  firstVisitAction,
  homeEntry,
  journeyScreen,
  journeyStep,
  latestRequestState,
  type JourneyInput,
} from "@/lib/members/journey";
import { buildChecklist, progressLabel } from "@/lib/members/checklist";

const signedOut: JourneyInput = { signedIn: false, approved: false, linked: false, request: "none", onboarded: false };
const newcomer: JourneyInput = { ...signedOut, signedIn: true };

describe("journeyScreen: which screen does this person see?", () => {
  it("signed out -> landing", () => expect(journeyScreen(signedOut)).toBe("landing"));

  it("signed in, no request yet -> find yourself", () => expect(journeyScreen(newcomer)).toBe("find"));
  it("a cancelled request goes back to find yourself", () =>
    expect(journeyScreen({ ...newcomer, request: "cancelled" })).toBe("find"));
  it("request sent -> waiting for an admin", () => expect(journeyScreen({ ...newcomer, request: "pending" })).toBe("pending"));
  it("request declined -> kind message + try again", () =>
    expect(journeyScreen({ ...newcomer, request: "declined" })).toBe("declined"));

  it("approved and linked, tour not seen -> tour (once)", () =>
    expect(journeyScreen({ ...newcomer, approved: true, linked: true, request: "approved" })).toBe("tour"));
  it("approved and linked, tour seen -> app", () =>
    expect(journeyScreen({ ...newcomer, approved: true, linked: true, onboarded: true })).toBe("app"));
  it("approved without a link (let in without linking) goes straight to the app", () =>
    expect(journeyScreen({ ...newcomer, approved: true, linked: false })).toBe("app"));
  it("an approved member never sees the gate screens, whatever old requests say", () => {
    for (const request of ["none", "pending", "declined", "cancelled", "approved"] as const) {
      expect(["app", "tour"]).toContain(journeyScreen({ ...newcomer, approved: true, request }));
    }
  });

  it("progress dots: find 1, waiting 2, explore 3", () => {
    expect(journeyStep("landing")).toBe(1);
    expect(journeyStep("find")).toBe(1);
    expect(journeyStep("declined")).toBe(1);
    expect(journeyStep("pending")).toBe(2);
    expect(journeyStep("tour")).toBe(3);
    expect(journeyStep("app")).toBe(3);
  });
});

describe("latestRequestState", () => {
  it("is 'none' with no requests", () => expect(latestRequestState([])).toBe("none"));
  it("a pending request wins over everything", () =>
    expect(
      latestRequestState([
        { status: "declined", created_at: "2026-05-02" },
        { status: "pending", created_at: "2026-05-01" },
      ]),
    ).toBe("pending"));
  it("otherwise the newest one decides", () =>
    expect(
      latestRequestState([
        { status: "cancelled", created_at: "2026-05-01" },
        { status: "declined", created_at: "2026-05-03" },
      ]),
    ).toBe("declined"));
});

describe("home page entry (landing page makes no data queries)", () => {
  it("signed out with no deep link -> landing", () =>
    expect(homeEntry({ signedIn: false, params: {} })).toEqual({ kind: "landing" }));
  it("ignores unrelated or empty params", () => {
    expect(homeEntry({ signedIn: false, params: { from: "", to: "" } })).toEqual({ kind: "landing" });
  });
  it("signed-out ?from=&to= goes to /login?next=", () => {
    const entry = homeEntry({ signedIn: false, params: { from: "a", to: "b" } });
    expect(entry).toEqual({ kind: "login", next: "/?from=a&to=b" });
  });
  it("focus and tour deep links also sign in first", () => {
    expect(homeEntry({ signedIn: false, params: { focus: "x" } })).toEqual({ kind: "login", next: "/?focus=x" });
    expect(homeEntry({ signedIn: false, params: { tour: "1" } })).toEqual({ kind: "login", next: "/?tour=1" });
  });
  it("takes the first value of a repeated param and caps absurd lengths", () => {
    expect(deepLinkSearch({ from: ["a", "b"] })).toBe("from=a");
    expect(deepLinkSearch({ from: "x".repeat(500) })).toBe("");
  });
  it("signed in -> the app (RLS decides what is readable)", () =>
    expect(homeEntry({ signedIn: true, params: { from: "a" } })).toEqual({ kind: "app" }));
});

describe("app/page.tsx stays free of family data for guests", () => {
  const src = readFileSync(path.resolve(__dirname, "../../app/page.tsx"), "utf8");
  const landing = readFileSync(path.resolve(__dirname, "../../components/landing/Landing.tsx"), "utf8");

  it("does not use the service-role client at all", () => {
    expect(src).not.toMatch(/createServiceClient|supabase\/service/);
  });
  it("returns the landing page before any people/relationships query", () => {
    const landingAt = src.indexOf("<Landing");
    const firstQuery = src.search(/\.from\(["']people["']\)/);
    expect(landingAt).toBeGreaterThan(-1);
    expect(firstQuery).toBeGreaterThan(landingAt);
  });
  it("the landing component imports no data layer", () => {
    expect(landing).not.toMatch(/supabase|from\(["']|createClient/);
  });
});

describe("first visit after approval", () => {
  const ready = { approved: true, linked: true, onboarded: false };
  it("redirects to the tour once", () => expect(firstVisitAction({ ...ready, hasTourParam: false })).toBe("redirect-to-tour"));
  it("stamps onboarded_at when they arrive on /?tour=1", () =>
    expect(firstVisitAction({ ...ready, hasTourParam: true })).toBe("mark-onboarded"));
  it("does nothing once onboarded", () => expect(firstVisitAction({ ...ready, onboarded: true, hasTourParam: false })).toBe("none"));
  it("does nothing for unlinked or unapproved accounts", () => {
    expect(firstVisitAction({ ...ready, linked: false, hasTourParam: false })).toBe("none");
    expect(firstVisitAction({ ...ready, approved: false, hasTourParam: false })).toBe("none");
  });
});

describe("profile checklist", () => {
  const facts = {
    personRef: "omar-haddad",
    canEdit: true,
    hasPhoto: false,
    hasBirthDate: true,
    hasParents: false,
    hasMemory: false,
    invitedRelative: false,
  };
  it("counts what is done", () => {
    const c = buildChecklist(facts);
    expect(c.total).toBe(5);
    expect(c.done).toBe(1);
    expect(c.items.map((i) => i.key)).toEqual(["photo", "birthday", "parents", "memory", "invite"]);
    expect(progressLabel(c.done, c.total, "en")).toBe("1 of 5 done");
    expect(progressLabel(c.done, c.total, "ar")).toBe("1 من 5");
  });
  it("done items have no button", () => {
    const c = buildChecklist({ ...facts, hasPhoto: true });
    expect(c.items[0]).toMatchObject({ done: true, href: null, action: null });
  });
  it("editors edit their profile; viewers suggest parents or ask an admin", () => {
    const editor = buildChecklist(facts);
    expect(editor.items[0].href).toBe("/person/omar-haddad/edit");
    expect(editor.items[2].href).toBe("/person/omar-haddad/edit");
    const viewer = buildChecklist({ ...facts, canEdit: false });
    expect(viewer.items[0].href).toBeNull();
    expect(viewer.items[2].href).toBe("/welcome#suggest");
  });
  it("is 5 of 5 when everything is done", () => {
    const c = buildChecklist({ ...facts, hasPhoto: true, hasParents: true, hasMemory: true, invitedRelative: true });
    expect(c.done).toBe(5);
  });
});
