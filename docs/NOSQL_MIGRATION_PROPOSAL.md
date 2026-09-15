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

### Option C — MongoDB Atlas

- **Schema fit:** Closest conceptually to the current nested JSON — a
  `borrowers` collection where each document *is* basically today's
  `Borrower` object (loans and payments embedded, no schema migration
  needed at the shape level).
- **Offline & sync:** No built-in client-side offline sync is available
  any more (see update below) — same gap as Option B: `StorageContext`'s
  existing AsyncStorage-first pattern keeps doing this job, unchanged.
- **Cross-cutting queries:** Full MongoDB query language (rich filters,
  aggregation pipeline) — very capable for the overdue-payments-style
  queries.
- **Auth:** Would need to be hand-rolled in the API layer described below
  (e.g. a simple API key or JWT check), since there's no managed
  auth-plus-sync product tying the two together any more.
- **Cost:** Free M0 cluster tier exists and is enough for this app's scale.
- **Expo/RN fit:** Excellent, *specifically because* the integration path
  below is plain HTTP — no native module, works in plain Expo Go.
- **Tradeoff:** No managed offline-sync layer (you're already covering
  that need locally via `StorageContext`/AsyncStorage today, so this is a
  smaller gap than it sounds); you own running/hosting a small API server.

> **Update (2026-09-15):** the item flagged above as a risk has materialized.
> MongoDB's **Atlas Data API and Atlas Device Sync (Realm) both reached
> end-of-life on September 30, 2025** and are no longer available for new
> projects — confirmed via MongoDB's own deprecation notice and community
> forum posts. This removes the "managed, Firestore-like" integration paths
> for MongoDB entirely. MongoDB's own current guidance for client apps is to
> build a REST API with a server framework (e.g. Express) and the native
> MongoDB Node driver, and call that from the client — which is exactly
> **Option C-1** below. This isn't a downgrade in practice for this app:
> `StorageContext` already owns offline-first behavior locally, so a plain
> REST backend loses nothing this app currently relies on, and it's the
> option actually chosen (see §5).

### Option C-1 — MongoDB Atlas via a self-hosted REST API (chosen)

Since Options B and C's managed-sync paths are gone, this is the concrete
shape of "use MongoDB" going forward: a small Express (Node) server, using
the `mongodb` npm driver, exposing REST routes that mirror
`src/services/sheetsSync.ts`'s existing function set 1:1
(`fetchAllData`, `addLoan`, `updateLoanInfo`, `updateBorrowerInfo`,
`writePaymentSchedule`, `updatePayment`, `deleteLoan`, `deleteBorrower`).
The Expo app gets a new `src/services/mongoSync.ts` with the same
signatures, so `StorageContext`'s call sites don't change shape — only
which sync service they import. The server runs locally during
development (same pattern as the existing `proxy/sheets_proxy.py`) and can
be deployed later (Render, Railway, Fly.io, etc.) for access away from a
home network. This keeps the app's local-first/offline behavior exactly as
it is today — the backend swap is purely about replacing the Sheets/Apps
Script half, not `StorageContext`'s AsyncStorage-first design.

## 4. Comparison at a glance

| | Firestore | Supabase | MongoDB Atlas (C-1: self-hosted API) |
|---|---|---|---|
| Matches current nested schema | Good (subcollections) | Requires normalization | Best (embed as-is) |
| Built-in offline-first sync | Yes | No (build it yourself) | No (unchanged — `StorageContext` already does this locally) |
| Cross-cutting queries (overdue payments, etc.) | Good (collection-group queries) | Best (full SQL) | Good (aggregation pipeline) |
| Works in plain Expo Go (no native build) | Yes | Yes | **Yes** (plain HTTP, no native module) |
| Auth + per-user data isolation | Yes | Yes | Hand-rolled in the API layer |
| Free-tier fit for this app's scale | Generous | Generous | Generous (M0 cluster) |
| Extra ops burden vs. the others | None (managed) | None (managed) | You run/host a small API server |

## 5. Decision

**MongoDB Atlas, via Option C-1 (self-hosted Express API), is what this app
uses**, chosen 2026-09-15. Firestore would have been the lower-ops choice
had a managed backend been the deciding factor (see the original reasoning
above, kept for the record) — but with an Atlas account already created and
Device Sync/Data API no longer available anyway, C-1 is both the practical
and the MongoDB-recommended path, and it doesn't cost this app anything it
relies on today: `StorageContext` already owns local-first/offline behavior
via AsyncStorage, so a plain REST backend is a full substitute for what
Sheets was doing, not a downgrade from what Firestore would have done.

**Implementation boundary:** a new `server/` Express app (MongoDB Node
driver) exposes REST routes mirroring `src/services/sheetsSync.ts`'s
function set; a new `src/services/mongoSync.ts` on the client implements
the same shape against that API; `src/context/StorageContext.tsx` swaps its
Sheets-specific calls for the Mongo ones behind the *same*
`StorageContextValue` interface, so `App.tsx` and every screen need zero
changes. As part of that work, the ad hoc `postToSheet()`-equivalent calls
in `BorrowerForm.tsx`, `BorrowerDetail.tsx`, and `DuePaymentsList.tsx`
(flagged in §1 and in `docs/ARCHITECTURE.md`) should be removed in favor of
routing everything through `StorageContext`, so every write goes through
one path instead of several ad hoc ones.

This document stops at the design/decision stage — implementation (the
`server/` app, the Atlas cluster connection, and the client-side sync
service) is tracked separately as it's built.
