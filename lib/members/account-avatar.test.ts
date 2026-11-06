import { describe, expect, it } from "vitest";
import { accountAvatar } from "./account-avatar";
import type { CurrentPerson } from "./types";

const person = (over: Partial<CurrentPerson> = {}) =>
  ({ id: "p1", slug: "basem", given_en: "Basem", given_ar: null, family_name_en: "Morkos", family_name_ar: null, photo_url: "/api/photo?p=x&w=384", ...over }) as CurrentPerson;

describe("accountAvatar", () => {
  it("shows the tree card's photo and name for a linked account", () => {
    expect(accountAvatar({ email: "a@b.com" }, person())).toEqual({ photo: "/api/photo?p=x&w=384", initials: "BM" });
  });

  it("the card's photo wins over a sign-in provider's avatar", () => {
    expect(accountAvatar({ user_metadata: { avatar_url: "https://other/a.png" } }, person()).photo).toBe("/api/photo?p=x&w=384");
  });

  it("a linked card with no photo shows its initials", () => {
    expect(accountAvatar({ user_metadata: { avatar_url: null } }, person({ photo_url: null }))).toEqual({ photo: null, initials: "BM" });
  });

  it("uses Arabic names when the card has no English ones", () => {
    const ar = person({ given_en: null, family_name_en: null, given_ar: "عادل", family_name_ar: "منصور", photo_url: null });
    expect(accountAvatar({}, ar).initials).toBe("عم");
  });

  it("falls back to the account itself when not linked", () => {
    expect(accountAvatar({ user_metadata: { full_name: "Mona Haddad", avatar_url: "https://x/a.png" } }, null)).toEqual({ photo: "https://x/a.png", initials: "MH" });
    expect(accountAvatar({ email: "mona@b.com" }, null)).toEqual({ photo: null, initials: "MO" });
  });
});
