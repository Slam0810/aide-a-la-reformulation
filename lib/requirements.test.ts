import { describe, expect, it } from "vitest";
import { CRITERIA, Requirement, requirementScore, scoreLevel } from "./requirements";

function makeRequirement(overrides: Partial<Requirement["criteria"]> = {}): Requirement {
  const criteria = Object.fromEntries(
    CRITERIA.map((c) => [c.key, true])
  ) as Requirement["criteria"];

  return {
    id: "REQ-001",
    section: "Fonctionnelle",
    text: "Le système doit faire quelque chose.",
    criteria: { ...criteria, ...overrides },
    clarification: null,
    acceptanceCriteria: []
  };
}

describe("requirementScore", () => {
  it("compte 8/8 quand tous les critères sont respectés", () => {
    expect(requirementScore(makeRequirement())).toBe(8);
  });

  it("ne compte pas les critères non respectés", () => {
    const req = makeRequirement({ verifiable: false, singuliere: false });
    expect(requirementScore(req)).toBe(6);
  });

  it("retourne 0 si aucun critère n'est renseigné", () => {
    const req = makeRequirement();
    // @ts-expect-error simulate a malformed API response
    req.criteria = {};
    expect(requirementScore(req)).toBe(0);
  });
});

describe("scoreLevel", () => {
  const total = CRITERIA.length;

  it("est 'ok' quand le score est parfait", () => {
    expect(scoreLevel(total, total)).toBe("ok");
  });

  it("est 'warn' pour un score proche du maximum", () => {
    expect(scoreLevel(total - 1, total)).toBe("warn");
    expect(scoreLevel(total - 2, total)).toBe("warn");
  });

  it("est 'bad' pour un score faible", () => {
    expect(scoreLevel(total - 3, total)).toBe("bad");
    expect(scoreLevel(0, total)).toBe("bad");
  });
});
