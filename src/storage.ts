import type { AppState } from "./types";
import { newCard } from "./scheduler";
import phrases from "./data/phrases.json";
import dialogues from "./data/dialogues.json";

const KEY = "romaneste-state-v1";

const DEFAULT_STATE: AppState = {
  cards: {},
  dlgCards: {},
  daysStudied: [],
  newPerDay: 10,
  reviewLimit: 30,
  tripDate: "2026-07-01",
};

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

export function todayKey(d: Date = new Date()): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
