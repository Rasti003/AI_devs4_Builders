import express, { Request, Response } from "express";
import path from "path";
import { createServer } from "http";
import { WebSocketServer } from "ws";
import dotenv from "dotenv";
import {
  loadLessons,
  getLesson,
  startRun,
  hasRun,
  stopRun,
  getRunning,
} from "./runLesson";

dotenv.config({ path: path.join(__dirname, "..", "..", ".env") });

const PORT = Number(process.env.PORT) || 3847;
const app = express();
const server = createServer(app);

const runSockets = new Map<string, Set<(data: string) => void>>();

const wss = new WebSocketServer({ server });

function getRunIdFromPath(url: string): string | null {
  const match = url.match(/\/ws\/run\/([^/?]+)/);
  return match ? match[1] : null;
}

wss.on("connection", (ws, req) => {
  const runId = getRunIdFromPath(String(req.url ?? ""));
  if (!runId) {
    ws.close(4000, "Bad path");
    return;
  }
  if (!hasRun(runId)) {
    ws.close(4000, "Unknown run");
    return;
  }
  const forward = (data: string) => {
    if (ws.readyState === 1) ws.send(data);
  };
  let set = runSockets.get(runId);
  if (!set) {
    set = new Set();
    runSockets.set(runId, set);
  }
  set.add(forward);
  ws.on("close", () => {
    set?.delete(forward);
    if (set?.size === 0) runSockets.delete(runId);
  });
});

app.use(express.json());

app.get("/api/lessons", (_req: Request, res: Response) => {
  try {
    const lessons = loadLessons();
    res.json(lessons);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

app.get("/api/lessons/running", (_req: Request, res: Response) => {
  try {
    const running = getRunning();
    res.json({ running });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

app.post("/api/lessons/:id/run", (req: Request, res: Response) => {
  const id = String(req.params.id ?? "");
  const lesson = getLesson(id);
  if (!lesson) {
    return res.status(404).json({ error: `Unknown lesson: ${id}` });
  }

  const runId = `${id}-${Date.now()}`;
  runSockets.set(runId, new Set());

  startRun(
    id,
    (chunk) => {
      const set = runSockets.get(runId);
      if (set) set.forEach((send) => send(chunk));
    },
    (code) => {
      const set = runSockets.get(runId);
      if (set) {
        set.forEach((send) => send(`\n[Process exited with code ${code}]\n`));
        runSockets.delete(runId);
      }
    },
    runId
  );

  res.json({ runId, wsPath: `/ws/run/${runId}` });
});

app.post("/api/lessons/run/:runId/stop", (req: Request, res: Response) => {
  const stopped = stopRun(String(req.params.runId ?? ""));
  res.json({ ok: stopped });
});

const clientDist = path.join(__dirname, "..", "..", "client", "dist");
app.use(express.static(clientDist));
app.get("/{*path}", (_req: Request, res: Response) => {
  res.sendFile(path.join(clientDist, "index.html"), (err) => {
    if (err) res.status(404).send("Build client first: cd client && npm run build");
  });
});

server.listen(PORT, () => {
  console.log(`[dashboard] http://localhost:${PORT}`);
});
