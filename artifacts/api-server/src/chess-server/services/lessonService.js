/**
 * Lesson Service
 *
 * Serves the curated lesson catalog (public) and records per-user lesson
 * progress (authenticated) against the `lesson_progress` table.
 */

import { query } from '../db.js';
import { LESSON_CATALOG, getLessonById } from '../lessons/lessonCatalog.js';

export function listLessons() {
  return LESSON_CATALOG.slice().sort((a, b) => a.order - b.order);
}

export function getLesson(idOrSlug) {
  return getLessonById(idOrSlug);
}

function mapProgressRow(row) {
  return {
    lessonId: row.lesson_id,
    completed: Boolean(row.completed),
    score: row.score ?? null,
    completedAt: row.completed_at ?? null,
  };
}

export async function getProgress(userId) {
  const result = await query(
    `SELECT lesson_id, completed, score, completed_at
     FROM lesson_progress
     WHERE user_id = $1
     ORDER BY lesson_id`,
    [userId]
  );
  return result.rows.map(mapProgressRow);
}

export async function saveProgress(userId, lessonId, { completed, score }) {
  const lesson = getLesson(lessonId);
  if (!lesson) return null;

  const completedAt = completed ? new Date() : null;
  const result = await query(
    `INSERT INTO lesson_progress (user_id, lesson_id, completed, score, completed_at)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (user_id, lesson_id) DO UPDATE SET
       completed = EXCLUDED.completed,
       score = EXCLUDED.score,
       completed_at = EXCLUDED.completed_at,
       updated_at = CURRENT_TIMESTAMP
     RETURNING lesson_id, completed, score, completed_at`,
    [userId, lessonId, Boolean(completed), score ?? null, completedAt]
  );
  return mapProgressRow(result.rows[0]);
}

export default {
  listLessons,
  getLesson,
  getProgress,
  saveProgress,
};
