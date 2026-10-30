import { describe, expect, it } from "vitest";
import {
  APPROVAL_TTL_SECONDS,
  decideAccess,
  isStaticFile,
  requiresApproval,
  signApproval,
  verifyApproval,
} from "@/lib/auth/gate";
import { isPublicPath } from "@/middleware";

const base = { search: "", isPublic: false, signedIn: true, approved: true as boolean | null };

describe("requiresApproval", () => {
  it.each(["/", "/people", "/person/abc", "/relationships", "/admin/members", "/api/other"])(
    "%s needs approval",
    (p) => expect(requiresApproval(p)).toBe(true),
  );
  it.each(["/welcome", "/login", "/update-password", "/auth/callback", "/auth/signout", "/api/auth/set-session", "/_next/data/x.json"])(
    "%s is open to unapproved users",
    (p) => expect(requiresApproval(p)).toBe(false),
  );
  it("does not treat look-alike prefixes as exempt", () => {
    expect(requiresApproval("/welcomex")).toBe(true);
    expect(requiresApproval("/authors")).toBe(true);
  });
  it("never asks about static files", () => {
    expect(requiresApproval("/logo.png")).toBe(false);
    expect(isStaticFile("/fonts/a.woff2")).toBe(true);
    expect(isStaticFile("/people")).toBe(false);
  });
});

describe("decideAccess (the middleware routing decision)", () => {
  it("sends a signed-out visitor to sign-in with the page they wanted", () => {
    expect(decideAccess({ ...base, signedIn: false, approved: null, pathname: "/people", search: "?sort=recent" })).toEqual({
      kind: "login",
      next: "/people?sort=recent",
    });
  });
  it("lets a signed-out visitor see public pages", () => {
    expect(decideAccess({ ...base, signedIn: false, approved: null, isPublic: true, pathname: "/" })).toEqual({ kind: "allow" });
  });
  it("redirects an unapproved user from any app route to /welcome", () => {
    for (const pathname of ["/", "/people", "/person/x", "/relationships", "/admin/members"]) {
      expect(decideAccess({ ...base, pathname, approved: false, isPublic: pathname === "/" })).toEqual({ kind: "welcome" });
    }
  });
  it("lets an unapproved user reach the allowed routes", () => {
    for (const pathname of ["/welcome", "/login", "/update-password", "/auth/callback", "/auth/signout", "/api/auth/set-session"]) {
      expect(decideAccess({ ...base, pathname, approved: false })).toEqual({ kind: "allow" });
    }
  });
  it("never shows an approved user the gate", () => {
    for (const pathname of ["/", "/people", "/welcome"]) {
      expect(decideAccess({ ...base, pathname, approved: true })).toEqual({ kind: "allow" });
    }
  });
  it("fails open when approval could not be determined (RLS still protects the data)", () => {
    expect(decideAccess({ ...base, pathname: "/people", approved: null })).toEqual({ kind: "allow" });
  });
});

describe("middleware matcher semantics", () => {
  it("keeps the home page public so signed-out visitors reach the landing page", () => {
    expect(isPublicPath("/")).toBe(true);
  });
  it("keeps the privacy notice public (Google's sign-in screen links to it)", () => {
    expect(isPublicPath("/privacy")).toBe(true);
    expect(isPublicPath("/privacy-anything")).toBe(false);
  });
  it("still protects app routes for signed-out visitors", () => {
    expect(isPublicPath("/people")).toBe(false);
    expect(isPublicPath("/welcome")).toBe(false);
  });
});

describe("signed approval cookie", () => {
  const secret = "service-role-key-for-tests";
  const now = Date.UTC(2026, 4, 22, 12, 0, 0);

  it("round-trips for the same user", async () => {
    const cookie = await signApproval("user-1", secret, now);
    expect(await verifyApproval(cookie, "user-1", secret, now + 1000)).toBe(true);
  });
  it("expires", async () => {
    const cookie = await signApproval("user-1", secret, now);
    expect(await verifyApproval(cookie, "user-1", secret, now + (APPROVAL_TTL_SECONDS + 1) * 1000)).toBe(false);
  });
  it("is bound to the user", async () => {
    const cookie = await signApproval("user-1", secret, now);
    expect(await verifyApproval(cookie, "user-2", secret, now)).toBe(false);
  });
  it("rejects a different secret, a tampered expiry and junk", async () => {
    const cookie = await signApproval("user-1", secret, now);
    expect(await verifyApproval(cookie, "user-1", "other-secret", now)).toBe(false);
    const [uid, , sig] = cookie.split(".");
    expect(await verifyApproval(`${uid}.${Math.floor(now / 1000) + 999999}.${sig}`, "user-1", secret, now)).toBe(false);
    for (const junk of [undefined, "", "a.b", "a.b.c.d", "user-1.notanumber.abc", "user-1.9999999999.!!!"]) {
      expect(await verifyApproval(junk, "user-1", secret, now)).toBe(false);
    }
  });
});
