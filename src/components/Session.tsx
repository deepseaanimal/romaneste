import { useEffect, useMemo, useRef, useState } from "react";
import type { AppState, CardState, Dialogue, Grade, Phrase } from "../types";
import { applyGrade, isDue, isNew } from "../scheduler";
import { matches } from "../normalize";
import phrases from "../data/phrases.json";
import dialogues from "../data/dialogues.json";
import { allDoneToday, pick } from "../copy";

interface Props {
  state: AppState;
  onUpdate: (next: AppState) => void;
  onExit: () => void;
}

type PhraseMode = "intro" | "type-ro" | "listen";
type DlgMode = "dlg-intro" | "dlg-respond";

type QueueItem =
  | { kind: "phrase"; phrase: Phrase; card: CardState; mode: PhraseMode }
  | { kind: "dlg"; dialogue: Dialogue; card: CardState; mode: DlgMode };

function buildQueue(state: AppState): QueueItem[] {
  const now = Date.now();
  const phraseById = new Map(phrases.map((p) => [p.id, p as Phrase]));
  const dlgById = new Map(dialogues.map((d) => [d.id, d as Dialogue]));

  const duePhrases: CardState[] = [];
  const newPhrases: CardState[] = [];
  const dueDlg: CardState[] = [];
  const newDlg: CardState[] = [];

  for (const p of phrases) {
    const c = state.cards[p.id];
    if (!c) continue;
    if (isNew(c)) newPhrases.push(c);
    else if (isDue(c, now)) duePhrases.push(c);
  }
  for (const d of dialogues) {
    const c = state.dlgCards[d.id];
    if (!c) continue;
    if (isNew(c)) newDlg.push(c);
    else if (isDue(c, now)) dueDlg.push(c);
  }

  duePhrases.sort((a, b) => a.dueAt - b.dueAt);
  dueDlg.sort((a, b) => a.dueAt - b.dueAt);

  // Budget: 3 new phrases + 2 new dialogues per session (total ~5 new)
  const newPhrasesToday = newPhrases.slice(0, Math.max(1, state.newPerDay - 2));
  const newDlgToday = newDlg.slice(0, 2);
  const reviewPhrases = duePhrases.slice(0, state.reviewLimit);
  const reviewDlg = dueDlg.slice(0, Math.floor(state.reviewLimit / 3));

  const queue: QueueItem[] = [];

  for (const c of reviewPhrases) {
    const p = phraseById.get(c.id)!;
    queue.push({ kind: "phrase", phrase: p, card: c, mode: c.reps % 2 === 0 ? "type-ro" : "listen" });
  }
  for (const c of reviewDlg) {
    const d = dlgById.get(c.id)!;
    queue.push({ kind: "dlg", dialogue: d, card: c, mode: "dlg-respond" });
  }
  for (const c of newPhrasesToday) {
    const p = phraseById.get(c.id)!;
    queue.push({ kind: "phrase", phrase: p, card: c, mode: "intro" });
  }
  for (const c of newDlgToday) {
    const d = dlgById.get(c.id)!;
    queue.push({ kind: "dlg", dialogue: d, card: c, mode: "dlg-intro" });
  }

  return queue;
}

