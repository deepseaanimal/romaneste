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

type PhraseMode = "intro" | "recognize" | "type-ro" | "listen";
type DlgMode = "dlg-intro" | "dlg-respond";

type QueueItem =
  | { kind: "phrase"; phrase: Phrase; card: CardState; mode: PhraseMode }
  | { kind: "dlg"; dialogue: Dialogue; card: CardState; mode: DlgMode };

function buildQueue(state: AppState): QueueItem[] {
  const now = Date.now();
  const active = state.activeScenarios ?? [];
  const phraseById = new Map(phrases.map((p) => [p.id, p as Phrase]));
  const dlgById = new Map(dialogues.map((d) => [d.id, d as Dialogue]));

  const duePhrases: CardState[] = [];
  const newPhrases: CardState[] = [];
  const dueDlg: CardState[] = [];
  const newDlg: CardState[] = [];

  for (const p of phrases) {
    if (active.length && !active.includes(p.scenario as never)) continue;
    const c = state.cards[p.id];
    if (!c) continue;
    if (isNew(c)) newPhrases.push(c);
    else if (isDue(c, now)) duePhrases.push(c);
  }
  for (const d of dialogues) {
    if (active.length && !active.includes(d.scenario as never)) continue;
    const c = state.dlgCards[d.id];
    if (!c) continue;
    if (isNew(c)) newDlg.push(c);
    else if (isDue(c, now)) dueDlg.push(c);
  }

  duePhrases.sort((a, b) => a.dueAt - b.dueAt);
  dueDlg.sort((a, b) => a.dueAt - b.dueAt);

  const newPhrasesToday = newPhrases.slice(0, Math.max(1, state.newPerDay - 2));
  const newDlgToday = newDlg.slice(0, 2);
  const reviewPhrases = duePhrases.slice(0, state.reviewLimit);
  const reviewDlg = dueDlg.slice(0, Math.floor(state.reviewLimit / 3));

  // Warmup: 2 highest-ease reviews first (familiar = confidence boost)
  const byEaseDesc = [...reviewPhrases].sort((a, b) => b.ease - a.ease);
  const warmupIds = new Set(byEaseDesc.slice(0, Math.min(2, reviewPhrases.length)).map(c => c.id));
  const warmupPhrases = reviewPhrases.filter(c => warmupIds.has(c.id));
  const remainingReviews = reviewPhrases.filter(c => !warmupIds.has(c.id));

  const queue: QueueItem[] = [];

  // Warmup first
  for (const c of warmupPhrases) {
    const p = phraseById.get(c.id)!;
    queue.push({ kind: "phrase", phrase: p, card: c, mode: c.reps % 2 === 0 ? "type-ro" : "listen" });
  }

  // Build review pool
  const reviewItems: QueueItem[] = [];
  for (const c of remainingReviews) {
    const p = phraseById.get(c.id)!;
    reviewItems.push({ kind: "phrase", phrase: p, card: c, mode: c.reps % 2 === 0 ? "type-ro" : "listen" });
  }
  for (const c of reviewDlg) {
    const d = dlgById.get(c.id)!;
    reviewItems.push({ kind: "dlg", dialogue: d, card: c, mode: "dlg-respond" });
  }

  // New items: intro + recognize for phrases, intro for dialogues
  const newItems: QueueItem[] = [];
  for (const c of newPhrasesToday) {
    const p = phraseById.get(c.id)!;
    newItems.push({ kind: "phrase", phrase: p, card: c, mode: "intro" });
    newItems.push({ kind: "phrase", phrase: p, card: c, mode: "recognize" });
  }
  for (const c of newDlgToday) {
    const d = dlgById.get(c.id)!;
    newItems.push({ kind: "dlg", dialogue: d, card: c, mode: "dlg-intro" });
  }

  // Interleave: every 3 reviews insert 1 new card
  let newIdx = 0;
  for (let i = 0; i < reviewItems.length; i++) {
    queue.push(reviewItems[i]);
    if ((i + 1) % 3 === 0 && newIdx < newItems.length) {
      queue.push(newItems[newIdx++]);
    }
  }
  while (newIdx < newItems.length) queue.push(newItems[newIdx++]);

  // Hard cap: max 12 cards per session
  return queue.slice(0, 12);
}

