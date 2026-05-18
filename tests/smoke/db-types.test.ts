import { describe, it, expectTypeOf } from "vitest";
import type { Database } from "@/lib/db/types";

describe("Database types", () => {
  it("exports a Database type with public schema", () => {
    type Tables = Database["public"]["Tables"];
    type PeopleRow = Tables["people"]["Row"];
    type EventsRow = Tables["events"]["Row"];
    type RelationshipsRow = Tables["relationships"]["Row"];

    expectTypeOf<PeopleRow["id"]>().toBeString();
    expectTypeOf<PeopleRow["gender"]>().toEqualTypeOf<"m" | "f" | "unknown">();
    expectTypeOf<EventsRow["type"]>().toEqualTypeOf<
      | "birth"
      | "death"
      | "marriage"
      | "divorce"
      | "engagement"
      | "migration"
      | "education"
      | "notable_story"
      | "custom"
    >();
    expectTypeOf<RelationshipsRow["type"]>().toEqualTypeOf<
      "spouse" | "adopted_by" | "raised_by" | "godparent"
    >();
  });
});
