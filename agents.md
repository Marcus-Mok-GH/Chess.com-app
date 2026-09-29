# Agent Instructions

## 🎯 Mandatory Rules
- **Update Changelog**: You MUST update `artifacts/chess/public/CHANGELOG.md` immediately after every successful modification, fix, or feature addition.
- **Detailed Entries**: Ensure changelog entries are clear, descriptive, and dated correctly.

## 🤖 Context
This rule ensures that the project history is always up to date and users/owners can easily track the latest improvements.

## 📋 Workspace Constraints
Consolidated list of the rules that apply to every change in this workspace (details in `replit.md`):

1. **Ship complex changes as a pull request** — never push them directly to `main`. Only simple, frontend-only changes may be pushed directly.
2. **No attribution trailers** — no `Co-Authored-By:` lines, no `Generated with Codebuff` footers, no other author or generated-by lines in commits or PR descriptions.
3. **Update `artifacts/chess/public/CHANGELOG.md` after every successful change** — clear, dated, descriptive entries (the Mandatory Rules above).
4. **pnpm only** — npm/yarn hard-fail at the root `preinstall` script.
5. **Register new test files in the root `package.json` `test` script** — it is a curated list, not a glob; an unlisted test is silently skipped, and a bare `vitest run` is not the canonical suite.
6. **DB schema changes bump `SCHEMA_VERSION`** (test-enforced), and new columns ride the additive `ADD COLUMN IF NOT EXISTS` self-heal pass.
7. **New tables go into `initDatabase`'s DDL** (`artifacts/api-server/src/chess-server/db/init.js`) — a guard test fails if the API queries a table that DDL does not create.
8. **Never hand-edit generated packages** — `lib/api-client-react` and `lib/api-zod` come from Orval codegen.
9. **Keep `minimumReleaseAge: 1440`** in `pnpm-workspace.yaml` — don't disable it or exempt packages casually.
10. **Reuse the shared `login-*` classes** in `src/pages/Login.css` for auth-related screens instead of duplicating styles.
11. **Required env**: `DATABASE_URL` (Postgres connection string) for the API server.
