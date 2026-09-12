# Fair-play review

Chess.com-app uses a review queue instead of treating one suspicious game as proof of cheating.

## Enable reviewers

Set CHESS_REVIEW_ADMIN_IDS to a comma-separated list of authenticated user IDs. Reviewers can then use:

- GET /api/games/integrity/reviews — ranked-game analysis queue
- GET /api/games/integrity/reports — private player reports
- POST /api/games/integrity/reviews/:gameId/analyze — queue a completed ranked game for analysis
- PATCH /api/games/integrity/reviews/:gameId — record confirmed, cleared, or needs_review

Stockfish must be available to produce engine evidence. If it is not configured, the analysis is stored as unavailable; the game is not treated as clean or dirty by default.

## Detection model

Accepted ranked moves receive server timestamps. The browser may also send coarse think-time, visibility, hidden-time, and focus-loss counters. These values are supporting evidence only and are never sufficient by themselves.

A review is flagged when engine correlation agrees with another signal, or when a long sample is exceptionally strong. Accuracy is stored for context, not used as a standalone verdict.

## Player reports

Participants can submit one private report per game from the completed-game screen. Reports accept engine_assistance, outside_help, account_sharing, suspicious_behavior, or other, with optional details capped at 1,000 characters.

Reports do not automatically close accounts, change ratings, or expose the reporter to the opponent. Reviewers should record a decision after checking the game evidence and account context.
