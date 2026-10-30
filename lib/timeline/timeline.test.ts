import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { encryptToken, decryptToken } = await import("@/lib/drive/crypto");
const { canDeleteComment, canDeletePost, canRemoveTag, decadeOf } = await import("./types");
const { orderTimeline } = await import("@/components/timeline/Timeline");

import type { TimelinePost, TimelineViewer } from "./types";

const KEY = Buffer.alloc(32, 7).toString("base64");

describe("Drive token encryption", () => {
  it("round-trips and never stores the token in clear", () => {
    const stored = encryptToken("1//refresh-token-value", KEY);
    expect(stored.startsWith("v1.")).toBe(true);
    expect(stored).not.toContain("refresh-token-value");
    expect(decryptToken(stored, KEY)).toBe("1//refresh-token-value");
    expect(encryptToken("same", KEY)).not.toBe(encryptToken("same", KEY));
  });

  it("refuses a wrong key, a tampered value, or a short key", () => {
    const stored = encryptToken("secret", KEY);
    expect(() => decryptToken(stored, Buffer.alloc(32, 8).toString("base64"))).toThrow();
    const tampered = stored.slice(0, -4) + (stored.endsWith("AAAA") ? "BBBB" : "AAAA");
    expect(() => decryptToken(tampered, KEY)).toThrow();
    expect(() => encryptToken("x", Buffer.alloc(16).toString("base64"))).toThrow(/32 bytes/);
  });
});

const profile = "person-nassif";
const viewer = (o: Partial<TimelineViewer> = {}): TimelineViewer => ({ userId: "me", name: "Me", isAdmin: false, ownsProfile: false, personId: null, ...o });
const post = { authorId: "galila", personId: profile };

describe("who can delete and untag", () => {
  it("lets the author, the profile owner and admins delete a post, nobody else", () => {
    expect(canDeletePost({ ...post, authorId: "me" }, viewer(), profile)).toBe(true);
    expect(canDeletePost(post, viewer({ ownsProfile: true }), profile)).toBe(true);
    expect(canDeletePost(post, viewer({ isAdmin: true }), profile)).toBe(true);
    expect(canDeletePost(post, viewer(), profile)).toBe(false);
    // Owning this profile doesn't cover a post on someone else's profile that tags this person.
    expect(canDeletePost({ ...post, personId: "person-other" }, viewer({ ownsProfile: true }), profile)).toBe(false);
  });

  it("lets a comment be deleted by its author or anyone who can delete the post", () => {
    expect(canDeleteComment({ authorId: "me" }, post, viewer(), profile)).toBe(true);
    expect(canDeleteComment({ authorId: "x" }, { ...post, authorId: "me" }, viewer(), profile)).toBe(true);
    expect(canDeleteComment({ authorId: "x" }, post, viewer({ ownsProfile: true }), profile)).toBe(true);
    expect(canDeleteComment({ authorId: "x" }, post, viewer(), profile)).toBe(false);
  });

  it("lets the tagged person remove their own tag", () => {
    expect(canRemoveTag(post, "person-me", viewer({ personId: "person-me" }))).toBe(true);
    expect(canRemoveTag(post, "person-someone", viewer({ personId: "person-me" }))).toBe(false);
    expect(canRemoveTag({ authorId: "me" }, "person-someone", viewer())).toBe(true);
    expect(canRemoveTag(post, "person-someone", viewer({ isAdmin: true }))).toBe(true);
  });
});

const p = (id: string, dateValue: string | null, createdAt: string): TimelinePost => ({
  id, personId: profile, authorId: "a", authorName: "A", title: null, body: "x", dateValue, datePrecision: "year", location: null,
  video: null, createdAt, edited: false, media: [], tagIds: [], hearts: 0, hearted: false, comments: [],
});

describe("timeline order", () => {
  it("puts undated posts first (newest first), then dated items newest first, then undated life events", () => {
    const { recent, dated, undatedEvents } = orderTimeline(
      [p("old-photo", "1975-01-01", "2026-10-01"), p("new-undated", null, "2026-10-29"), p("older-undated", null, "2026-10-02"), p("wedding", "1988-01-01", "2026-09-01")],
      [{ id: "married", dateValue: "1946-01-01", node: null }, { id: "no-date", dateValue: null, node: null }],
    );
    expect(recent.map((i) => i.key)).toEqual(["p:new-undated", "p:older-undated"]);
    expect(dated.map((i) => i.key)).toEqual(["p:wedding", "p:old-photo", "e:married"]);
    expect(undatedEvents.map((i) => i.key)).toEqual(["e:no-date"]);
  });

  it("groups by decade", () => {
    expect(decadeOf("1975-01-01")).toBe(1970);
    expect(decadeOf("2000-01-01")).toBe(2000);
    expect(decadeOf(null)).toBeNull();
  });
});
