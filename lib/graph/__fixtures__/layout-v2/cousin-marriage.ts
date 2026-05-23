import type { PersonInput, RelationshipInput } from "../../transform";
import { person, spouse, type FixtureExpected } from "./helpers";

// A and B are siblings (gen 1, parents R). A has child X. B has child Y.
// X marries Y (cousin marriage). They have a child Z (gen 3).
const people: PersonInput[] = [
  person("R"),
  person("A", { father_id: "R" }),
  person("B", { father_id: "R" }),
  person("X", { father_id: "A" }),
  person("Y", { father_id: "B" }),
  person("Z", { father_id: "X", mother_id: "Y" }),
];

const relationships: RelationshipInput[] = [spouse("r1", "X", "Y", "current")];

const expected: FixtureExpected = {
  ranks: { R: 0, A: 1, B: 1, X: 2, Y: 2, Z: 3 },
  couples: [["X", "Y"]],
  midpointChildren: [{ child: "Z", parents: ["X", "Y"] }],
};

export default { people, relationships, expected };
