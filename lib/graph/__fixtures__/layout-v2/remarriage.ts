import type { PersonInput, RelationshipInput } from "../../transform";
import { person, spouse, type FixtureExpected } from "./helpers";

// H was married to W1 (divorced, 2 kids), now married to W2 (current, 1 kid).
// W1 has a new partner P3 (current, 1 kid).
const people: PersonInput[] = [
  person("H", { gender: "m" }),
  person("W1", { gender: "f" }),
  person("W2", { gender: "f" }),
  person("P3", { gender: "m" }),
  person("k1", { father_id: "H", mother_id: "W1" }),
  person("k2", { father_id: "H", mother_id: "W1" }),
  person("k3", { father_id: "H", mother_id: "W2" }),
  person("k4", { father_id: "P3", mother_id: "W1" }),
];

const relationships: RelationshipInput[] = [
  spouse("r1", "H", "W1", "divorced", 0),
  spouse("r2", "H", "W2", "current", 1),
  spouse("r3", "W1", "P3", "current", 0),
];

const expected: FixtureExpected = {
  ranks: { H: 0, W1: 0, W2: 0, P3: 0, k1: 1, k2: 1, k3: 1, k4: 1 },
  couples: [
    ["H", "W2"],
    ["W1", "P3"],
  ],
  midpointChildren: [
    { child: "k3", parents: ["H", "W2"] },
    { child: "k4", parents: ["P3", "W1"] },
    { child: "k1", parents: ["H", "W1"] },
    { child: "k2", parents: ["H", "W1"] },
  ],
};

export default { people, relationships, expected };
