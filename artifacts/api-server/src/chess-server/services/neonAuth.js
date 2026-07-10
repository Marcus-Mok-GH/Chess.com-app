/**
 * Server-side shim kept only to avoid breaking any leftover imports.
 *
 * The app no longer uses Resend (or any custom mailer). Email verification
 * is delegated to Neon Auth's native sender (see neonAuthServer.js). The
 * actual auth proxy/middleware was removed in the previous migration, so
 * this file remains a no-op stub.
 */
export const neonAuth = null;
