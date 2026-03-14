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
        <div className="app-header-left">
          <h1 className="app-title">
            <span className="app-title-bracket">[</span>
            R-NET
            <span className="app-title-bracket">]</span>
            <span className="app-title-sep"> // </span>
            UNIT-05
          </h1>
          <span className="app-subtitle">
            resistance network &nbsp;·&nbsp; temporal operative &nbsp;·&nbsp; anchor year 2026
          </span>
        </div>
        <div className="app-status-bar">
          <span className="app-status-item">
            <span className="app-status-dot" />
            UPLINK_OK
          </span>
          <span className="app-status-item">
            CLEARANCE: <span className="app-status-value">SHADOW-TIER</span>
          </span>
          <span className="app-status-item">
            ACTIVE_OPS: <span className="app-status-value">{runningLessonIds.size}</span>
          </span>
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
 _   _ _   _ ___ _____      ___  ____
| | | | \\ | |_ _|_   _|    / _ \\| ___|
| | | |  \\| || |  | |_____| | | |___ \\
| |_| | |\\  || |  | |_____| |_| |___) |
 \\___/|_| \\_|___| |_|      \\___/|____/
`}</pre>
              <div className="app-placeholder-tagline">
                "The future is not written. We write it."
              </div>
              <span className="app-placeholder-text">
                ▸ select mission and press [EXECUTE] _
              </span>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
