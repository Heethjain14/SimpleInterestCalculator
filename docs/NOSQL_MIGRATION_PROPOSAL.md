# Proposal: Replacing Google Sheets Storage with a NoSQL Backend

**Status:** Proposal only — no migration code has been written. This document
compares options and recommends a direction; implementation is a separate,
later effort.

## 1. Why the current Sheets-as-database setup is a ceiling, not just a quirk

Today (`src/context/StorageContext.tsx`, `src/services/sheetsSync.ts`), the app is
**local-first**: every read/write hits `AsyncStorage` on-device immediately,
and a Google Sheet is treated as an optional, best-effort mirror. That
local-first shape is good and should be **preserved**, not thrown away — the
problem is specifically the Sheets half:

| Limitation | Concrete impact on this app |
|---|---|
| No real querying | "All overdue installments across every borrower" (Due Payments screen, `src/utils/duePayments.ts`) and portfolio aggregates (Dashboard, `src/utils/portfolioMetrics.ts`) can only be computed by pulling **every** borrower/loan/payment to the device and filtering in JS. This gets slower linearly with portfolio size — there's no way to ask the backend "just give me overdue payments." |
| GET-with-URL-encoded-payload transport | Apps Script's redirect-echo behavior forces every request to be a GET with the JSON payload crammed into a `?payload=` query string, capped around ~2000 characters. Large payment schedules already have to be chunked (`writePaymentSchedule`) — this is a workaround for a workaround. |
| No transactions / no concurrency control | Two devices editing the same borrower can race; there's no optimistic-concurrency or transaction primitive, just "last write wins" per ad hoc Apps Script call. |
| No real auth | Anyone with the deployed Apps Script URL (embedded in `app.json` → shipped in the client bundle) can read/write the whole sheet. There's no per-user data isolation — fine for a single user today, a hard blocker for multi-user. |
| Apps Script quotas | 6-minute execution cap, daily URL-fetch/trigger quotas, and cold-start latency on the free tier — not designed to be an API server. |
| Ad hoc write sites | `BorrowerForm.tsx`, `BorrowerDetail.tsx`, and `DuePaymentsList.tsx` call `sheetsSync.postToSheet()` directly in a few places, bypassing `StorageContext`. This is existing debt independent of the backend choice, but any migration is the natural time to fix it (see §5). |

None of this is urgent while it's one person's phone against one spreadsheet.
It becomes the ceiling the moment you want: multiple people using the app
against shared data, a "who changed what" audit trail, faster Dashboard/Due
Payments queries as the portfolio grows, or basic access control.

## 2. What has to be preserved from the current design

Whatever backend is chosen, keep these properties — they're why the app
feels fast and works on a flaky connection today:

1. **Local-first writes.** Every mutation must land in on-device storage
   synchronously (or near-it) and render immediately; backend sync happens
   after, never blocking the UI.
2. **Offline usability.** Dashboard/Due Payments/Clients must keep working
   with no network at all, using the last-synced local copy.
3. **One seam, not many.** `StorageContext` already centralizes all
   reads/writes behind `useStorageContext()`. The new backend should slot in
   behind that same interface so screens don't change.

## 3. Candidate backends

### Option A — Firebase Firestore

A managed document database with a first-class offline cache and realtime
listeners built into the client SDK itself.

- **Schema fit:** Very close to today's shape. A `borrowers` collection,
  each document holding `{ name, phone, notes, createdAt }`; `loans` as a
  subcollection per borrower, `payments` as a subcollection per loan (or
  embedded array on the loan doc if payment counts stay small, which they
  do — a few dozen installments per loan at most). Subcollections make
  "update one payment" a targeted document write instead of rewriting a
  giant nested blob, which is a real improvement over the current
  chunked-payment-schedule workaround.
- **Offline & sync:** Firestore's client SDK ships its own offline
  persistence and local cache — writes made offline queue automatically and
  sync when connectivity returns, with realtime listeners updating every
  other device once they do. This substantially overlaps with what
  `StorageContext` currently hand-rolls with `AsyncStorage`, meaning some of
  that plumbing could eventually be simplified rather than reimplemented.
- **Cross-cutting queries:** Firestore supports queries like "all payments
  where `dueDate <= today` and `paidDate == null`" via collection-group
  queries across all `payments` subcollections — this directly answers what
  Due Payments/Dashboard need without pulling the whole dataset.
- **Auth:** Firebase Auth (email/password, phone OTP, or anonymous
  per-device) integrates directly with Firestore security rules for
  per-user data isolation — meaningful if this ever becomes multi-user.
- **Cost:** Free Spark tier is generous for single-user/small-team scale
  (50K reads, 20K writes, 20K deletes per day); paid tier is pay-per-operation.
- **Expo/RN fit:** Officially supported; the JS SDK works in Expo with
  `initializeAuth(app, { persistence: getReactNativePersistence(AsyncStorage) })`
  for auth persistence. No native module compilation needed for a managed
  Expo Go / EAS Build workflow.
- **Tradeoff:** Firestore query language is more restrictive than SQL (no
  arbitrary joins, limited compound-inequality filters) and vendor lock-in
  to Google Cloud.

### Option B — Supabase (Postgres)