function getRecognizeOptions(phrase: Phrase): string[] {
  const pool = phrases.filter(p => p.id !== phrase.id && p.ro.split(" ").length <= 6);
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  const distractors = shuffled.slice(0, 3).map(p => p.ro);
  return [phrase.ro, ...distractors].sort(() => Math.random() - 0.5);
}

function buildTilePool(dialogue: Dialogue): string[] {
  // All unique words from all valid responses
  const answerWords = [...new Set(
    dialogue.responses.flatMap(r => r.ro.replace(/[.,!?]/g, "").split(" ").filter(Boolean))
  )];
  // Distractors: words from phrase pool not already in answers
  const answerSet = new Set(answerWords.map(w => w.toLowerCase()));
  const distractorPool = phrases
    .flatMap(p => p.ro.replace(/[.,!?]/g, "").split(" "))
    .filter(w => w.length > 2 && !answerSet.has(w.toLowerCase()));
  const distractors = [...new Set(distractorPool)]
    .sort(() => Math.random() - 0.5)
    .slice(0, 3);
  return [...answerWords, ...distractors].sort(() => Math.random() - 0.5);
}

export function Session({ state, onUpdate, onExit }: Props) {
  const [queue, setQueue] = useState<QueueItem[]>(() => buildQueue(state));
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [typed, setTyped] = useState("");
  const [showRu, setShowRu] = useState(false);
  const [showNote, setShowNote] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [correct, setCorrect] = useState(0);
  const [graded, setGraded] = useState(0);

  // New UX states
  const [introStep, setIntroStep] = useState(0);
  const [, setListenPhase] = useState<"listen" | "type">("listen");
  const [hintCount, setHintCount] = useState(0);
  const [dlgResponseCount, setDlgResponseCount] = useState(1);
  const [recognizeOptions, setRecognizeOptions] = useState<string[]>([]);
  const [recognizeChosen, setRecognizeChosen] = useState<string | null>(null);
  // Word bank states
  const [tilePool, setTilePool] = useState<string[]>([]);
  const [tileBuilt, setTileBuilt] = useState<string[]>([]);
  const [useTyping, setUseTyping] = useState(false);

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
    setIntroStep(0);
    setListenPhase("listen");
    setHintCount(0);
    setDlgResponseCount(1);
    setRecognizeChosen(null);
    setTileBuilt([]);
    setUseTyping(false);

    if (!current) return;

    if (current.kind === "phrase" && current.mode === "recognize") {
      setRecognizeOptions(getRecognizeOptions(current.phrase));
    }

    if (current.kind === "dlg" && current.mode === "dlg-respond") {
      setTilePool(buildTilePool(current.dialogue));
    }

    // Auto-focus input for typing modes (not listen phase 1)
    const isTyping = current.kind === "phrase"
      ? current.mode === "type-ro"
      : current.mode === "dlg-respond";
    if (isTyping) setTimeout(() => inputRef.current?.focus(), 50);

    // Auto-play for intro (step 0) and dlg-respond
    const autoPlay = (current.kind === "phrase" && current.mode === "intro") ||
      (current.kind === "dlg" && current.mode === "dlg-respond");
    if (autoPlay) setTimeout(() => audioRef.current?.play().catch(() => {}), 200);
  }, [index]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Done screen ────────────────────────────────────────────────
  if (!current) {
    const pct = graded > 0 ? Math.round((correct / graded) * 100) : null;
    return (
      <div className="session done">
        <h2>{farewell}</h2>
        {pct !== null && (
          <p className="accuracy-stat">
            <span className="accuracy-num">{pct}%</span>
            <span className="muted"> correct · {graded} card{graded === 1 ? "" : "s"}</span>
          </p>
        )}
        <button className="primary" onClick={onExit}>Back home</button>
      </div>
    );
  }

  // ── Grading ────────────────────────────────────────────────────
  function grade(g: Grade, isDlg = false) {
    const cardKey = isDlg ? "dlgCards" : "cards";
    const updatedCard = applyGrade(current.card, g);
    onUpdate({ ...state, [cardKey]: { ...state[cardKey], [current.card.id]: updatedCard } });
    const isIntro = current.kind === "phrase"
      ? (current.mode === "intro" || current.mode === "recognize")
      : current.mode === "dlg-intro";
    if (!isIntro) {
      setGraded(n => n + 1);
      if (g === "good" || g === "easy") setCorrect(n => n + 1);
    }
    if (g === "again") {
      const reinsert = { ...current, card: updatedCard } as QueueItem;
      const newQueue = [...queue];
      newQueue.splice(Math.min(queue.length, index + 3), 0, reinsert);
      setQueue(newQueue);
    }
    setIndex(i => i + 1);
  }

  // Recognize: doesn't touch SM-2 state on correct, resets on wrong
  function gradeRecognize(chosen: string) {
    if (recognizeChosen) return;
    setRecognizeChosen(chosen);
    const correct_ = current.kind === "phrase" && current.mode === "recognize"
      && chosen === current.phrase.ro;
    setGraded(n => n + 1);
    if (correct_) setCorrect(n => n + 1);
    setTimeout(() => {
      if (!correct_ && current.kind === "phrase") {
        // Wrong: reinsert as recognize again + update card
        const updatedCard = applyGrade(current.card, "again");
        onUpdate({ ...state, cards: { ...state.cards, [current.card.id]: updatedCard } });
        const reinsert = { ...current, card: updatedCard } as QueueItem;
        const newQueue = [...queue];
        newQueue.splice(Math.min(queue.length, index + 3), 0, reinsert);
        setQueue(newQueue);
      }
      setIndex(i => i + 1);
    }, 900);
  }

  const sessionHeader = (
    <>
      <button className="exit" onClick={onExit}>← exit</button>
      <div className="progress">{index + 1} / {queue.length}</div>
    </>
  );

  // ── Phrase: intro (2 steps: listen → read+translate) ──────────
  if (current.kind === "phrase" && current.mode === "intro") {
    const { phrase } = current;
    const src = `${base}audio/${phrase.id}.m4a`;
    return (
      <div className="session">
        {sessionHeader}
        <audio ref={audioRef} src={src} preload="auto" playsInline />
        <div className="card intro">
          <div className="badge">new phrase</div>

          {introStep === 0 && (
            <>
              {phrase.context && <p className="context-scene">📍 {phrase.context}</p>}
              <p className="intro-prompt muted">Listen first.</p>
              <button className="audio big" onClick={() => audioRef.current?.play()}>▶ Play audio</button>
              <button onClick={() => setIntroStep(1)}>Show me →</button>
            </>
          )}

          {introStep >= 1 && (
            <>
              {phrase.context && <p className="context-scene">📍 {phrase.context}</p>}
              <div className="ro big">{phrase.ro}</div>
              <div className="en">{phrase.en}</div>
              <button className="audio" onClick={() => audioRef.current?.play()}>▶ Hear it again</button>
              {phrase.note && <Details label="note" text={phrase.note} open={showNote} onToggle={setShowNote} />}
              {phrase.ru && <Details label="russian" text={phrase.ru} open={showRu} onToggle={setShowRu} />}
              <div className="grade-row">
                <button onClick={() => grade("good")}>Got it →</button>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  // ── Phrase: recognize (multiple choice) ───────────────────────
  if (current.kind === "phrase" && current.mode === "recognize") {
    const { phrase } = current;
    return (
      <div className="session">
        {sessionHeader}
        <div className="card">
          <div className="badge">which one means…</div>
          <div className="en big">{phrase.en}</div>
          <div className="recognize-grid">
            {recognizeOptions.map(opt => {
              const isChosen = recognizeChosen === opt;
              const isCorrectOpt = opt === phrase.ro;
              let cls = "recognize-opt";
              if (recognizeChosen) {
                if (isCorrectOpt) cls += " opt-correct";
                else if (isChosen) cls += " opt-wrong";
              }
              return (
                <button key={opt} className={cls}
                  onClick={() => gradeRecognize(opt)}
                  disabled={recognizeChosen !== null}>
                  {opt}
                </button>
              );
            })}
          </div>
          {recognizeChosen && (
            <p className="feedback muted">
              {recognizeChosen === phrase.ro ? "✓ Correct!" : `✗ It's "${phrase.ro}"`}
            </p>
          )}
        </div>
      </div>
    );
  }

  // ── Phrase: listen (meaning first → hear → did you get it?) ──
  if (current.kind === "phrase" && current.mode === "listen") {
    const { phrase } = current;
    const src = `${base}audio/${phrase.id}.m4a`;
    return (
      <div className="session">
        {sessionHeader}
        <audio ref={audioRef} src={src} preload="auto" playsInline />
        <div className="card review">
          <div className="badge">do you recognize it?</div>
          {phrase.context && <p className="context-scene">📍 {phrase.context}</p>}
          <p className="muted" style={{ margin: 0, fontSize: "0.9rem" }}>This means:</p>
          <div className="en big">{phrase.en}</div>
          <button className="audio big" onClick={() => audioRef.current?.play()}>▶ Play</button>
          {!revealed ? (
            <div className="grade-row" style={{ marginTop: 8 }}>
              <button className="g-good" onClick={() => { grade("good", false); }}>✓ Got it</button>
              <button className="g-again" onClick={() => { setRevealed(true); }}>✗ Not sure</button>
            </div>
          ) : (
            <>
              <div className="ro big">{phrase.ro}</div>
              {phrase.note && <Details label="note" text={phrase.note} open={showNote} onToggle={setShowNote} />}
              {phrase.ru && <Details label="russian" text={phrase.ru} open={showRu} onToggle={setShowRu} />}
              <div className="grade-row">
                <button className="g-again" onClick={() => grade("again", false)}>Again</button>
                <button className="g-hard" onClick={() => grade("hard", false)}>Hard</button>
                <button className="g-good" onClick={() => grade("good", false)}>Good</button>
                <button className="g-easy" onClick={() => grade("easy", false)}>Easy</button>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  // ── Phrase: type-ro (with hints) ──────────────────────────────
  if (current.kind === "phrase") {
    const { phrase } = current;
    const src = `${base}audio/${phrase.id}.m4a`;
    const words = phrase.ro.split(" ");

    function reveal() { setRevealed(true); audioRef.current?.play().catch(() => {}); }
    function checkAndReveal() {
      setFeedback(matches(typed, phrase.ro) ? "Yes, that's it." : "Almost — have a look.");
      reveal();
    }

    const hintText = hintCount > 0
      ? words.slice(0, hintCount).join(" ") + (hintCount < words.length ? "…" : "")
      : null;

    return (
      <div className="session">
        {sessionHeader}
        <audio ref={audioRef} src={src} preload="auto" playsInline />
        <div className="card review">
          <div className="badge">type the Romanian</div>
          {phrase.context && <p className="context-scene">📍 {phrase.context}</p>}
          <div className="en big">{phrase.en}</div>
          {!revealed ? (
            <>
              {hintText && <p className="hint-text muted">{hintText}</p>}
              <input ref={inputRef} type="text" value={typed}
                onChange={e => setTyped(e.target.value)}
                onKeyDown={e => e.key === "Enter" && checkAndReveal()}
                placeholder="type here…"
                autoCapitalize="none" autoCorrect="off" spellCheck={false} />
              <div className="actions">
                <button onClick={checkAndReveal}>Check</button>
                <button className="ghost" onClick={() => setHintCount(h => Math.min(h + 1, words.length))}>
                  {hintCount === 0 ? "Hint" : "More…"}
                </button>
                <button className="ghost" onClick={() => { setTyped(""); reveal(); }}>Skip</button>
              </div>
            </>
          ) : (
            <RevealPhrase phrase={phrase} feedback={feedback} audio={audioRef}
              onGrade={g => grade(g, false)}
              showRu={showRu} setShowRu={setShowRu}
              showNote={showNote} setShowNote={setShowNote} />
          )}
        </div>
      </div>
    );
  }

  // ── Dialogue: intro (cumulative responses) ────────────────────
  if (current.kind === "dlg" && current.mode === "dlg-intro") {
    const { dialogue } = current;
    const promptSrc = `${base}audio/${dialogue.id}-prompt.m4a`;
    const shown = dialogue.responses.slice(0, dlgResponseCount);
    const hasMore = dlgResponseCount < dialogue.responses.length;
    return (
      <div className="session">
        {sessionHeader}
        <audio ref={audioRef} src={promptSrc} preload="auto" playsInline />
        <div className="card intro">
          <div className="badge">new exchange</div>
          <div className="dlg-label muted">someone says:</div>
          <div className="ro big">{dialogue.prompt}</div>
          <div className="en">{dialogue.promptEn}</div>
          <button className="audio" onClick={() => audioRef.current?.play()}>▶ Hear the prompt</button>
          <div className="dlg-label muted" style={{ marginTop: 8 }}>
            you could say ({dlgResponseCount} of {dialogue.responses.length}):
          </div>
          <div className="response-list">
            {shown.map((r, i) => (
              <ResponseItem key={i} ro={r.ro} en={r.en}
                src={`${base}audio/${dialogue.id}-r${i}.m4a`} />
            ))}
          </div>
          {dialogue.note && <Details label="note" text={dialogue.note} open={showNote} onToggle={setShowNote} />}
          <div className="grade-row">
            {hasMore
              ? <button onClick={() => setDlgResponseCount(c => c + 1)}>+ Show next option</button>
              : <button onClick={() => grade("good", true)}>Got it — practice me</button>
            }
          </div>
        </div>
      </div>
    );
  }

  // ── Dialogue: respond (chat bubble + word bank) ───────────────
  if (current.kind === "dlg") {
    const { dialogue } = current;
    const promptSrc = `${base}audio/${dialogue.id}-prompt.m4a`;

    function checkDlg(sentence: string) {
      const hit = dialogue.responses.find(r => matches(sentence, r.ro));
      setFeedback(hit ? `✓ "${hit.ro}"` : "Not quite — see options below.");
      setRevealed(true);
      audioRef.current?.play().catch(() => {});
    }

    function addTile(idx: number) {
      const word = tilePool[idx];
      setTilePool(p => p.filter((_, i) => i !== idx));
      setTileBuilt(b => [...b, word]);
    }

    function removeTile(idx: number) {
      const word = tileBuilt[idx];
      setTileBuilt(b => b.filter((_, i) => i !== idx));
      setTilePool(p => [...p, word].sort(() => Math.random() - 0.5));
    }

    const builtSentence = tileBuilt.join(" ");

    return (
      <div className="session">
        {sessionHeader}
        <audio ref={audioRef} src={promptSrc} preload="auto" playsInline />
        <div className="chat-view">

          {/* Their message */}
          <div className="bubble-row them">
            <div className="bubble bubble-them">
              <div className="bubble-ro">{dialogue.prompt}</div>
              <div className="bubble-en">{dialogue.promptEn}</div>
            </div>
            <button className="audio sm bubble-audio" onClick={() => audioRef.current?.play()}>▶</button>
          </div>

          {!revealed ? (
            <>
              {/* Word bank */}
              {!useTyping ? (
                <div className="tile-area">
                  <div className="tile-built">
                    {tileBuilt.length === 0
                      ? <span className="tile-placeholder">tap words to build your reply…</span>
                      : tileBuilt.map((w, i) => (
                          <button key={i} className="tile tile-selected" onClick={() => removeTile(i)}>{w}</button>
                        ))
                    }
                  </div>
                  <div className="tile-pool">
                    {tilePool.map((w, i) => (
                      <button key={i} className="tile" onClick={() => addTile(i)}>{w}</button>
                    ))}
                  </div>
                  <div className="actions">
                    <button onClick={() => checkDlg(builtSentence)} disabled={tileBuilt.length === 0}>Check</button>
                    <button className="ghost" onClick={() => setUseTyping(true)}>Type instead</button>
                    <button className="ghost" onClick={() => { setRevealed(true); setFeedback(null); }}>Show me</button>
                  </div>
                </div>
              ) : (
                /* Typing fallback */
                <div className="tile-area">
                  <input ref={inputRef} type="text" value={typed}
                    onChange={e => setTyped(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && checkDlg(typed)}
                    placeholder="type in Romanian…"
                    autoCapitalize="none" autoCorrect="off" spellCheck={false} />
                  <div className="actions">
                    <button onClick={() => checkDlg(typed)}>Check</button>
                    <button className="ghost" onClick={() => { setRevealed(true); setFeedback(null); }}>Show me</button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <>
              {/* Their reply bubble (user's attempt or correct answer) */}
              {(builtSentence || typed) && (
                <div className="bubble-row me">
                  <div className={`bubble bubble-me ${feedback && !feedback.startsWith("✓") ? "bubble-wrong" : ""}`}>
                    {builtSentence || typed}
                  </div>
                </div>
              )}

              {feedback && <p className="feedback muted" style={{ textAlign: "center" }}>{feedback}</p>}

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
            </>
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
