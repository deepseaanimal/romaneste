import type { AppState, Scenario } from "./types";
import { newCard } from "./scheduler";
import phrases from "./data/phrases.json";
import dialogues from "./data/dialogues.json";

const KEY = "romaneste-state-v1";

const ALL_SCENARIOS: Scenario[] = [
  "greetings","language","customs","shop","restaurant","help","numbers","time","bank","documents","complex"
];

const DEFAULT_STATE: AppState = {
  cards: {},
  dlgCards: {},
  daysStudied: [],
  newPerDay: 10,
  reviewLimit: 30,
  tripDate: "2026-07-01",
  activeScenarios: ALL_SCENARIOS,
};

export function calcStreak(daysStudied: string[]): number {
  if (!daysStudied.length) return 0;
  const sorted = [...daysStudied].sort().reverse();
  const today = todayKey();
  const yesterday = todayKey(new Date(Date.now() - 86400000));
  if (sorted[0] !== today && sorted[0] !== yesterday) return 0;
  let streak = 1;
  for (let i = 1; i < sorted.length; i++) {
    const prev = todayKey(new Date(new Date(sorted[i - 1] + "T00:00:00").getTime() - 86400000));
    if (sorted[i] === prev) streak++;
    else break;
  }
  return streak;
}

export { ALL_SCENARIOS };

export function load(): AppState {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as AppState) : DEFAULT_STATE;
    const state: AppState = {
      ...DEFAULT_STATE,
      ...parsed,
      cards: { ...parsed.cards },
      dlgCards: { ...(parsed.dlgCards ?? {}) },
    };
    for (const p of phrases) {
      if (!state.cards[p.id]) state.cards[p.id] = newCard(p.id);
    }
    for (const d of dialogues) {
      if (!state.dlgCards[d.id]) state.dlgCards[d.id] = newCard(d.id);
    }
    return state;
  } catch {
    const state: AppState = { ...DEFAULT_STATE, cards: {}, dlgCards: {} };
    for (const p of phrases) state.cards[p.id] = newCard(p.id);
    for (const d of dialogues) state.dlgCards[d.id] = newCard(d.id);
    return state;
  }
}

export function save(state: AppState): void {
  localStorage.setItem(KEY, JSON.stringify(state));
}

export function exportState(state: AppState): void {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `romaneste-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function importState(file: File): Promise<AppState> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const parsed = JSON.parse(e.target?.result as string) as AppState;
        if (!parsed.cards || !parsed.tripDate) throw new Error("Invalid backup file");
        resolve(parsed);
      } catch {
        reject(new Error("Could not read backup file"));
      }
    };
    reader.readAsText(file);
  });
}

export function todayKey(d: Date = new Date()): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
