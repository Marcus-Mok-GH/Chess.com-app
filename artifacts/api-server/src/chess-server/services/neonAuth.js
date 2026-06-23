/**
 * Neon Auth server — DEPRECATED.
 *
 * The app now uses a custom native OTP flow (routes/auth.js + mailer.js)
 * instead of @neondatabase/auth. This file is kept as a stub so any
 * remaining imports don't crash at build time, but it is no longer wired
 * into the Express router.
 *
 * The neonAuthProxy middleware (middleware/authProxy.js) has also been
 * removed from index.js because it is no longer needed.
 */
export const neonAuth = null;