Technically relational, not NoSQL — included because it's commonly
shortlisted for exactly this kind of app and is worth ruling in or out
explicitly.

- **Schema fit:** Would require actually normalizing into `borrowers`,
  `loans`, `payments` tables with foreign keys — a bigger conceptual jump
  from the current nested-JSON shape than Firestore's subcollections, but
  arguably a *healthier* long-term shape if you ever want real reporting
  (e.g. "collection rate by month" becomes a SQL `GROUP BY` instead of
  client-side aggregation in `portfolioMetrics.ts`).
- **Offline & sync:** No built-in offline cache/sync comparable to
  Firestore's — you'd keep hand-rolling the AsyncStorage-first pattern
  already in `StorageContext` and add your own "sync queue" for offline
  writes, or adopt a third-party sync layer (e.g. ElectricSQL, still
  maturing). This is the biggest gap versus Option A for this app
  specifically, since offline-first is a hard requirement here.
- **Cross-cutting queries:** Excellent — full SQL, so "overdue payments
  across all borrowers" is a single indexed query with real `WHERE`/`JOIN`.
- **Auth:** Built-in (Supabase Auth), with row-level security policies for
  per-user isolation.
- **Cost:** Free tier includes a small Postgres instance; predictable
  Postgres pricing beyond that.
- **Expo/RN fit:** `@supabase/supabase-js` works fine in Expo/RN (it's a
  plain REST/WebSocket client under the hood).
- **Tradeoff:** You'd be building the offline-sync layer yourselves —
  exactly the piece Firestore gives you for free — which is significant
  extra work for a small, single-maintainer app.

### Option C — MongoDB Atlas (+ Device Sync / Realm)

- **Schema fit:** Closest conceptually to the current nested JSON — a
  `borrowers` collection where each document *is* basically today's
  `Borrower` object (loans and payments embedded, no schema migration
  needed at the shape level).
- **Offline & sync:** Atlas Device Sync (built on what used to be Realm)
  provides an embedded local database with bidirectional sync and conflict
  resolution, which would satisfy the offline-first requirement similarly
  to Firestore. However, MongoDB has been actively deprecating/sunsetting
  parts of the Realm/Device Sync product line, which is a real risk to
  build new work on right now — it needs to be re-verified against
  MongoDB's current product roadmap before committing, not assumed stable.
- **Cross-cutting queries:** Full MongoDB query language (rich filters,
  aggregation pipeline) — very capable for the overdue-payments-style
  queries.
- **Auth:** Atlas App Services provides auth (email/password, anonymous,
  OAuth) tied to sync permissions.
- **Cost:** Free M0 cluster tier exists but is limited; Device Sync
  pricing/availability has shifted over time.
- **Expo/RN fit:** Requires either the Realm/Atlas Device Sync SDK (a
  native module — needs an EAS development build, not plain Expo Go) or
  going server-only via the Data API (in which case you lose the
  offline-sync benefit and are back to hand-rolling it, same gap as Option B).
- **Tradeoff:** Best schema fit, but the offline-sync story is currently
  the least stable of the three and adds a native-module dependency the
  other two avoid.

## 4. Comparison at a glance

| | Firestore | Supabase | MongoDB Atlas |
|---|---|---|---|
| Matches current nested schema | Good (subcollections) | Requires normalization | Best (embed as-is) |
| Built-in offline-first sync | **Yes** | No (build it yourself) | Yes, but roadmap risk |
| Cross-cutting queries (overdue payments, etc.) | Good (collection-group queries) | **Best** (full SQL) | Good (aggregation pipeline) |
| Works in plain Expo Go (no native build) | **Yes** | Yes | No (needs EAS dev build) |
| Auth + per-user data isolation | Yes | Yes | Yes |
| Free-tier fit for this app's scale | Generous | Generous | Limited |
| Biggest risk | Query-language limits at scale | You own the offline-sync layer | Product-line stability |

## 5. Recommendation

**Firestore is the best fit for this specific app**, primarily because it's
the only option that gives offline-first sync *and* works without adding a
native-module build step, which matters for a project currently running on
plain Expo Go/EAS Build with no native modules. Supabase would be the
stronger choice only if cross-cutting SQL reporting mattered more than
offline reliability, or if normalizing the data model is itself a goal;
MongoDB Atlas has the best schema fit but carries product-roadmap risk on
the exact piece (Device Sync) that would replace `StorageContext`'s current
job.

If a future migration goes ahead, the natural boundary is: replace
`src/services/sheetsSync.ts` and the Sheets-specific branches inside
`src/context/StorageContext.tsx` with a Firestore-backed implementation of
the *same* `StorageContextValue` interface, so `App.tsx` and every screen
need zero changes. As part of that work, the ad hoc `postToSheet()` calls
in `BorrowerForm.tsx`, `BorrowerDetail.tsx`, and `DuePaymentsList.tsx`
(flagged in §1 and in `docs/ARCHITECTURE.md`) should be removed in favor of
routing everything through `StorageContext`, since Firestore's security
rules and offline queue only give you consistent guarantees if all writes
go through one path.

This document intentionally stops at the proposal/comparison stage — no
Firestore project, schema, or code has been created yet.
