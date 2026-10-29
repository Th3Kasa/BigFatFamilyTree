import { describe, it, expect } from "vitest";
import { matchPeople, matchStories, type DirectoryPerson, type DirectoryStory } from "./family-directory";

function person(id: string, given_en: string, extra: Partial<DirectoryPerson> = {}): DirectoryPerson {
  return {
    id,
    slug: null,
    given_en,
    given_ar: null,
    family_name_en: "Haddad",
    family_name_ar: null,
    photo_url: null,
    gender: null,
    birth_date: null,
    death_date: null,
    ...extra,
  };
}

const people = [
  person("1", "Mariam", { given_ar: "مريم" }),
  person("2", "Omar"),
  person("3", "Rosemary"),
  person("4", "Zoé"),
];

describe("matchPeople", () => {
  it("ranks word-start matches before mid-word matches", () => {
    // "Mariam" starts with it; "Omar" and "Rosemary" only contain it.
    expect(matchPeople(people, "mar").map((p) => p.id)).toEqual(["1", "2", "3"]);
    expect(matchPeople(people, "ros").map((p) => p.id)).toEqual(["3"]);
  });

  it("matches Arabic names and ignores accents", () => {
    expect(matchPeople(people, "مريم").map((p) => p.id)).toEqual(["1"]);
    expect(matchPeople(people, "zoe").map((p) => p.id)).toEqual(["4"]);
  });

  it("returns nothing for an empty query", () => {
    expect(matchPeople(people, "   ")).toEqual([]);
  });
});

describe("matchStories", () => {
  const stories: DirectoryStory[] = [
    { id: "e1", person_id: "1", type: "migration", location: "Beirut", story_en: null, story_ar: null },
    { id: "e2", person_id: "1", type: "birth", location: "Beirut", story_en: null, story_ar: null },
    { id: "e3", person_id: "2", type: "notable_story", location: null, story_en: "He carried the sewing machine on the bus.", story_ar: null },
  ];
  const dir = { people, stories };

  it("finds places once per person", () => {
    const hits = matchStories(dir, "beirut", "en");
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ kind: "place", snippet: "Beirut" });
  });

  it("finds words inside stories with an excerpt", () => {
    const [hit] = matchStories(dir, "sewing", "en");
    expect(hit.kind).toBe("story");
    expect(hit.person.id).toBe("2");
    expect(hit.snippet).toContain("sewing machine");
  });

  it("needs at least two characters", () => {
    expect(matchStories(dir, "b", "en")).toEqual([]);
  });
});
