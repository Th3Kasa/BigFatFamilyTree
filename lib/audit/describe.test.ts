import { describe, expect, it } from "vitest";
import { describeAudit, redact, referencedIds, type AuditInput } from "./describe";

const members: Record<string, string> = { basem: "Basem Morkos", galila: "Galila Mansour" };
const people: Record<string, string> = { nassif: "Nassif Mansour", victoria: "Victoria Mansour", samuel: "Samuel Mansour" };
const names = {
  member: (id: string | null | undefined) => (id ? members[id] ?? null : null),
  person: (id: string | null | undefined) => (id ? people[id] ?? null : null),
};
const nassif = { id: "nassif", given_en: "Nassif", family_name_en: "Mansour", birth_date: "1920", updated_at: "t1", pos_x: null, photo_url: null, father_id: null, deleted_at: null };
const row = (o: Partial<AuditInput>): AuditInput => ({ operation: "update", table_name: "people", row_id: "nassif", actor_id: "basem", before: null, after: null, ...o });

describe("describeAudit", () => {
  it("names who did it and what, for people", () => {
    expect(describeAudit(row({ operation: "insert", after: nassif }), names)).toMatchObject({ who: "Basem Morkos", what: "added Nassif Mansour to the tree", kind: "added" });
    const v = describeAudit(row({ before: nassif, after: { ...nassif, birth_date: "1921", updated_at: "t2" } }), names);
    expect(v.what).toBe("changed Nassif Mansour's birth date");
    expect(v.changes).toEqual([{ field: "Birth date", from: "1920", to: "1921" }]);
    expect(describeAudit(row({ before: nassif, after: { ...nassif, deleted_at: "now" } }), names).what).toBe("removed Nassif Mansour from the tree");
    expect(describeAudit(row({ before: nassif, after: { ...nassif, father_id: "samuel" } }), names).what).toBe("set Nassif Mansour's father to Samuel Mansour");
    expect(describeAudit(row({ before: nassif, after: { ...nassif, photo_url: "p/a.jpg" } }), names).what).toBe("changed Nassif Mansour's photo");
    expect(describeAudit(row({ before: nassif, after: { ...nassif, pos_x: 40 } }), names).what).toBe("moved Nassif Mansour's card on the tree");
    expect(describeAudit(row({ before: nassif, after: { ...nassif, given_en: "Nasif", birth_date: "1921" } }), names)).toMatchObject({ what: "edited Nasif Mansour's details", changes: [{ field: "First name", from: "Nassif", to: "Nasif" }, { field: "Birth date", from: "1920", to: "1921" }] });
  });

  it("describes marriages and other links by both names", () => {
    const rel = { person_a_id: "nassif", person_b_id: "victoria", type: "spouse", status: "current" };
    expect(describeAudit(row({ table_name: "relationships", operation: "insert", after: rel }), names).what).toBe("recorded the marriage of Nassif Mansour and Victoria Mansour");
    expect(describeAudit(row({ table_name: "relationships", before: rel, after: { ...rel, status: "widowed" } }), names).what).toBe("marked Nassif Mansour and Victoria Mansour as widowed");
  });

  it("describes member accounts, approvals and link requests", () => {
    const profile = { id: "galila", first_name: "Galila", last_name: "Mansour", role: "viewer", approved_at: null, person_id: null };
    expect(describeAudit(row({ table_name: "profiles", row_id: "galila", actor_id: null, operation: "insert", after: profile }), names)).toMatchObject({ who: "Galila Mansour", what: "joined the site" });
    expect(describeAudit(row({ table_name: "profiles", row_id: "galila", before: profile, after: { ...profile, approved_at: "now" } }), names).what).toBe("approved Galila Mansour as a family member");
    expect(describeAudit(row({ table_name: "profiles", row_id: "galila", before: profile, after: { ...profile, role: "editor" } }), names).what).toBe("changed Galila Mansour's role from viewer to editor");
    const req = { profile_id: "galila", person_id: "nassif", status: "pending" };
    expect(describeAudit(row({ table_name: "link_requests", operation: "insert", actor_id: "galila", after: req }), names)).toMatchObject({ who: "Galila Mansour", what: "asked to be linked to Nassif Mansour on the tree" });
    expect(describeAudit(row({ table_name: "link_requests", before: req, after: { ...req, status: "approved" } }), names).what).toBe("approved Galila Mansour's request to be Nassif Mansour");
  });

  it("describes timeline posts and life events", () => {
    expect(describeAudit(row({ table_name: "posts", operation: "insert", after: { person_id: "nassif" } }), names).what).toBe("shared a post on Nassif Mansour's profile");
    expect(describeAudit(row({ table_name: "posts", before: { person_id: "nassif", deleted_at: null }, after: { person_id: "nassif", deleted_at: "now" } }), names)).toMatchObject({ what: "deleted a post on Nassif Mansour's profile", kind: "removed" });
    expect(describeAudit(row({ table_name: "events", operation: "insert", after: { person_id: "nassif" } }), names).what).toBe("added a life event to Nassif Mansour's story");
  });

  it("says 'The system' for automatic changes and reads app events", () => {
    expect(describeAudit(row({ actor_id: null, operation: "insert", after: nassif }), names).who).toBe("The system");
    expect(describeAudit(row({ table_name: "profiles", row_id: "galila", actor_id: "galila", after: { event: "pin_locked_24h" } }), names)).toMatchObject({
      who: "Galila Mansour",
      what: "was locked out for the day after too many wrong PINs",
    });
  });

  it("never shows secrets", () => {
    const v = describeAudit(row({ table_name: "profiles", row_id: "galila", before: { pin_hash: "aaa", role: "viewer" }, after: { pin_hash: "bbb", role: "viewer" } }), names);
    expect(JSON.stringify(v)).not.toMatch(/aaa|bbb/);
    expect(redact({ pin_hash: "x", device_token: "y", role: "editor" })).toEqual({ pin_hash: "(hidden)", device_token: "(hidden)", role: "editor" });
  });
});

describe("member names", () => {
  it("uses the name the page looked up (their tree card) over what's stored on the account", () => {
    const tree = { member: (id: string | null | undefined) => (id === "nina" ? "Nina-Joyce Gaballah" : null), person: () => null };
    const v = describeAudit(row({ table_name: "profiles", row_id: "nina", actor_id: null, operation: "insert", after: { first_name: "Nina", last_name: null } }), tree);
    expect(v.who).toBe("Nina-Joyce Gaballah");
  });
});

describe("referencedIds", () => {
  it("collects every member and person a page of entries mentions", () => {
    const ids = referencedIds([
      row({ operation: "insert", after: { ...nassif, father_id: "samuel" } }),
      row({ table_name: "relationships", row_id: "r1", actor_id: "galila", after: { person_a_id: "nassif", person_b_id: "victoria" } }),
    ]);
    expect(ids.members.sort()).toEqual(["basem", "galila"]);
    expect(ids.people.sort()).toEqual(["nassif", "samuel", "victoria"]);
  });
});
