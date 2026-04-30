import { useEffect, useState } from "react";
import type { AppState } from "./types";
import { load, save, todayKey } from "./storage";
import { Home } from "./components/Home";
import { Session } from "./components/Session";
import "./App.css";

type View = "home" | "session";

export default function App() {
  const [state, setState] = useState<AppState>(() => load());
  const [view, setView] = useState<View>("home");

  useEffect(() => {
    save(state);
  }, [state]);

  function startSession() {
    const today = todayKey();
    if (!state.daysStudied.includes(today)) {
      setState((s) => ({ ...s, daysStudied: [...s.daysStudied, today] }));
    }
    setView("session");
  }

  return (
    <div className="app">
      {view === "home" && <Home state={state} onStart={startSession} />}
      {view === "session" && (
        <Session state={state} onUpdate={setState} onExit={() => setView("home")} />
      )}
    </div>
  );
}
