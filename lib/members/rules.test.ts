import { describe, expect, it } from "vitest";
import {
  canTransitionRequest,
  guardProfileUpdate,
  roleLabel,
  wouldRemoveLastAdmin,
} from "./rules";
import type { LinkRequestStatus } from "./types";

describe("canTransitionRequest (link request state machine)", () => {
  it("lets the owner cancel a pending request and nothing else", () => {
    expect(canTransitionRequest("owner", "pending", "cancelled")).toBe(true);
    expect(canTransitionRequest("owner", "pending", "approved")).toBe(false);
    expect(canTransitionRequest("owner", "pending", "declined")).toBe(false);
    expect(canTransitionRequest("owner", "pending", "pending")).toBe(false);
  });

  it("lets an admin approve, decline or cancel a pending request", () => {
    expect(canTransitionRequest("admin", "pending", "approved")).toBe(true);
    expect(canTransitionRequest("admin", "pending", "declined")).toBe(true);
    expect(canTransitionRequest("admin", "pending", "cancelled")).toBe(true);
  });

  it("treats approved, declined and cancelled as final for everyone", () => {
    const finals: LinkRequestStatus[] = ["approved", "declined", "cancelled"];
    const all: LinkRequestStatus[] = ["pending", "approved", "declined", "cancelled"];
    for (const from of finals) {
      for (const to of all) {
        expect(canTransitionRequest("owner", from, to)).toBe(false);
        expect(canTransitionRequest("admin", from, to)).toBe(false);
      }
    }
  });
});

describe("guardProfileUpdate (members cannot set their own person_id or role)", () => {
  const before = { id: "u1", role: "viewer" as const, person_id: null };

  it("blocks a member linking themselves to a person", () => {
    const r = guardProfileUpdate("member", before, { role: "viewer", person_id: "p1" });
    expect(r.ok).toBe(false);
  });

  it("blocks a member promoting themselves", () => {
    expect(guardProfileUpdate("member", before, { role: "admin", person_id: null }).ok).toBe(false);
    expect(guardProfileUpdate("member", before, { role: "editor", person_id: null }).ok).toBe(false);
  });

  it("blocks a member unlinking themselves too", () => {
    const linked = { id: "u1", role: "viewer" as const, person_id: "p1" };
    expect(guardProfileUpdate("member", linked, { role: "viewer", person_id: null }).ok).toBe(false);
  });

  it("allows a member to save a row where neither protected column changes", () => {
    expect(guardProfileUpdate("member", before, { role: "viewer", person_id: null }).ok).toBe(true);
  });

  it("allows admins and the service role to change either column", () => {
    expect(guardProfileUpdate("admin", before, { role: "editor", person_id: "p1" }).ok).toBe(true);
    expect(guardProfileUpdate("service", before, { role: "admin", person_id: null }).ok).toBe(true);
  });
});

describe("wouldRemoveLastAdmin", () => {
  const solo = [
    { id: "a", role: "admin" as const },
    { id: "b", role: "viewer" as const },
  ];
  const two = [...solo, { id: "c", role: "admin" as const }];

  it("refuses to demote the only admin", () => {
    expect(wouldRemoveLastAdmin(solo, "a", "viewer")).toBe(true);
    expect(wouldRemoveLastAdmin(solo, "a", "editor")).toBe(true);
  });

  it("allows demotion when another admin remains", () => {
    expect(wouldRemoveLastAdmin(two, "a", "viewer")).toBe(false);
  });

  it("is not triggered by keeping admin, or by non-admin targets", () => {
    expect(wouldRemoveLastAdmin(solo, "a", "admin")).toBe(false);
    expect(wouldRemoveLastAdmin(solo, "b", "editor")).toBe(false);
    expect(wouldRemoveLastAdmin(solo, "missing", "viewer")).toBe(false);
  });
});

describe("roleLabel", () => {
  it("uses the friendly names", () => {
    expect(roleLabel("viewer", "en")).toBe("View & add memories");
    expect(roleLabel("editor", "en")).toBe("Edit the tree");
    expect(roleLabel("admin", "en")).toBe("Admin");
    expect(roleLabel("admin", "ar")).not.toBe("Admin");
  });
});
