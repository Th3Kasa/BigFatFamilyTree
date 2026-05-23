import type { PersonInput, RelationshipInput } from "../../transform";
import { person, type FixtureExpected } from "./helpers";

const people: PersonInput[] = [
  person("root"),
  person("c1", { father_id: "root" }),
  person("c2", { father_id: "root" }),
  person("c3", { father_id: "root" }),
  person("g1", { father_id: "c1" }),
  person("g2", { father_id: "c1" }),
  person("g3", { father_id: "c2" }),
  person("g4", { father_id: "c2" }),
  person("g5", { father_id: "c3" }),
  person("g6", { father_id: "c3" }),
];

const relationships: RelationshipInput[] = [];

const expected: FixtureExpected = {
  ranks: {
    root: 0,
    c1: 1,
    c2: 1,
    c3: 1,
    g1: 2,
    g2: 2,
    g3: 2,
    g4: 2,
    g5: 2,
    g6: 2,
  },
};

export default { people, relationships, expected };
