# Plan — "Unlimited Game Reviews" subscription via Whop

Status: **implemented** · Author: Zo · Date: 2026-10-27 · Verified 2026-10-28

## 1. Goal

Sell a recurring subscription that removes the free-tier limit on game reviews.

- **Free accounts:** 1 game review per day.
- **Subscribers:** unlimited game reviews.
- **Price:** 7.99 SGD / month.
- **Storefront:** a new Whop business (separate from the existing `Nova Labs` account), created and managed with the `whop` CLI.

## 2. What "a game review" is today

A review is the POST to `/coach/analyze` in `artifacts/api-server/src/chess-server/routes/coach.js`. That handler:

- takes `moveHistory` (array of SAN strings or `{san}` objects) plus `result`,
- splits the moves into chunks of 20 and calls the coach LLM per chunk,
- returns `{ analysis: { format: 'move_review', moves: [...] } }`.

The `/engine/evaluate-positions` batch endpoint is only the Stockfish eval strip — not the paid feature. Gating `/coach/analyze` is the correct, minimal lever.

There is **no usage tracking or limit today**, so both the counter and the gate are new work.

## 3. Architecture

```
React (GameReview.jsx)
   │  POST /coach/analyze
   ▼
coach.js  ──► reviewQuota service ──► Postgres (review_usage table)
   │                    │
   │                    └─► subscription lookup (Whop membership state cached locally)
   ▼
LLM (unchanged)
```

### 3.1 Data model (Postgres, additive, `SCHEMA_VERSION` → `10`)

Per project rule 6/7: bump `SCHEMA_VERSION` in `artifacts/api-server/src/chess-server/db/init.js` and add DDL to `initDatabase`.

