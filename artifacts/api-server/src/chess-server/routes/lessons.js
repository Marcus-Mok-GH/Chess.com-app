/**
 * Lesson Routes
 * API endpoints for the curated lessons catalog and per-user progress.
 *
 * The catalog GET endpoints are public (like puzzles); progress reads and
 * writes require an authenticated user.
 */

import { Router } from 'express';
import { errorResponse, handleRouteError } from '../middleware/errors.js';
import { authenticatedUserId } from '../coachAuth.js';
import lessonService from '../services/lessonService.js';

const router = Router();

/**
 * GET /api/lessons
 * Public. Return the curated lesson catalog ordered by lesson order.
 */
router.get('/', (req, res) => {
  try {
    const lessons = lessonService.listLessons();
    res.json({ success: true, lessons, count: lessons.length });
  } catch (error) {
    handleRouteError(res, error, 'Failed to get lessons');
  }
});

/**
 * GET /api/lessons/progress
 * Authenticated. Return the caller's lesson progress. Must be registered
 * before the /:id route so "progress" is not captured as a lesson id.
 */
router.get('/progress', async (req, res) => {
  try {
    const userId = await authenticatedUserId(req);
    if (!userId) return errorResponse(res, 401, 'Log in to view lesson progress.');
    const progress = await lessonService.getProgress(userId);
    res.json({ success: true, progress });
  } catch (error) {
    handleRouteError(res, error, 'Failed to get lesson progress');
  }
});

/**
 * GET /api/lessons/:id
 * Public. Return a single lesson by slug id.
 */
router.get('/:id', (req, res) => {
  try {
    const lesson = lessonService.getLesson(req.params.id);
    if (!lesson) return errorResponse(res, 404, 'Lesson not found');
    res.json({ success: true, lesson });
  } catch (error) {
    handleRouteError(res, error, 'Failed to get lesson');
  }
});

/**
 * POST /api/lessons/:id/progress
 * Authenticated. Upsert the caller's progress for one lesson.
 * Body: { completed: boolean, score?: number }
 */
router.post('/:id/progress', async (req, res) => {
  try {
    const userId = await authenticatedUserId(req);
    if (!userId) return errorResponse(res, 401, 'Log in to save lesson progress.');

    const { id } = req.params;
    if (!lessonService.getLesson(id)) return errorResponse(res, 404, 'Lesson not found');

    const body = req.body || {};
    if (typeof body.completed !== 'boolean') {
      return errorResponse(res, 400, 'completed must be a boolean');
    }
    if (body.score !== undefined && body.score !== null && typeof body.score !== 'number') {
      return errorResponse(res, 400, 'score must be a number');
    }

    const progress = await lessonService.saveProgress(userId, id, {
      completed: body.completed,
      score: body.score,
    });
    res.json({ success: true, progress });
  } catch (error) {
    handleRouteError(res, error, 'Failed to save lesson progress');
  }
});

export default router;
