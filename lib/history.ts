import { Requirement } from "@/lib/requirements";

export interface HistoryEntry {
  id: string;
  timestamp: number;
  sourceText: string;
  requirements: Requirement[];
}

const STORAGE_KEY = "po-reformulateur:history";
const MAX_ENTRIES = 20;

export function loadHistory(): HistoryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persist(entries: HistoryEntry[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Stockage plein ou indisponible (navigation privée, quota dépassé...) :
    // l'historique reste fonctionnel pour la session en cours, silencieusement
    // non persisté.
  }
}

export function addHistoryEntry(
  current: HistoryEntry[],
  sourceText: string,
  requirements: Requirement[]
): HistoryEntry[] {
  const entry: HistoryEntry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: Date.now(),
    sourceText,
    requirements
  };
  const next = [entry, ...current].slice(0, MAX_ENTRIES);
  persist(next);
  return next;
}

export function removeHistoryEntry(
  current: HistoryEntry[],
  id: string
): HistoryEntry[] {
  const next = current.filter((e) => e.id !== id);
  persist(next);
  return next;
}

export function clearHistory(): HistoryEntry[] {
  persist([]);
  return [];
}

export function formatHistoryDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  });
}
