# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

Unified design language across iOS, Android, and web (Expo + react-native-web). Web is a secondary render target, not a distinct experience; mobile (~375px) is the primary target.

## Users

A single lender (individual or small-scale informal/private lender) who personally tracks the borrowers they've lent money to. Single-user, local-first tool — not multi-tenant; no login/account-switching UI exists or is planned. Used on-the-go on a phone to check who owes what and record payments as they come in.

## Product Purpose

Tracks borrowers, their loans, and payment (installment) schedules so a lender can see at a glance what's outstanding, what's overdue, and what's been collected, and can record payments as borrowers pay.

## Positioning

A personal lending ledger, not a bank/NBFC-grade loan management platform. It replaces informal tracking (paper ledgers, spreadsheets, memory) with a structured but lightweight record of principal, interest, due dates, and paid/overdue status per borrower.

## Operating Context

- Terminology (from src/types.ts): **Borrower** (client), **Loan** (principal/rate/tenure/repayment schedule), **Payment** (a single installment: due date, principal, interest, delay interest, paid/remaining amount).
- Repayment modes: `cutting` (interest deducted upfront) and `adding` (interest added to each installment).
- Payment modes recorded: Cash, UPI, Bank Transfer, Cheque, RTGS — indicates an Indian lending context; currency is ₹ (INR).
- Data currently syncs to a self-hosted MongoDB Atlas API (migrated from a Google Sheets webapp) — see docs/NOSQL_MIGRATION_PROPOSAL.md.
- Navigation: single-page app shell (App.tsx) with an animated sidebar drawer overlay (src/components/Sidebar.tsx) switching between 5 screens: Dashboard, Due Payments, Simple Interest Calculator, EMI Calculator, Clients. This pattern is durable — redesigns restyle it, not replace it.
- Clients screen has no router; it swaps between list, BorrowerForm (create/edit), and BorrowerDetail (profile + loan/payment history) via local state.

## Capabilities and Constraints

- Built with Expo (SDK 57) + React Native 0.86 + react-native-web — styling is RN `StyleSheet`-based; layouts must translate to flexbox (no CSS grid, `position: sticky`, or shadow-spread tricks that don't map to RN).
- Portfolio metrics (total exposure, outstanding/collected totals, overdue stats) are computed via src/utils/portfolioMetrics.ts.
- Due-payment aggregation across all loans is computed via src/utils/duePayments.ts.
- Two standalone calculators (Simple Interest, EMI) are not persisted — pure input → output tools.

## Evidence on Hand

No real borrower/loan data, testimonials, or case studies on hand — mockups should use plausible placeholder names/amounts, clearly fictional. No existing brand assets beyond generic Expo-generated icons (assets/icon.png, adaptive-icon.png, splash-icon.png, favicon.png) — no binding name/logo/color commitments.

## Product Principles

1. Trustworthy over flashy — this handles someone's money-lending record; clarity and correctness read louder than decoration.
2. Mobile-first always — every layout must work at ~375px width; web is a bonus, not a design target.
3. Status at a glance — paid/overdue/upcoming must be scannable without reading every field.
4. Preserve the sidebar-drawer navigation pattern and all existing screen/data functionality — this is a visual and layout redesign only.
5. Density with restraint — data-dense (loan lists, payment schedules) but never cluttered; favor bordered/divided rows over heavy card chrome for lists.