```sql
CREATE TABLE IF NOT EXISTS review_usage (
  user_id    VARCHAR(100) NOT NULL,
  usage_date DATE         NOT NULL,
  count      INTEGER      NOT NULL DEFAULT 0,
  updated_at TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, usage_date)
);

CREATE TABLE IF NOT EXISTS subscriptions (
  user_id           VARCHAR(100) PRIMARY KEY,
  whop_membership_id TEXT UNIQUE,
  whop_plan_id      TEXT,
  status            TEXT NOT NULL DEFAULT 'inactive', -- active | inactive | past_due | canceled
  current_period_end TIMESTAMP,
  updated_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

Both tables created in `initDatabase`'s DDL, plus the `ADD COLUMN IF NOT EXISTS` self-heal pass is not needed for new tables. Guard test in `tests/` must be extended so the "API queries a table the DDL creates" test passes.

### 3.2 Quota service — `services/reviewQuota.js`

- `getDailyLimit(userId)` → `Infinity` if an active subscription row exists and `current_period_end` is null or in the future, else `1`.
- `consumeReview(userId)` → atomic upsert:
  ```sql
  INSERT INTO review_usage (user_id, usage_date, count) VALUES ($1, CURRENT_DATE, 1)
  ON CONFLICT (user_id, usage_date)
  DO UPDATE SET count = review_usage.count + 1, updated_at = CURRENT_TIMESTAMP
  RETURNING count;
  ```
  Only called **after** the subscription check, and only when the review actually succeeds.
- Date boundary: `CURRENT_DATE` in the DB's timezone. Deliberate decision — simpler and consistent. Documented in the service header.
- `getUsage(userId)` → `{ used, limit, remaining, resetsAt }` for the UI.

### 3.3 Gate in `coach.js`

Before the chunk loop in `/coach/analyze`:

1. Resolve `userId` from the existing auth middleware (same as today).
2. `consumeReview` / check: if `used >= limit`, return **429** with
   ```json
   { "error": "Daily review limit reached", "code": "REVIEW_LIMIT_REACHED", "limit": 1, "used": 1, "upgradeUrl": "..." }
   ```
3. On success, increment the counter (after the LLM returns at least one chunk — avoid charging for failed reviews).

Idempotency concern: a review is chunked into several LLM calls but counts as **one** review. Increment once per request, not per chunk.

### 3.4 Whop integration

- **New business:** `whop accounts create --title "<name>" --business-type software ...` — needs the final name and country/tax details.
- **Product:** "Unlimited Game Reviews" (one product, one variant).
- **Variant:** `plan_type=renewal`, `billing_period=30`, `initial_price=7.99`, `renewal_price=7.99`, `currency=sgd`, `title="Unlimited Game Reviews"` (≤30 chars).
- **Checkout:** `whop checkout-configurations create` → shareable link, embedded in the app's upgrade modal.
- **Webhook → membership sync:** a new route `POST /api/whop/webhook` (or extend the existing webhook surface) that verifies the Whop signature and upserts `subscriptions`.
  - Events: `membership.activated`, `membership.deactivated`, `payment.succeeded`, `payment.failed`.
  - Requires `WHOP_WEBHOOK_SECRET` and `WHOP_API_KEY` in [Settings → Advanced](/?t=settings&s=advanced).
- **Fallback sync:** on each `/coach/analyze` request, if the local subscription row is missing or stale (>24h), the server may re-check the membership via the Whop API. Rate-limited; behind a flag.

### 3.5 Frontend

- `GameReview.jsx`: on `429 REVIEW_LIMIT_REACHED`, render a paywall panel (not a generic error) with the remaining-free-review state and an "Upgrade — 7.99 SGD/month" button opening the Whop checkout URL.
- Show a small usage line ("1 of 1 free review used today · resets at midnight") sourced from a new `GET /coach/review-usage`.
- Loading/error/empty states per the project's UI standards; dark-mode styling consistent with `GameReview.css`.

### 3.6 Security

- Webhook signature verification before any DB write.
- Never trust a client-supplied `isSubscriber` flag.
- Rate-limit the usage endpoint.
- No secrets in code; read from `process.env`.

## 4. Work order

1. `PLAN.md` (this file) — approve before coding.
2. DB: `SCHEMA_VERSION` 10, DDL, guard test.
3. `services/reviewQuota.js` + unit tests.
4. Gate + usage endpoint in `coach.js` + tests (`coach.analyze.test.js` extension).
5. Whop business/product/variant creation via CLI (needs answers in §6).
6. Webhook route + signature verification + tests.
7. `GameReview.jsx` paywall + usage display + tests.
8. Register new test files in root `package.json` `test` script (project rule 5).
9. Update `artifacts/chess/public/CHANGELOG.md` (project rule 3).
10. Run the curated suite; open a PR (project rule 1 — this is a complex change).

## 5. Out of scope (explicitly)

- No changes to Stockfish evaluation.
- No changes to bot play, puzzles, lessons, or matchmaking.
- No Apple/Google in-app purchase.
- No multi-tier plans; one product, one variant.

## 6. Open questions — please answer before I start

1. **Business name.** You said "under a new business name". What should it be? The app brands itself **PlayChess**; I'd suggest **PlayChess** unless you want something else. Also: country for the Whop account (existing one is `us`), and do you want it under the same legal entity/email (`mokmarcus068@gmail.com`) or a different one?
2. **Currency mechanics.** Whop variants are priced in one currency. 7.99 SGD monthly is fine, but buyers outside Singapore will see SGD. Accept that, or price in USD (≈5.99) with SGD as the local display?
3. **Free-tier reset boundary.** I plan midnight in the database's timezone (UTC on most hosts). Should it instead be midnight **Asia/Singapore** for the user's local day? This changes the SQL.
4. **What counts as one review.** One `/coach/analyze` request, regardless of game length (a 90-move game is 5 LLM chunks but still one review). Confirm.
5. **Does a failed/empty review consume the daily allowance?** I propose **no** — only successful reviews count. Confirm.
6. **Does the subscriber also get anything else?** e.g. deeper analysis, more engine depth. Right now the plan is "unlimited reviews only".
7. **Existing accounts.** Do current users get grandfathered (e.g. keep unlimited for N days), or does the 1/day limit apply to everyone immediately?
8. **Whop API key.** Do you already have one for the new business, or should I walk you through generating it? It has to go into Settings → Advanced as `WHOP_API_KEY` (and the webhook secret as `WHOP_WEBHOOK_SECRET`).

Once 1–8 are answered I'll start at step 2 and work straight through to the PR.