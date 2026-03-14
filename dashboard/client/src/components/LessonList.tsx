import { useEffect, useState } from "react";

export interface Lesson {
  id: string;
  label: string;
  cwd: string;
  command: string;
  args: string[];
  longRunning?: boolean;
}

interface LessonListProps {
  onRun: (id: string, label: string) => void;
  activeLessonId: string | null;
  runningLessonIds: Set<string>;
}

export function LessonList({ onRun, activeLessonId, runningLessonIds }: LessonListProps) {
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isActive = (id: string) => runningLessonIds.has(id) || id === activeLessonId;

  useEffect(() => {
    fetch("/api/lessons")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.statusText))))
      .then((data: Lesson[]) => setLessons(data))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="lesson-list-loading">▸ fetching mission log...</div>;
  if (error) return <div className="lesson-list-error">✖ uplink error: {error}</div>;

  return (
    <div className="lesson-list">
      <h2 className="lesson-list-title">// mission log</h2>
      {runningLessonIds.size > 0 && (
        <div className="lesson-list-running-hint">
          ▸ ops running: {runningLessonIds.size}
        </div>
      )}
      <ul className="lesson-cards">
        {lessons.map((lesson) => (
          <li
            key={lesson.id}
            className={`lesson-card ${isActive(lesson.id) ? "lesson-card--running" : ""}`}
          >
            <span className="lesson-card-prompt">{isActive(lesson.id) ? "▶" : "›"}</span>
            <span className="lesson-card-id">{lesson.id}</span>
            <span className="lesson-card-label" title={lesson.label}>
              {lesson.label}
            </span>
            {lesson.longRunning && (
              <span className="lesson-card-badge">daemon</span>
            )}
            <button
              type="button"
              className={`lesson-card-run ${isActive(lesson.id) ? "lesson-card-run--running" : ""}`}
              onClick={() => onRun(lesson.id, lesson.label)}
              title={isActive(lesson.id) ? "Mission active – view terminal" : `Execute ${lesson.id}`}
            >
              {isActive(lesson.id) ? "● live" : "exec"}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
