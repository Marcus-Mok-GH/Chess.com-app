### Added
- Serverless DB warm-up now skips schema DDL when the stored schema version matches: cold starts stop taking ACCESS EXCLUSIVE locks on the users table, which was blocking account endpoints (504s) whenever the warm-up transaction stalled. Concurrent inits serialize via an advisory lock and all schema work runs with a 10s lock timeout.
- Admin account management: admins can search accounts by username or email and ban (with an optional reason), unban, or permanently delete them from a new Admin page. Banned users are signed out immediately and blocked from signing back in.
