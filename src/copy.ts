// Friendly, low-pressure UI strings. Edit these freely — none of them
// are referenced by anything except the UI.

export const greetings = [
  "Bună. Ready when you are.",
  "Whenever you have a few minutes.",
  "Take your time.",
  "No pressure today.",
];

export const sessionStarts = [
  "Let's start gently.",
  "A few cards is plenty.",
  "Here we go.",
];

export const allDoneToday = [
  "That's everything for today. Nicely done.",
  "Done for today. See you whenever.",
  "All caught up. Moldova is going to go great.",
  "That's it. Rest of the day is yours.",
];

export const noneDueYet = [
  "Nothing due right now. Want to learn a few new phrases?",
  "All review caught up. Pick up new phrases if you'd like.",
];

export const onAgain = [
  "That's how learning works.",
  "We'll see it again soon.",
  "Totally fine.",
];

export const onGood = [
  "Nice.",
  "Good.",
  "Yep.",
];

export const onEasy = [
  "Solid.",
  "Locked in.",
  "Nice — you've got that one.",
];

export function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
