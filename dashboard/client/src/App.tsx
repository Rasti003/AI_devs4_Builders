import { useState } from "react";
import { LessonList } from "./components/LessonList";
import { TerminalView } from "./components/TerminalView";

export default function App() {
  const [lessonId, setLessonId] = useState<string | null>(null);
  const [lessonLabel, setLessonLabel] = useState<string>("");
  const [runningLessonIds, setRunningLessonIds] = useState<Set<string>>(new Set());

  const handleRun = (id: string, label: string) => {
    setLessonId(id);
    setLessonLabel(label);
    setRunningLessonIds((prev) => new Set(prev).add(id));
  };

  const handleCloseTerminal = () => {
    setLessonId(null);
    setLessonLabel("");
  };

  const handleRunEnded = (id: string) => {
    setRunningLessonIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1 className="app-title">
          <span className="app-title-prefix">[SPK]</span>
          AI_DEVS4 // AGENT_TERMINAL
        </h1>
        <span className="app-subtitle">
          ▸ system przesyłek konduktorskich &nbsp;·&nbsp; rok systemu 14 &nbsp;·&nbsp; węzeł centralny
        </span>
        <div className="app-status-bar">
          <span><span className="app-status-dot" />NET_OK</span>
          <span>AUTH: {runningLessonIds.size > 0 ? "ACTIVE" : "IDLE"}</span>
          <span>PROC: {runningLessonIds.size}</span>
        </div>
      </header>
      <main className="app-main">
        <aside className="app-sidebar">
          <LessonList
            onRun={handleRun}
            activeLessonId={lessonId}
            runningLessonIds={runningLessonIds}
          />
        </aside>
        <section className="app-center">
          {lessonId ? (
            <TerminalView
              lessonId={lessonId}
              lessonLabel={lessonLabel}
              onClose={handleCloseTerminal}
              onRunEnded={handleRunEnded}
            />
          ) : (
            <div className="app-placeholder">
              <pre className="app-placeholder-ascii">{`
 ██████╗ ██████╗ ███████╗
██╔════╝ ██╔══██╗██╔════╝
╚█████╗  ██████╔╝█████╗
 ╚═══██╗ ██╔═══╝ ██╔══╝
██████╔╝ ██║     ███████╗
╚═════╝  ╚═╝     ╚══════╝
              `}</pre>
              <span className="app-placeholder-text">▸ wybierz moduł i naciśnij [RUN] _</span>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
