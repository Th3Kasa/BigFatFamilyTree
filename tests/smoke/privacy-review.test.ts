import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { claimWords, hasFullName } from "@/lib/members/claim-query";
import { isExternalPhotoUrl, normalizePhotoValue, photoStoragePath } from "@/lib/storage/photo-path";
import { photoLink, signPhotoValues, signRowPhotos } from "@/lib/storage/sign";
import { personSchema } from "@/lib/validation/people";
import { DEFAULT_SITE_URL, inviteRedirectUrl } from "@/lib/members/account-admin";

const root = path.resolve(__dirname, "../..");
const read = (p: string) => readFileSync(path.join(root, p), "utf8");

describe("claim search needs a first AND a family name", () => {
  it("accepts two words of 2+ characters, in any script", () => {
    expect(hasFullName("Omar Haddad")).toBe(true);
    expect(hasFullName("Om Ha")).toBe(true);
    expect(hasFullName("عمر حداد")).toBe(true);
    expect(hasFullName("  Omar   al-Haddad ")).toBe(true);
  });
  it("rejects one word, a 1-character word, or nothing", () => {
    for (const q of ["", "Omar", "Omar H", "O Haddad", "!! ??", "   "]) expect(hasFullName(q), q).toBe(false);
  });
  it("splits on punctuation and strips accents", () => {
    expect(claimWords("Zoë-Marie O'Neil")).toEqual(["zoe", "marie", "o", "neil"]);
  });
});

describe("20260522000024 (claim cap, guards, lows)", () => {
  const sql = read("supabase/migrations/20260522000024_claim_cap_guards_and_lows.sql");
  const body = (name: string) => {
    const start = sql.indexOf(`create or replace function public.${name}`);
    expect(start, name).toBeGreaterThan(-1);
    return sql.slice(start, sql.indexOf("end; $$;", start));
  };

  it("unapproved callers: two 2+ char words, capped at 30 distinct searches a day, no parent names", () => {
    const b = body("search_people_for_claim");
    expect(b).toMatch(/cardinality\(v_tokens\) < 2/);
    expect(b).toMatch(/char_length\(t\) < 2/);
    expect(b).toMatch(/v_used > 30/);
    expect(b).toContain("claim_search_limit");
    expect(b).toMatch(/case when v_approved then s\.father_name_en end/);
    expect(b).toMatch(/case when v_approved then s\.mother_name_en end/);
    expect(b).toMatch(/volatile security definer/);
  });
  it("the counter table is closed to clients", () => {
    expect(sql).toMatch(/alter table public\.claim_search_log enable row level security/);
    expect(sql).toContain("revoke all on public.claim_search_log from public, anon, authenticated;");
  });
  it("the guards let a backend role clear reviewed_by / handled_by on final rows", () => {
    expect(body("guard_link_request")).toMatch(/v_backend[\s\S]*reviewed_by is null[\s\S]*return new/);
    expect(body("guard_relative_suggestion")).toMatch(/v_backend[\s\S]*handled_by is null[\s\S]*return new/);
  });
  it("only the owner can change the owner's own details", () => {
    const b = body("guard_profile_privileged_columns");
    expect(b).toContain("Only the super admin can change their own profile");
    expect(b).toMatch(/auth\.uid\(\) is distinct from old\.id/);
  });
  it("first_admin_name is generic for accounts that are not approved", () => {
    expect(body("first_admin_name")).toContain("else 'the family admins'");
  });
});

