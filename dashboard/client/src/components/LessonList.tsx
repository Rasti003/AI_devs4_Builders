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

  if (loading) return <div className="lesson-list-loading">▸ ładowanie modułów...</div>;
  if (error) return <div className="lesson-list-error">✖ błąd: {error}</div>;

  return (
    <div className="lesson-list">
      <h2 className="lesson-list-title">// moduły / lekcje</h2>
      {runningLessonIds.size > 0 && (
        <div className="lesson-list-running-hint">
          ▸ aktywne procesy: {runningLessonIds.size}
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
              <span className="lesson-card-badge">srv</span>
            )}
            <button
              type="button"
              className={`lesson-card-run ${isActive(lesson.id) ? "lesson-card-run--running" : ""}`}
              onClick={() => onRun(lesson.id, lesson.label)}
              title={isActive(lesson.id) ? "Uruchomione – kliknij aby zobaczyć terminal" : `Uruchom ${lesson.id}`}
            >
              {isActive(lesson.id) ? "● on" : "run"}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
