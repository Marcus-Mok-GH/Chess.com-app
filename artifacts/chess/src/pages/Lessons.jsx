import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  Circle,
  GraduationCap,
  Play,
  Target,
  Trophy,
} from "lucide-react";
import { Chess } from "chess.js";
import ChessBoard from "../components/ChessBoard";
import {
  LESSON_CATALOG,
  getLessonById,
  getLessonParagraphs,
} from "../engine/lessons/lessonCatalog";
import api from "../services/api";
import "./Lessons.css";

function difficultyLabel(difficulty) {
  return difficulty === "beginner" ? "Beginner" : "Intermediate";
}

function exampleFenFor(lesson) {
  if (lesson.exampleFen) return lesson.exampleFen;
  if (lesson.examplePgn) {
    try {
      const chess = new Chess();
      chess.loadPgn(lesson.examplePgn);
      return chess.fen();
    } catch {
      return null;
    }
  }
  return null;
}

// Prefer the rich local catalog content, but accept whatever the API returns
// so the page still works if the catalogs ever drift.
function mergeRemoteLesson(remote) {
  const local = getLessonById(remote?.id);
  if (!local) return { ...remote };
  return {
    ...remote,
    description: local.description,
    exampleExplanation: remote.exampleExplanation || local.exampleExplanation,
    puzzleThemes: remote.puzzleThemes || local.puzzleThemes,
    exampleFen: remote.exampleFen || local.exampleFen,
    examplePgn: remote.examplePgn || local.examplePgn,
  };
}

