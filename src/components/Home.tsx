import { useMemo } from "react";
import type { AppState } from "../types";
import { isDue, isNew } from "../scheduler";
import phrases from "../data/phrases.json";
import dialogues from "../data/dialogues.json";
import { greetings, pick } from "../copy";

interface Props {
  state: AppState;
  onStart: () => void;
}

function daysUntil(targetIso: string): number {
  const target = new Date(targetIso + "T00:00:00").getTime();
  return Math.max(0, Math.ceil((target - Date.now()) / (24 * 60 * 60 * 1000)));
}

function formatNextReview(ts: number): string {
  const ms = ts - Date.now();
  if (ms <= 0) return "any time now";
  const hours = Math.round(ms / (60 * 60 * 1000));
  if (hours < 24) return `in ${hours} hour${hours === 1 ? "" : "s"}`;
  const days = Math.round(hours / 24);
  return `in ${days} day${days === 1 ? "" : "s"}`;
}

export function Home({ state, onStart }: Props) {
  const greeting = useMemo(() => pick(greetings), []);

  const stats = useMemo(() => {
    const now = Date.now();
    let dueNow = 0;
    let inDeck = 0;
    let nextReviewAt = Infinity;

    for (const p of phrases) {
      const c = state.cards[p.id];
      if (!c) continue;
      if (!isNew(c)) {
        inDeck += 1;
        if (isDue(c, now)) dueNow += 1;
        else if (c.dueAt < nextReviewAt) nextReviewAt = c.dueAt;
      }
    }
    for (const d of dialogues) {
      const c = state.dlgCards?.[d.id];
      if (!c) continue;
      if (!isNew(c)) {
        inDeck += 1;
        if (isDue(c, now)) dueNow += 1;
        else if (c.dueAt < nextReviewAt) nextReviewAt = c.dueAt;
      }
    }

    const newPhrases = phrases.filter((p) => isNew(state.cards[p.id])).length;
    const newDlg = dialogues.filter((d) => isNew(state.dlgCards?.[d.id])).length;
    // Match buildQueue: max(1, newPerDay-2) phrase slots + 2 dialogue slots
    const newPhraseSlots = Math.min(Math.max(1, state.newPerDay - 2), newPhrases);
    const newDlgSlots = Math.min(2, newDlg);
    const newToday = newPhraseSlots + newDlgSlots;

    return { dueNow, inDeck, nextReviewAt, newToday, total: phrases.length + dialogues.length };
  }, [state]);

  const tripDays = daysUntil(state.tripDate);
  const sessionSize = stats.dueNow + Math.min(stats.newToday, state.newPerDay + 2);
  const hasWork = stats.dueNow > 0 || stats.newToday > 0;

  return (
    <div className="home">
      <header>
        <h1>Românește</h1>
        <p className="muted">{greeting}</p>
      </header>

      <section className="card-summary">
        <div className="stat">
          <div className="stat-num">{stats.dueNow}</div>
          <div className="stat-label">due now</div>
        </div>
        <div className="stat">
          <div className="stat-num">{stats.inDeck}</div>
          <div className="stat-label">in your deck</div>
        </div>
        <div className="stat">
          <div className="stat-num">{tripDays}</div>
          <div className="stat-label">days to Moldova</div>
        </div>
      </section>

      {stats.inDeck > 0 && stats.dueNow === 0 && stats.nextReviewAt < Infinity && (
        <p className="muted hint">Next review {formatNextReview(stats.nextReviewAt)}.</p>
      )}

      <button className="primary" onClick={onStart} disabled={!hasWork}>
        {hasWork
          ? `Start session · ${sessionSize} card${sessionSize === 1 ? "" : "s"}`
          : "All caught up"}
      </button>

      <p className="footnote muted">
        {stats.inDeck} of {stats.total} phrases &amp; exchanges introduced.
        Stop whenever you want — your progress is saved.
      </p>
    </div>
  );
}
