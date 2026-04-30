export type Scenario =
  | "greetings"
  | "language"
  | "customs"
  | "shop"
  | "restaurant"
  | "help"
  | "numbers"
  | "time"
  | "bank"
  | "documents"
  | "complex";

export interface DialogueResponse {
  ro: string;
  en: string;
}

export interface Dialogue {
  id: string;
  scenario: Scenario;
  prompt: string;
  promptEn: string;
  responses: DialogueResponse[];
  note?: string;
}

export interface Phrase {
  id: string;
  scenario: Scenario;
  ro: string;
  en: string;
  ru?: string;
  note?: string;
}

export type Grade = "again" | "hard" | "good" | "easy";

export interface CardState {
  id: string;
  ease: number;
  intervalDays: number;
  dueAt: number;
  reps: number;
  lapses: number;
  introduced: boolean;
}

export interface AppState {
  cards: Record<string, CardState>;
  dlgCards: Record<string, CardState>;
  daysStudied: string[];
  newPerDay: number;
  reviewLimit: number;
  tripDate: string;
}