export function Session({ state, onUpdate, onExit }: Props) {
  const [queue, setQueue] = useState<QueueItem[]>(() => buildQueue(state));
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [typed, setTyped] = useState("");
  const [showRu, setShowRu] = useState(false);
  const [showNote, setShowNote] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const farewell = useMemo(() => pick(allDoneToday), []);
  const base = import.meta.env.BASE_URL;

  const current = queue[index];

  useEffect(() => {
    setRevealed(false);
    setTyped("");
    setShowRu(false);
    setShowNote(false);
    setFeedback(null);
    if (!current) return;
    const isTyping = current.kind === "phrase"
      ? current.mode !== "intro"
      : current.mode === "dlg-respond";
    if (isTyping) setTimeout(() => inputRef.current?.focus(), 50);
    const autoPlay = current.kind === "phrase"
      ? current.mode === "listen"
      : current.mode === "dlg-respond";
    if (autoPlay) setTimeout(() => audioRef.current?.play().catch(() => {}), 150);
  }, [index]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!current) {
    return (
      <div className="session done">
        <h2>{farewell}</h2>
        <button className="primary" onClick={onExit}>Back home</button>
      </div>
    );
  }

  function grade(g: Grade, isDlg = false) {
    const cardKey = isDlg ? "dlgCards" : "cards";
    const updatedCard = applyGrade(current.card, g);
    const next: AppState = {
      ...state,
      [cardKey]: { ...state[cardKey], [current.card.id]: updatedCard },
    };
    onUpdate(next);
    if (g === "again") {
      const reinsert: QueueItem = { ...current, card: updatedCard } as QueueItem;
      const newQueue = [...queue];
      newQueue.splice(Math.min(queue.length, index + 3), 0, reinsert);
      setQueue(newQueue);
    }
    setIndex((i) => i + 1);
  }

  // ── Phrase: intro ──────────────────────────────────────────────
  if (current.kind === "phrase" && current.mode === "intro") {
    const { phrase } = current;
    const src = `${base}audio/${phrase.id}.m4a`;
    return (
      <div className="session">
        <button className="exit" onClick={onExit}>← exit</button>
        <div className="progress">{index + 1} / {queue.length}</div>
        <audio ref={audioRef} src={src} preload="auto" playsInline />
        <div className="card intro">
          <div className="badge">new phrase</div>
          <div className="ro big">{phrase.ro}</div>
          <div className="en">{phrase.en}</div>
          <button className="audio" onClick={() => audioRef.current?.play()}>▶ Play audio</button>
          {phrase.note && <Details label="note" text={phrase.note} open={showNote} onToggle={setShowNote} />}
          {phrase.ru && <Details label="russian" text={phrase.ru} open={showRu} onToggle={setShowRu} />}
          <div className="grade-row"><button onClick={() => grade("good")}>Got it — review me</button></div>
        </div>
      </div>
    );
  }

  // ── Phrase: type-ro or listen ──────────────────────────────────
  if (current.kind === "phrase") {
    const { phrase, mode } = current;
    const src = `${base}audio/${phrase.id}.m4a`;

    function reveal() {
      setRevealed(true);
      audioRef.current?.play().catch(() => {});
    }
    function checkAndReveal() {
      setFeedback(matches(typed, phrase.ro) ? "Yes, that's it." : "Almost — have a look.");
      reveal();
    }

    return (
      <div className="session">
        <button className="exit" onClick={onExit}>← exit</button>
        <div className="progress">{index + 1} / {queue.length}</div>
        <audio ref={audioRef} src={src} preload="auto" playsInline />
        <div className="card review">
          <div className="badge">{mode === "listen" ? "listen and type what you hear" : "type the Romanian"}</div>
          {mode === "listen"
            ? <button className="audio big" onClick={() => audioRef.current?.play()}>▶ Play again</button>
            : <div className="en big">{phrase.en}</div>}
          {!revealed ? (
            <>
              <input ref={inputRef} type="text" value={typed}
                onChange={(e) => setTyped(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && checkAndReveal()}
                placeholder={mode === "listen" ? "what did you hear?" : "type here…"}
                autoCapitalize="none" autoCorrect="off" spellCheck={false} />
              <div className="actions">
                <button onClick={checkAndReveal}>Check</button>
                <button className="ghost" onClick={() => { setTyped(""); reveal(); }}>
                  {mode === "listen" ? "Show me" : "I don't know"}
                </button>
              </div>
            </>
          ) : (
            <RevealPhrase phrase={phrase} feedback={feedback} audio={audioRef}
              onGrade={(g) => grade(g, false)}
              showRu={showRu} setShowRu={setShowRu}
              showNote={showNote} setShowNote={setShowNote} />
          )}
        </div>
      </div>
    );
  }

  // ── Dialogue: intro ────────────────────────────────────────────
  if (current.kind === "dlg" && current.mode === "dlg-intro") {
    const { dialogue } = current;
    const promptSrc = `${base}audio/${dialogue.id}-prompt.m4a`;
    return (
      <div className="session">
        <button className="exit" onClick={onExit}>← exit</button>
        <div className="progress">{index + 1} / {queue.length}</div>
        <audio ref={audioRef} src={promptSrc} preload="auto" playsInline />
        <div className="card intro">
          <div className="badge">new exchange</div>
          <div className="dlg-label muted">someone says:</div>
          <div className="ro big">{dialogue.prompt}</div>
          <div className="en">{dialogue.promptEn}</div>
          <button className="audio" onClick={() => audioRef.current?.play()}>▶ Hear the prompt</button>
          <div className="dlg-label muted" style={{ marginTop: 8 }}>you could say:</div>
          <div className="response-list">
            {dialogue.responses.map((r, i) => (
              <ResponseItem key={i} ro={r.ro} en={r.en}
                src={`${base}audio/${dialogue.id}-r${i}.m4a`} />
            ))}
          </div>
          {dialogue.note && <Details label="note" text={dialogue.note} open={showNote} onToggle={setShowNote} />}
          <div className="grade-row"><button onClick={() => grade("good", true)}>Got it — practice me</button></div>
        </div>
      </div>
    );
  }

  // ── Dialogue: respond ──────────────────────────────────────────
  if (current.kind === "dlg") {
    const { dialogue } = current;
    const promptSrc = `${base}audio/${dialogue.id}-prompt.m4a`;

    function checkAndRevealDlg() {
      const hit = dialogue.responses.find((r) => matches(typed, r.ro));
      setFeedback(hit ? `Yes — "${hit.ro}"` : "Not quite — see the options below.");
      setRevealed(true);
      audioRef.current?.play().catch(() => {});
    }

    return (
      <div className="session">
        <button className="exit" onClick={onExit}>← exit</button>
        <div className="progress">{index + 1} / {queue.length}</div>
        <audio ref={audioRef} src={promptSrc} preload="auto" playsInline />
        <div className="card review">
          <div className="badge">respond</div>
          <div className="dlg-label muted">they say:</div>
          <div className="ro big">{dialogue.prompt}</div>
          <button className="audio" onClick={() => audioRef.current?.play()}>▶ Hear again</button>
          {!revealed ? (
            <>
              <input ref={inputRef} type="text" value={typed}
                onChange={(e) => setTyped(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && checkAndRevealDlg()}
                placeholder="your response in Romanian…"
                autoCapitalize="none" autoCorrect="off" spellCheck={false} />
              <div className="actions">
                <button onClick={checkAndRevealDlg}>Check</button>
                <button className="ghost" onClick={() => { setTyped(""); setRevealed(true); }}>Show me</button>
              </div>
            </>
          ) : (
            <div className="reveal">
              {feedback && <p className="feedback muted">{feedback}</p>}
              <div className="dlg-label muted">valid responses:</div>
              <div className="response-list">
                {dialogue.responses.map((r, i) => (
                  <ResponseItem key={i} ro={r.ro} en={r.en}
                    src={`${base}audio/${dialogue.id}-r${i}.m4a`} />
                ))}
              </div>
              {dialogue.note && <Details label="note" text={dialogue.note} open={showNote} onToggle={setShowNote} />}
              <div className="grade-row">
                <button className="g-again" onClick={() => grade("again", true)}>Again</button>
                <button className="g-hard" onClick={() => grade("hard", true)}>Hard</button>
                <button className="g-good" onClick={() => grade("good", true)}>Good</button>
                <button className="g-easy" onClick={() => grade("easy", true)}>Easy</button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return null;
}

// ── Sub-components ─────────────────────────────────────────────────────────

function ResponseItem({ ro, en, src }: { ro: string; en: string; src: string }) {
  const ref = useRef<HTMLAudioElement | null>(null);
  return (
    <div className="response-item">
      <audio ref={ref} src={src} preload="none" playsInline />
      <div>
        <span className="ro">{ro}</span>
        <span className="en"> — {en}</span>
      </div>
      <button className="audio sm" onClick={() => ref.current?.play().catch(() => {})}>▶</button>
    </div>
  );
}

interface RevealPhraseProps {
  phrase: Phrase;
  feedback: string | null;
  audio: React.RefObject<HTMLAudioElement | null>;
  onGrade: (g: Grade) => void;
  showRu: boolean; setShowRu: (b: boolean) => void;
  showNote: boolean; setShowNote: (b: boolean) => void;
}
function RevealPhrase({ phrase, feedback, audio, onGrade, showRu, setShowRu, showNote, setShowNote }: RevealPhraseProps) {
  return (
    <div className="reveal">
      {feedback && <p className="feedback muted">{feedback}</p>}
      <div className="ro big">{phrase.ro}</div>
      <div className="en">{phrase.en}</div>
      <button className="audio" onClick={() => audio.current?.play()}>▶ Hear it again</button>
      {phrase.note && <Details label="note" text={phrase.note} open={showNote} onToggle={setShowNote} />}
      {phrase.ru && <Details label="russian" text={phrase.ru} open={showRu} onToggle={setShowRu} />}
      <div className="grade-row">
        <button className="g-again" onClick={() => onGrade("again")}>Again</button>
        <button className="g-hard" onClick={() => onGrade("hard")}>Hard</button>
        <button className="g-good" onClick={() => onGrade("good")}>Good</button>
        <button className="g-easy" onClick={() => onGrade("easy")}>Easy</button>
      </div>
    </div>
  );
}

function Details({ label, text, open, onToggle }: { label: string; text: string; open: boolean; onToggle: (b: boolean) => void }) {
  return (
    <details open={open} onToggle={(e) => onToggle((e.target as HTMLDetailsElement).open)}>
      <summary>{label}</summary>
      <p>{text}</p>
    </details>
  );
}
