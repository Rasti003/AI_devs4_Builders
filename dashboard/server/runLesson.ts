import { spawn, ChildProcess } from "child_process";
import path from "path";
import fs from "fs";

export interface LessonConfig {
  id: string;
  label: string;
  cwd: string;
  command: string;
  args: string[];
  longRunning?: boolean;
}

let lessonsCache: LessonConfig[] | null = null;

function getDashboardRoot(): string {
  const envRoot = process.env.ROOT_DIR;
  const dashboardDir = path.join(__dirname, "..", "..");
  if (envRoot) {
    return path.isAbsolute(envRoot) ? envRoot : path.join(dashboardDir, envRoot);
  }
  return path.join(dashboardDir, "..");
}

export function getLessonsPath(): string {
  return path.join(getDashboardRoot(), "dashboard", "lessons.json");
}

export function loadLessons(): LessonConfig[] {
  if (lessonsCache) return lessonsCache;
  const p = path.join(__dirname, "..", "..", "lessons.json");
  const data = fs.readFileSync(p, "utf-8");
  lessonsCache = JSON.parse(data) as LessonConfig[];
  return lessonsCache;
}

export function getLesson(id: string): LessonConfig | undefined {
  return loadLessons().find((l) => l.id === id);
}

const runs = new Map<
  string,
  { process: ChildProcess; lessonId: string }
>();

export function startRun(
  lessonId: string,
  onData: (chunk: string, isStderr: boolean) => void,
  onEnd: (code: number | null) => void,
  explicitRunId?: string
): string {
  const lesson = getLesson(lessonId);
  if (!lesson) throw new Error(`Unknown lesson: ${lessonId}`);

  const root = getDashboardRoot();
  const cwd = path.join(root, lesson.cwd);
  const runId = explicitRunId ?? `${lessonId}-${Date.now()}`;

  const env = { ...process.env };
  const child = spawn(lesson.command, lesson.args, {
    cwd,
    env,
    shell: process.platform === "win32",
  });

  const normalize = (s: string) => s.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  child.stdout?.on("data", (data: Buffer) => onData(normalize(data.toString()), false));
  child.stderr?.on("data", (data: Buffer) => onData(normalize(data.toString()), true));
  child.on("close", (code) => {
    runs.delete(runId);
    onEnd(code);
  });
  child.on("error", (err) => {
    onData(`\n[Error: ${err.message}]\n`, true);
    onEnd(1);
  });

  runs.set(runId, { process: child, lessonId });
  return runId;
}

export function stopRun(runId: string): boolean {
  const run = runs.get(runId);
  if (!run) return false;
  run.process.kill("SIGTERM");
  runs.delete(runId);
  return true;
}

export function hasRun(runId: string): boolean {
  return runs.has(runId);
}

export function getRunning(): Array<{ runId: string; lessonId: string }> {
  return Array.from(runs.entries()).map(([runId, { lessonId }]) => ({
    runId,
    lessonId,
  }));
}
