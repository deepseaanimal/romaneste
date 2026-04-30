import { useEffect, useState } from "react";
import type { AppState } from "./types";
import { load, save, todayKey, exportState, importState } from "./storage";
import { Home } from "./components/Home";
import { Session } from "./components/Session";
import "./App.css";

function unlockAudio() {
  try {
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const buf = ctx.createBuffer(1, 1, 22050);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    src.start(0);
    ctx.resume();
  } catch { /* ignore */ }
}

type View = "home" | "session";

export default function App() {
  const [state, setState] = useState<AppState>(() => load());
  const [view, setView] = useState<View>("home");

  useEffect(() => {
    save(state);
  }, [state]);

  function startSession() {
    unlockAudio();
    const today = todayKey();
    if (!state.daysStudied.includes(today)) {
      setState((s) => ({ ...s, daysStudied: [...s.daysStudied, today] }));
    }
    setView("session");
  }

  function handleExport() {
    exportState(state);
  }

  async function handleImport(file: File) {
    try {
      const imported = await importState(file);
      setState(imported);
    } catch (e) {
      alert((e as Error).message);
    }
  }

  function handleScenariosChange(s: import("./types").Scenario[]) {
    setState(prev => ({ ...prev, activeScenarios: s }));
  }

  return (
    <div className="app">
      {view === "home" && (
        <Home state={state} onStart={startSession}
          onExport={handleExport} onImport={handleImport}
          onScenariosChange={handleScenariosChange} />
      )}
      {view === "session" && (
        <Session state={state} onUpdate={setState} onExit={() => setView("home")} />
      )}
    </div>
  );
}
