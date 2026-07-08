# Changelog

All notable changes to the chess.com-app will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed
- **OTP "failed to send code" error on Vercel.** The Express serverless handler
  was importing the app module, but in serverless mode the boot-time
  `checkDbConnection()` / `initDatabase()` call only runs when `!process.env.VERCEL`.
  A cold start could land on a function with no `users` / `otp_codes` tables,
  causing Neon to return `42P01` and the auth proxy to surface "failed to send
  code" on every request. We now (1) eagerly ensure the schema on every request
  via Express middleware, (2) reduce retry backoff from 2× 5 s (10 s) to 2× 2 s
  (4 s) so cold-start init fits inside Vercel's 15 s Hobby ceiling, and (3)
  reset the readiness flag when `query()` catches a missing-relation error so
  the recovery path always re-runs `initDatabase` when needed.
- **App is "INSANELY understyled".** Two compounding bugs: (a) the global
  Tailwind v4 + shadcn design-token stylesheet (`src/index.css`) was never
  imported anywhere in the app, so Tailwind utility classes (`bg-background`,
  `text-foreground`, `font-sans`, …) and the shadcn theme tokens had no effect
  on the rendered page; (b) even if it were imported, every `--background`,
  `--foreground`, `--primary`, etc. variable was left at the shadcn template
  placeholder value `red` (the comment said `/*replace with H S L */`). We now
  import `index.css` from `src/index.jsx` and replace all placeholder HSL
  values with the chess.com-inspired dark palette already used throughout the
  app (--color-bg-primary `#1b1c1f`, --color-accent-primary `#7fa650`, etc.).
  Result: the global stylesheet bundle grows from 0 B to ~141 kB and the body,
  fonts, and Tailwind utilities all render as intended.
