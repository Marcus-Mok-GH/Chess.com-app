# Changelog

## [2026-06-30] - Deployment & Code Restoration Fixes

### Fixed
- **Vercel Deployment**: Resolved project naming conflicts by ensuring the project ID uses lowercase, which was causing deployment failures.
- **OnlinePlay.jsx Restored**: Restored `artifacts/chess/src/pages/OnlinePlay.jsx` which was previously truncated/corrupted (recovered full 227+ lines of component code).

### Verified
- Successful builds for `@workspace/api-server` and `@workspace/chess` monorepo packages confirmed after fixes.