describe("20260522000025_private_photos.sql", () => {
  const sql = read("supabase/migrations/20260522000025_private_photos.sql");
  it("makes the bucket private and rewrites legacy public URLs to paths", () => {
    expect(sql).toContain("update storage.buckets set public = false where id = 'photos';");
    expect(sql).toMatch(/update public\.people\s+set photo_url = substring\(photo_url from '\/storage\/v1\/object\/public\/photos\//);
  });
});

describe("photo values", () => {
  const base = "https://abc.supabase.co/storage/v1/object";
  it("reads the path from a bare path, a legacy public URL and a signed URL", () => {
    expect(photoStoragePath("9f1c.jpg")).toBe("9f1c.jpg");
    expect(photoStoragePath("person-1/9f1c.jpg")).toBe("person-1/9f1c.jpg");
    expect(photoStoragePath(`${base}/public/photos/person-1/9f1c.jpg`)).toBe("person-1/9f1c.jpg");
    expect(photoStoragePath(`${base}/sign/photos/9f1c.jpg?token=abc`)).toBe("9f1c.jpg");
  });
  it("rejects traversal and junk", () => {
    for (const v of ["../x.jpg", "a//b.jpg", "/abs.jpg", "a b.jpg", "", "   ", null, undefined]) {
      expect(photoStoragePath(v as string), String(v)).toBeNull();
    }
    expect(photoStoragePath(`${base}/public/photos/../secret`)).toBeNull();
  });
  it("tells external images apart from ours", () => {
    expect(isExternalPhotoUrl("https://elsewhere.example/a.jpg")).toBe(true);
    expect(isExternalPhotoUrl(`${base}/public/photos/a.jpg`)).toBe(false);
    expect(isExternalPhotoUrl("a.jpg")).toBe(false);
  });
  it("normalises what gets stored: our URLs become paths, external stay, junk becomes null", () => {
    expect(normalizePhotoValue(`${base}/sign/photos/a.jpg?token=t`)).toBe("a.jpg");
    expect(normalizePhotoValue("a.jpg")).toBe("a.jpg");
    expect(normalizePhotoValue("https://elsewhere.example/a.jpg")).toBe("https://elsewhere.example/a.jpg");
    expect(normalizePhotoValue("javascript:alert(1)")).toBeNull();
    expect(normalizePhotoValue("")).toBeNull();
  });
  it("saving a person reduces a signed URL from the edit form to its path", () => {
    const r = personSchema.safeParse({
      given_en: "Omar",
      gender: "m",
      is_placeholder: false,
      photo_url: `${base}/sign/photos/p/9f1c.jpg?token=xyz`,
    });
    expect(r.success && r.data.photo_url).toBe("p/9f1c.jpg");
    const none = personSchema.safeParse({ given_en: "Omar", gender: "m", is_placeholder: false, photo_url: "" });
    expect(none.success && none.data.photo_url).toBeNull();
  });
});

describe("photo links for a page", () => {
  it("links every bucket photo through /api/photo, deduplicated, with no storage calls", async () => {
    const client = { storage: { from: () => { throw new Error("storage must not be called"); } } };
    const map = await signPhotoValues(client, ["a.jpg", "a.jpg", "https://x.supabase.co/storage/v1/object/public/photos/a.jpg", "p/b.jpg", null]);
    expect(map.get("a.jpg")).toBe("/api/photo?p=a.jpg&w=384");
    // the legacy public URL for the same file maps to the same site link
    expect(map.get("https://x.supabase.co/storage/v1/object/public/photos/a.jpg")).toBe("/api/photo?p=a.jpg&w=384");
    expect(map.get("p/b.jpg")).toBe("/api/photo?p=p%2Fb.jpg&w=384");
  });
  it("leaves external URLs alone and drops empty or unsafe values", async () => {
    const map = await signPhotoValues(null, [null, "", "https://elsewhere.example/p.jpg", "../etc/passwd"]);
    expect(map.get("https://elsewhere.example/p.jpg")).toBe("https://elsewhere.example/p.jpg");
    expect(map.has("../etc/passwd")).toBe(false);
    expect(photoLink("a.jpg", 128)).toBe("/api/photo?p=a.jpg&w=128");
  });
  it("rows keep the same photo_url field, now a site link", async () => {
    const rows = await signRowPhotos(null, [
      { id: 1, photo_url: "a.jpg" },
      { id: 2, photo_url: "../bad" },
      { id: 3, photo_url: null },
    ]);
    expect(rows).toEqual([
      { id: 1, photo_url: "/api/photo?p=a.jpg&w=384" },
      { id: 2, photo_url: null },
      { id: 3, photo_url: null },
    ]);
  });
  it("never puts a signed storage URL (which works without signing in) on a page", async () => {
    const rows = await signRowPhotos(null, [{ photo_url: "https://x.supabase.co/storage/v1/object/sign/photos/a.jpg?token=abc" }]);
    expect(rows[0].photo_url).toBe("/api/photo?p=a.jpg&w=384");
  });
});

describe("every place that shows photos goes through the signer", () => {
  it.each([
    "app/page.tsx",
    "app/people/page.tsx",
    "app/person/[id]/page.tsx",
    "app/person/[id]/event/new/page.tsx",
    "app/person/[id]/edit/page.tsx",
    "app/relationships/page.tsx",
    "lib/members/current-person.ts",
    "lib/client/family-directory.ts",
  ])("%s", (file) => {
    expect(read(file)).toMatch(/withSignedPhotos|signRowPhotos/);
  });
  it("uploads store the path, not a public URL", () => {
    for (const f of ["components/forms/PhotoUpload.tsx", "components/forms/AvatarPhotoUpload.tsx"]) {
      expect(read(f), f).not.toContain("getPublicUrl");
    }
  });
  it("the graph components were not touched", () => {
    expect(read("components/graph/PersonNode.tsx")).toContain("person.photo_url");
  });
});

describe("invite redirect never uses the Host header", () => {
  it("falls back to the production site", () => {
    const prev = process.env.NEXT_PUBLIC_APP_URL;
    delete process.env.NEXT_PUBLIC_APP_URL;
    expect(inviteRedirectUrl()).toBe(`${DEFAULT_SITE_URL}/auth/callback?next=/welcome`);
    process.env.NEXT_PUBLIC_APP_URL = "https://staging.example.com/";
    expect(inviteRedirectUrl()).toBe("https://staging.example.com/auth/callback?next=/welcome");
    process.env.NEXT_PUBLIC_APP_URL = "javascript:alert(1)";
    expect(inviteRedirectUrl()).toBe(`${DEFAULT_SITE_URL}/auth/callback?next=/welcome`);
    if (prev === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
    else process.env.NEXT_PUBLIC_APP_URL = prev;
  });
  it("the module no longer reads request headers", () => {
    expect(read("lib/members/account-admin.ts")).not.toMatch(/next\/headers|x-forwarded|\.get\("host"\)/);
  });
});

describe("bootstrap admin only creates the FIRST admin", () => {
  const actions = read("app/(auth)/login/actions.ts");
  const callback = read("app/(auth)/auth/callback/route.ts");
  const helper = read("lib/auth/bootstrap-admin.ts");

  it("promotes only while there are zero admins", () => {
    expect(helper).toMatch(/\(await countAdmins\(svc\)\) !== 0\) return false/);
    expect(actions).toMatch(/\(await countAdmins\(svc\)\) !== 0\) return FAILED/);
  });
  it("no longer upserts a role on every sign-in", () => {
    expect(callback).not.toMatch(/upsert\(\{ id: user\.id, role: "admin" \}/);
    expect(callback).toContain("promoteIfNoAdmins");
    expect(actions).not.toMatch(/upsert\(\{ id: userId, role: "admin" \}/);
  });
  it("every failure returns one identical generic result (no reason or details)", () => {
    expect(actions).not.toMatch(/reason:|details:|not_bootstrap|create_failed|Invalid password|allowlist/);
    expect(actions.match(/return FAILED/g)!.length).toBeGreaterThan(5);
  });
});

describe("saving a form that shows a photo", () => {
  it("reads the site's own /api/photo link back to the stored path", () => {
    expect(normalizePhotoValue("/api/photo?p=p%2F9f1c.jpg&w=384")).toBe("p/9f1c.jpg");
    expect(normalizePhotoValue("https://www.bigfatfamilytree.com.au/api/photo?p=a.jpg&w=128")).toBe("a.jpg");
    expect(photoStoragePath(photoLink("p/9f1c.jpg"))).toBe("p/9f1c.jpg");
  });
  it("still refuses unsafe paths and other site pages", () => {
    expect(normalizePhotoValue("/api/photo?p=..%2Fsecret&w=384")).toBeNull();
    expect(normalizePhotoValue("/api/photo?w=384")).toBeNull();
    expect(normalizePhotoValue("/api/other?p=a.jpg")).toBeNull();
  });
  it("lets the person form's photo field pass validation", () => {
    const r = personSchema.safeParse({ given_en: "Nassif", gender: "m", is_placeholder: false, photo_url: "/api/photo?p=p%2Fa.jpg&w=384" });
    expect(r.success && r.data.photo_url).toBe("p/a.jpg");
  });
});
