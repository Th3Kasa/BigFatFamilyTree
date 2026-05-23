import type { PersonInput, RelationshipInput } from "../../transform";
import { person, spouse, type FixtureExpected } from "./helpers";

const people: PersonInput[] = [
  person("H", { gender: "m" }),
  person("W", { gender: "f" }),
  person("k1", { father_id: "H", mother_id: "W" }),
  person("k2", { father_id: "H", mother_id: "W" }),
  person("k3", { father_id: "H", mother_id: "W" }),
];

const relationships: RelationshipInput[] = [spouse("r1", "H", "W", "current")];

const expected: FixtureExpected = {
  ranks: { H: 0, W: 0, k1: 1, k2: 1, k3: 1 },
  couples: [["H", "W"]],
  midpointChildren: [
    { child: "k1", parents: ["H", "W"] },
    { child: "k2", parents: ["H", "W"] },
    { child: "k3", parents: ["H", "W"] },
  ],
};

export default { people, relationships, expected };
