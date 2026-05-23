import type { PersonInput, RelationshipInput } from "../../transform";
import { person, spouse, adopted, type FixtureExpected } from "./helpers";

// Couple C+D adopt X. X is biologically the child of E+F.
const people: PersonInput[] = [
  person("C", { gender: "m" }),
  person("D", { gender: "f" }),
  person("E", { gender: "m" }),
  person("F", { gender: "f" }),
  person("X", { father_id: "E", mother_id: "F" }),
];

const relationships: RelationshipInput[] = [
  spouse("r1", "C", "D", "current"),
  spouse("r2", "E", "F", "divorced"),
  adopted("a1", "X", "C"),
  adopted("a2", "X", "D"),
];

const expected: FixtureExpected = {
  ranks: { C: 0, D: 0, E: 0, F: 0, X: 1 },
  couples: [["C", "D"]],
  midpointChildren: [{ child: "X", parents: ["E", "F"] }],
};

export default { people, relationships, expected };