export default function Lessons() {
  const navigate = useNavigate();
  const [lessons, setLessons] = useState(LESSON_CATALOG);
  const [progress, setProgress] = useState({});
  const [selectedLesson, setSelectedLesson] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;

    api
      .getLessons()
      .then((data) => {
        if (cancelled || !Array.isArray(data?.lessons) || data.lessons.length === 0) return;
        const merged = data.lessons
          .map(mergeRemoteLesson)
          .sort((a, b) => a.order - b.order);
        setLessons(merged);
      })
      .catch((error) => {
        console.warn("[Lessons] Failed to load lessons from API, using local catalog:", error.message);
      });

    api
      .getLessonProgress()
      .then((data) => {
        if (cancelled) return;
        const map = {};
        for (const entry of data?.progress || []) {
          map[entry.lessonId] = { completed: Boolean(entry.completed), score: entry.score ?? null };
        }
        setProgress(map);
      })
      .catch((error) => {
        console.warn("[Lessons] Failed to load progress:", error.message);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const completedCount = useMemo(
    () => lessons.filter((lesson) => progress[lesson.id]?.completed).length,
    [lessons, progress],
  );

  const beginners = useMemo(
    () => lessons.filter((lesson) => lesson.difficulty === "beginner"),
    [lessons],
  );
  const intermediates = useMemo(
    () => lessons.filter((lesson) => lesson.difficulty === "intermediate"),
    [lessons],
  );

  async function handleMarkComplete(lesson) {
    if (saving) return;
    setSaving(true);
    const nextCompleted = !progress[lesson.id]?.completed;
    try {
      const data = await api.saveLessonProgress(lesson.id, { completed: nextCompleted });
      const saved = data?.progress;
      if (saved) {
        setProgress((prev) => ({
          ...prev,
          [lesson.id]: { completed: Boolean(saved.completed), score: saved.score ?? null },
        }));
      } else {
        setProgress((prev) => ({ ...prev, [lesson.id]: { completed: nextCompleted, score: null } }));
      }
    } catch (error) {
      console.error("[Lessons] Failed to save progress:", error.message);
    } finally {
      setSaving(false);
    }
  }

  if (selectedLesson) {
    return (
      <LessonDetail
        lesson={selectedLesson}
        completed={Boolean(progress[selectedLesson.id]?.completed)}
        saving={saving}
        onBack={() => setSelectedLesson(null)}
        onToggleComplete={() => handleMarkComplete(selectedLesson)}
        onPractice={() => {
          const search = new URLSearchParams({
            lesson: selectedLesson.id,
            title: selectedLesson.title,
            themes: (selectedLesson.puzzleThemes || []).join(","),
            seed: String(Date.now() ^ Math.floor(Math.random() * 0xffffffff)),
          });
          navigate(`/puzzles?${search.toString()}`);
        }}
      />
    );
  }

  return (
    <div className="lessons-page">
      <div className="lessons-container">
        <header className="lessons-header">
          <div className="lessons-header-top">
            <div className="lessons-eyebrow">
              <GraduationCap className="lessons-eyebrow-icon" size={13} />
              <span>Learning Path</span>
            </div>
            <span className="lessons-meta">
              {completedCount} of {lessons.length} lessons complete
            </span>
          </div>
          <h1 className="lessons-title">Chess Lessons</h1>
          <p className="lessons-subtitle">
            Structured topics with examples. Finish a lesson, then practice the
            idea in the tactical trainer.
          </p>
          <div className="lessons-progress-track" aria-label="Lesson progress">
            <div
              className="lessons-progress-fill"
              style={{ width: `${lessons.length ? (completedCount / lessons.length) * 100 : 0}%` }}
            />
          </div>
        </header>

        <LessonGroup
          title="Beginner"
          icon={<BookOpen size={16} />}
          lessons={beginners}
          progress={progress}
          onSelect={setSelectedLesson}
        />
        <LessonGroup
          title="Intermediate"
          icon={<Target size={16} />}
          lessons={intermediates}
          progress={progress}
          onSelect={setSelectedLesson}
        />
      </div>
    </div>
  );
}

function LessonGroup({ title, icon, lessons, progress, onSelect }) {
  if (lessons.length === 0) return null;
  const done = lessons.filter((lesson) => progress[lesson.id]?.completed).length;

  return (
    <section className="lessons-group">
      <div className="lessons-group-header">
        <span className="lessons-group-icon">{icon}</span>
        <h2 className="lessons-group-title">{title}</h2>
        <span className="lessons-group-count">
          {done}/{lessons.length}
        </span>
      </div>
      <div className="lessons-list">
        {lessons.map((lesson) => {
          const isCompleted = Boolean(progress[lesson.id]?.completed);
          const snippet = getLessonParagraphs(lesson)[0] || "";
          return (
            <button
              key={lesson.id}
              type="button"
              className="lesson-card"
              onClick={() => onSelect(lesson)}
            >
              <span className={`lesson-card-order${isCompleted ? " lesson-card-order--done" : ""}`}>
                {lesson.order}
              </span>
              <span className="lesson-card-body">
                <span className="lesson-card-title">{lesson.title}</span>
                <span className="lesson-card-snippet">{snippet}</span>
              </span>
              {isCompleted ? (
                <CheckCircle2 className="lesson-card-check" size={20} aria-label="Completed" />
              ) : (
                <Circle className="lesson-card-check lesson-card-check--pending" size={20} />
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}

function LessonDetail({ lesson, completed, saving, onBack, onToggleComplete, onPractice }) {
  const paragraphs = getLessonParagraphs(lesson);
  const fen = exampleFenFor(lesson);

  return (
    <div className="lessons-page lessons-page--detail">
      <div className="lessons-container">
        <button type="button" className="lesson-back" onClick={onBack}>
          <ArrowLeft size={16} /> All lessons
        </button>

        <header className="lessons-header">
          <div className="lessons-header-top">
            <div className="lessons-eyebrow">
              <BookOpen className="lessons-eyebrow-icon" size={13} />
              <span>{difficultyLabel(lesson.difficulty)}</span>
            </div>
            <span className="lessons-meta">{lesson.topic}</span>
          </div>
          <h1 className="lessons-title">{lesson.title}</h1>
        </header>

        <div className="lesson-detail-layout">
          <article className="lesson-text">
            {paragraphs.map((paragraph, index) => (
              <p key={index} className="lesson-paragraph">
                {paragraph}
              </p>
            ))}

            {lesson.puzzleThemes?.length > 0 && (
              <div className="lesson-themes">
                <span className="lesson-themes-label">Related puzzle themes:</span>
                {lesson.puzzleThemes.map((theme) => (
                  <span key={theme} className="lesson-theme-chip">
                    {theme}
                  </span>
                ))}
              </div>
            )}
          </article>

          <aside className="lesson-example">
            {fen && (
              <div className="lesson-example-board">
                <ChessBoard position={fen} boardOrientation="white" boardTheme="green" />
              </div>
            )}
            {lesson.exampleExplanation && (
              <p className="lesson-example-caption">{lesson.exampleExplanation}</p>
            )}

            <div className="lesson-actions">
              <button type="button" className="lesson-action lesson-action--practice" onClick={onPractice}>
                <Play size={16} /> Practice
              </button>
              <button
                type="button"
                className={`lesson-action lesson-action--complete${completed ? " is-completed" : ""}`}
                onClick={onToggleComplete}
                disabled={saving}
              >
                {completed ? <Trophy size={16} /> : <CheckCircle2 size={16} />}
                {completed ? "Completed" : "Mark Complete"}
              </button>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
