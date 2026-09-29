// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  addHistoryEntry,
  clearHistory,
  loadHistory,
  removeHistoryEntry
} from "./history";
import { Requirement } from "./requirements";

const SAMPLE_REQUIREMENTS: Requirement[] = [
  {
    id: "REQ-001",
    section: "Fonctionnelle",
    text: "Le système doit faire quelque chose.",
    criteria: {
      necessaire: true,
      nonAmbigue: true,
      complete: true,
      singuliere: true,
      faisable: true,
      verifiable: true,
      correcte: true,
      independanteSolution: true
    },
    clarification: null,
    acceptanceCriteria: []
  }
];

beforeEach(() => {
  window.localStorage.clear();
});

describe("historique local", () => {
  it("est vide au départ", () => {
    expect(loadHistory()).toEqual([]);
  });

  it("ajoute une entrée et la relit depuis le stockage", () => {
    const updated = addHistoryEntry([], "Un besoin.", SAMPLE_REQUIREMENTS);
    expect(updated).toHaveLength(1);
    expect(updated[0].sourceText).toBe("Un besoin.");

    const reloaded = loadHistory();
    expect(reloaded).toHaveLength(1);
    expect(reloaded[0].requirements[0].id).toBe("REQ-001");
  });

  it("place les entrées les plus récentes en premier", () => {
    let history = addHistoryEntry([], "Premier besoin.", SAMPLE_REQUIREMENTS);
    history = addHistoryEntry(history, "Deuxième besoin.", SAMPLE_REQUIREMENTS);
    expect(history[0].sourceText).toBe("Deuxième besoin.");
    expect(history[1].sourceText).toBe("Premier besoin.");
  });

  it("limite l'historique à 20 entrées", () => {
    let history: ReturnType<typeof addHistoryEntry> = [];
    for (let i = 0; i < 25; i++) {
      history = addHistoryEntry(history, `Besoin ${i}`, SAMPLE_REQUIREMENTS);
    }
    expect(history).toHaveLength(20);
    expect(history[0].sourceText).toBe("Besoin 24");
  });

  it("supprime une entrée précise", () => {
    let history = addHistoryEntry([], "À garder.", SAMPLE_REQUIREMENTS);
    history = addHistoryEntry(history, "À supprimer.", SAMPLE_REQUIREMENTS);
    const idToRemove = history.find((e) => e.sourceText === "À supprimer.")!.id;

    const updated = removeHistoryEntry(history, idToRemove);
    expect(updated).toHaveLength(1);
    expect(updated[0].sourceText).toBe("À garder.");
    expect(loadHistory()).toHaveLength(1);
  });

  it("vide entièrement l'historique", () => {
    addHistoryEntry([], "Un besoin.", SAMPLE_REQUIREMENTS);
    const cleared = clearHistory();
    expect(cleared).toEqual([]);
    expect(loadHistory()).toEqual([]);
  });
});
