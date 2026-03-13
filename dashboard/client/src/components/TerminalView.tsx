import { useEffect, useRef, useState } from "react";

interface TerminalViewProps {
  lessonId: string;
  lessonLabel: string;
  onClose: () => void;
  onRunEnded?: (lessonId: string) => void;
}

export function TerminalView({ lessonId, lessonLabel, onClose, onRunEnded }: TerminalViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<{ write: (data: string) => void; writeln: (data: string) => void; dispose?: () => void } | null>(null);
  const fitCleanupRef = useRef<(() => void) | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [stopping, setStopping] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const container = containerRef.current;
    if (!container) return;

    const theme = {
      background: "#030a04",
      foreground: "#00ff41",
      cursor: "#00ff41",
      cursorAccent: "#030a04",
      black: "#030a04",
      red: "#ff2a00",
      green: "#00ff41",
      yellow: "#ffb300",
      blue: "#00e5ff",
      magenta: "#d78aff",
      cyan: "#00e5ff",
      white: "#c5d1de",
      brightBlack: "#2a4a2d",
      brightGreen: "#39ff14",
      brightYellow: "#ffd93d",
    };

    Promise.all([import("xterm"), import("xterm-addon-fit")]).then(([{ Terminal }, { FitAddon }]) => {
      if (cancelled) return;
      const term = new Terminal({
        theme,
        fontFamily: "'Share Tech Mono', 'JetBrains Mono', monospace",
        fontSize: 13,
        lineHeight: 1.4,
        convertEol: true,
        cursorBlink: true,
        cursorStyle: "block",
      });
      const fitAddon = new FitAddon();
      term.loadAddon(fitAddon);
      term.open(container);
      termRef.current = term;
      fitAddon.fit();

      let rafId = 0;
      let timeoutId = 0;
      const DEBOUNCE_MS = 80;
      const scheduleFit = () => {
        if (timeoutId) clearTimeout(timeoutId);
        timeoutId = window.setTimeout(() => {
          timeoutId = 0;
          rafId = requestAnimationFrame(() => {
            rafId = 0;
            if (!cancelled) fitAddon.fit();
          });
        }, DEBOUNCE_MS);
      };
      const ro = new ResizeObserver(scheduleFit);
      ro.observe(container);
      fitCleanupRef.current = () => {
        ro.disconnect();
        if (timeoutId) clearTimeout(timeoutId);
        if (rafId) cancelAnimationFrame(rafId);
      };
      term.writeln(`\x1b[33m┌─────────────────────────────────────────────┐\x1b[0m`);
      term.writeln(`\x1b[33m│ \x1b[36mMODUŁ:\x1b[0m ${lessonLabel}`);
      term.writeln(`\x1b[33m│ \x1b[36mSTATUS:\x1b[0m \x1b[32minicjalizacja...\x1b[0m`);
      term.writeln(`\x1b[33m└─────────────────────────────────────────────┘\x1b[0m`);
      term.writeln("");

      fetch(`/api/lessons/${encodeURIComponent(lessonId)}/run`, { method: "POST" })
        .then((r) => (r.ok ? r.json() : r.text().then((t) => Promise.reject(new Error(t || r.statusText)))))
        .then((data: { runId: string }) => {
          if (cancelled) return;
          const id = data.runId;
          setRunId(id);
          const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
          const wsPath = `${protocol}//${window.location.host}/ws/run/${id}`;
          const ws = new WebSocket(wsPath);
          wsRef.current = ws;
          ws.onmessage = (event) => {
            let msg = typeof event.data === "string" ? event.data : "";
            msg = msg.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
            termRef.current?.write(msg);
            if (msg.includes("[Process exited") || msg.includes("[Zatrzymano]")) {
              onRunEnded?.(lessonId);
            }
          };
          ws.onclose = () => {
            termRef.current?.writeln("\n\x1b[33m[POŁĄCZENIE ZAMKNIĘTE]\x1b[0m");
            setRunId(null);
          };
        })
        .catch((e) => {
          if (!cancelled) {
            setError(String(e.message));
            onRunEnded?.(lessonId);
          }
        });
    });

    return () => {
      cancelled = true;
      setRunId(null);
      fitCleanupRef.current?.();
      fitCleanupRef.current = null;
      termRef.current?.dispose?.();
      wsRef.current?.close();
      wsRef.current = null;
      termRef.current = null;
    };
  }, [lessonId, lessonLabel]);

  const handleStop = () => {
    if (!runId || stopping) return;
    setStopping(true);
    fetch(`/api/lessons/run/${encodeURIComponent(runId)}/stop`, { method: "POST" })
      .then(() => {
        termRef.current?.writeln?.("\n\x1b[31m[PROCES ZATRZYMANY]\x1b[0m");
        setRunId(null);
        onRunEnded?.(lessonId);
      })
      .finally(() => setStopping(false));
  };

  if (error) {
    return (
      <section className="terminal-view">
        <div className="terminal-view-header">
          <div className="terminal-view-title-wrap">
            <span className="terminal-view-indicator" style={{ background: "#ff2a00", boxShadow: "0 0 8px #ff2a00" }} />
            <span className="terminal-view-title">✖ {lessonLabel}</span>
          </div>
          <div className="terminal-view-actions">
            <button type="button" className="terminal-view-close" onClick={onClose}>
              [zamknij]
            </button>
          </div>
        </div>
        <div className="terminal-view-container" style={{ color: "#ff2a00", padding: "1rem", fontSize: "0.75rem" }}>
          ✖ błąd: {error}
        </div>
      </section>
    );
  }

  return (
    <section className="terminal-view">
      <div className="terminal-view-header">
        <div className="terminal-view-title-wrap">
          <span className="terminal-view-indicator" />
          <span className="terminal-view-title">▶ {lessonLabel}</span>
        </div>
        <div className="terminal-view-actions">
          {runId && (
            <button
              type="button"
              className="terminal-view-stop"
              onClick={handleStop}
              disabled={stopping}
              title="Zatrzymaj proces"
            >
              {stopping ? "[...]" : "[kill]"}
            </button>
          )}
          <button type="button" className="terminal-view-close" onClick={onClose}>
            [zamknij]
          </button>
        </div>
      </div>
      <div className="terminal-view-container" ref={containerRef} />
    </section>
  );
}
