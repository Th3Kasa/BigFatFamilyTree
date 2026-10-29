import { describe, expect, it } from "vitest";
import {
  canRemoveAccess,
  countWaiting,
  guardApprovalChange,
  isApproved,
  needsAccessDecision,
  stampApprovedBy,
  type ApprovalSnapshot,
} from "@/lib/members/approval";

const viewer = (over: Partial<ApprovalSnapshot> = {}): ApprovalSnapshot => ({
  role: "viewer",
  approved_at: null,
  approved_by: null,
  onboarded_at: null,
  checklist_dismissed_at: null,
  ...over,
});

describe("isApproved (mirrors public.is_approved())", () => {
  it("is false for a brand-new account", () => expect(isApproved({ role: "viewer", approved_at: null })).toBe(false));
  it("is true once approved_at is set", () =>
    expect(isApproved({ role: "viewer", approved_at: "2026-05-22T00:00:00Z" })).toBe(true));
  it("is always true for admins, even without approved_at", () =>
    expect(isApproved({ role: "admin", approved_at: null })).toBe(true));
  it("is false when there is no profile", () => {
    expect(isApproved(null)).toBe(false);
    expect(isApproved(undefined)).toBe(false);
  });
});

describe("guardApprovalChange (mirrors the profiles guard trigger)", () => {
  const approved = viewer({ approved_at: "2026-05-22T00:00:00Z", approved_by: "admin-1" });

  it("lets a member change nothing about approval", () => {
    expect(guardApprovalChange("member", viewer(), approved).ok).toBe(false);
    expect(guardApprovalChange("member", approved, viewer()).ok).toBe(false);
    expect(guardApprovalChange("member", viewer(), viewer({ approved_by: "me" })).ok).toBe(false);
  });

  it("blocks a member from stamping onboarded_at or checklist_dismissed_at directly", () => {
    expect(guardApprovalChange("member", viewer(), viewer({ onboarded_at: "2026-05-22T00:00:00Z" })).ok).toBe(false);
    expect(guardApprovalChange("member", viewer(), viewer({ checklist_dismissed_at: "2026-05-22T00:00:00Z" })).ok).toBe(false);
  });

  it("lets an admin and the backend approve and remove access", () => {
    for (const actor of ["admin", "service"] as const) {
      expect(guardApprovalChange(actor, viewer(), approved).ok).toBe(true);
      expect(guardApprovalChange(actor, approved, viewer()).ok).toBe(true);
    }
  });

  it("is a no-op for a member who changes nothing", () => {
    expect(guardApprovalChange("member", approved, approved).ok).toBe(true);
  });

  it("never removes an admin's access, whoever asks", () => {
    const admin = viewer({ role: "admin", approved_at: "2026-05-22T00:00:00Z" });
    for (const actor of ["admin", "service", "member"] as const) {
      const r = guardApprovalChange(actor, admin, { ...admin, approved_at: null });
      expect(r.ok).toBe(false);
    }
  });

  it("allows clearing access once the person is demoted in the same change", () => {
    const admin = viewer({ role: "admin", approved_at: "2026-05-22T00:00:00Z" });
    expect(guardApprovalChange("admin", admin, { ...admin, role: "viewer", approved_at: null }).ok).toBe(true);
  });
});

describe("stampApprovedBy", () => {
  it("records the approving admin on first approval", () => {
    expect(stampApprovedBy({ approved_at: null }, { approved_at: "x", approved_by: null }, "admin-1")).toBe("admin-1");
  });
  it("keeps an existing approver", () => {
    expect(stampApprovedBy({ approved_at: "x" }, { approved_at: "x", approved_by: "admin-0" }, "admin-1")).toBe("admin-0");
  });
  it("clears the approver when access is removed", () => {
    expect(stampApprovedBy({ approved_at: "x" }, { approved_at: null, approved_by: "admin-0" }, "admin-1")).toBeNull();
  });
  it("stays null for the backend (no auth.uid())", () => {
    expect(stampApprovedBy({ approved_at: null }, { approved_at: "x", approved_by: null }, null)).toBeNull();
  });
});

describe("Remove access is refused for admins", () => {
  it("allows viewers and editors", () => {
    expect(canRemoveAccess("viewer")).toBe(true);
    expect(canRemoveAccess("editor")).toBe(true);
  });
  it("refuses admins", () => expect(canRemoveAccess("admin")).toBe(false));
});

describe("Waiting for access", () => {
  const none = new Set<string>();
  it("lists unapproved non-admins with no request", () => {
    expect(needsAccessDecision({ id: "a", role: "viewer", approved: false }, none)).toBe(true);
  });
  it("skips approved accounts, admins and accounts that already have a request", () => {
    expect(needsAccessDecision({ id: "a", role: "viewer", approved: true }, none)).toBe(false);
    expect(needsAccessDecision({ id: "a", role: "admin", approved: false }, none)).toBe(false);
    expect(needsAccessDecision({ id: "a", role: "viewer", approved: false }, new Set(["a"]))).toBe(false);
  });

  it("countWaiting counts requests + unapproved without a request + suggestions, once each", () => {
    expect(
      countWaiting({
        pendingRequestProfileIds: ["a", "b"],
        unapproved: [
          { id: "a", role: "viewer" }, // already counted through its request
          { id: "c", role: "viewer" },
          { id: "d", role: "admin" }, // admins never wait
        ],
        pendingSuggestions: 3,
      }),
    ).toBe(2 + 1 + 3);
  });
  it("is zero when nothing is waiting", () => {
    expect(countWaiting({ pendingRequestProfileIds: [], unapproved: [], pendingSuggestions: 0 })).toBe(0);
  });
});
