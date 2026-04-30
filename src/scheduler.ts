import type { CardState, Grade } from "./types";

const DAY = 24 * 60 * 60 * 1000;
const MIN_EASE = 1.3;
const DEFAULT_EASE = 2.5;

export function newCard(id: string): CardState {
  return {
    id,
    ease: DEFAULT_EASE,
    intervalDays: 0,
    dueAt: 0,
    reps: 0,
    lapses: 0,
    introduced: false,
  };
}

export function applyGrade(card: CardState, grade: Grade, now: number = Date.now()): CardState {
  let { ease, intervalDays, reps, lapses } = card;
  const wasNew = !card.introduced || reps === 0;

  if (grade === "again") {
    lapses += 1;
    ease = Math.max(MIN_EASE, ease - 0.2);
    intervalDays = wasNew ? 0 : 1;
    reps = 0;
  } else if (grade === "hard") {
    ease = Math.max(MIN_EASE, ease - 0.15);
    intervalDays = wasNew ? 1 : Math.max(1, Math.round(intervalDays * 1.2));
    reps += 1;
  } else if (grade === "good") {
    intervalDays = wasNew ? 1 : Math.max(1, Math.round(intervalDays * ease));
    reps += 1;
  } else if (grade === "easy") {
    ease = ease + 0.15;
    intervalDays = wasNew ? 4 : Math.max(1, Math.round(intervalDays * ease * 1.3));
    reps += 1;
  }

  const dueAt = grade === "again" && wasNew ? now + 60 * 1000 : now + intervalDays * DAY;

  return {
    ...card,
    ease,
    intervalDays,
    reps,
    lapses,
    dueAt,
    introduced: true,
  };
}

export function isDue(card: CardState, now: number = Date.now()): boolean {
  return card.introduced && card.dueAt <= now;
}

export function isNew(card: CardState): boolean {
  return !card.introduced;
}
