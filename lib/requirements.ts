export type CriteriaKey =
  | "necessaire"
  | "nonAmbigue"
  | "complete"
  | "singuliere"
  | "faisable"
  | "verifiable"
  | "correcte"
  | "independanteSolution";

export interface GherkinScenario {
  scenario: string;
  given: string;
  when: string;
  then: string;
}

export interface Requirement {
  id: string;
  section: string;
  text: string;
  criteria: Record<CriteriaKey, boolean>;
  clarification: string | null;
  acceptanceCriteria: GherkinScenario[];
}

export const CRITERIA: { key: CriteriaKey; label: string }[] = [
  { key: "necessaire", label: "Nécessaire" },
  { key: "nonAmbigue", label: "Non ambiguë" },
  { key: "complete", label: "Complète" },
  { key: "singuliere", label: "Singulière" },
  { key: "faisable", label: "Faisable" },
  { key: "verifiable", label: "Vérifiable" },
  { key: "correcte", label: "Correcte" },
  { key: "independanteSolution", label: "Indépendante de la solution" }
];

export function requirementScore(req: Requirement): number {
  return CRITERIA.reduce(
    (count, c) => count + (req.criteria?.[c.key] ? 1 : 0),
    0
  );
}

export function scoreLevel(score: number, total: number): "ok" | "warn" | "bad" {
  if (score === total) return "ok";
  if (score >= total - 2) return "warn";
  return "bad";
}
