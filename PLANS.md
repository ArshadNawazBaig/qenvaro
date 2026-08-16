# Qenvaro implementation plan

Last updated: 2026-08-16

## Current status

Phase 0 is implemented and validated. Phase 1 and Phase 2 are in progress through a coherent identity/tenant/catalog slice. The repository began empty; it now builds and runs with verified auth entry flows, transactional organization/first-store onboarding, membership-authorized business and store switching, tenant team administration, owner-controlled Stripe billing, an authenticated dashboard, and a database-backed product creation path.

## Phases

| Phase | Scope                                                                                              | Status      |
| ----- | -------------------------------------------------------------------------------------------------- | ----------- |
| 0     | Next.js foundation, design system, MongoDB, environment, logging, tests, Docker, CI, documentation | Complete    |
| 1     | Better Auth, organizations, onboarding, RBAC, tenant/store shell, Stripe plan projection           | In progress |
| 2     | Products, categories, inventory ledger, CSV, tenant dashboard                                      | In progress |
| 3     | Customers, sales, returns, receipts and atomic inventory integration                               | Pending     |
| 4     | Employees, attendance, leave, compensation and operational payroll                                 | Pending     |
| 5     | Suppliers, purchases, receiving, expenses and reports                                              | Pending     |
| 6     | Platform administration, break-glass support controls and hardening                                | Pending     |

## Completed tasks

- Recorded the modular-monolith, tenancy, authorization, UI, and definition-of-done rules in `AGENTS.md`.
- Selected stable Node 22, Next.js, React, TypeScript, MongoDB driver, Better Auth, Tailwind, Vitest, and Playwright foundations.
- Added root environment, lint, TypeScript, formatting, shadcn, and package configuration.
- Added warm light/dark design tokens, responsive public/auth/tenant shells, pricing, dashboard, and image-inspired product catalog views.
- Wired Better Auth MongoDB, email/password, verification, reset, Google configuration, organization invitations, admin, 2FA, database-backed rate limits, and organization Stripe subscription plugins.
- Added resource/action permissions, server-derived tenant context, store scoping, typed product repository, centralized plans/quotas, integer money helpers, and safe CSV escaping.
- Implemented atomic simple-product creation with default variant, opening inventory ledger/projection, quota enforcement, and an append-only audit event.
- Implemented authenticated first-workspace onboarding with validated regional and plan choices, Better Auth organization ownership, active-organization session state, and an atomic tenant-profile/store/assignment/audit transaction with failure compensation.
- Added explicit signup-trial access projections and read-only mutation behavior after trial expiry, cancellation, or suspension.
- Replaced the authenticated shell identity, current business/store, usage, and empty dashboard metrics with tenant-scoped database projections while preserving the explicit unauthenticated development demo.
- Implemented membership-authorized business switching through Better Auth active-organization state and per-session active-store switching that is revalidated against active member-store assignments on every request.
- Added tenant team settings for invitation, plan-capacity checks, fixed roles, explicit store grants, role/store updates, invitation cancellation, protected removal, and audited acceptance-time grant activation.
- Made invitation activation retryable and idempotent across Better Auth membership acceptance and application-owned store assignment provisioning.
- Added an owner-only billing console with centralized monthly/annual plan pricing, Stripe Checkout, Customer Portal, upgrade/downgrade, period-end cancellation, cancellation restore, server-counted usage, and safe disabled states when Stripe is not configured. Tenant administrators retain read-only billing visibility.
- Added post-signature Stripe event projection from Better Auth subscription state into tenant entitlements, including active/trialing state, one bounded past-due grace period, paid-through cancellation access, platform-suspension preservation, replay protection, and durable failed-event diagnostics.
- Kept checkout redirects informational: only verified Stripe webhook processing can update plan access.
- Added versioned indexes, deterministic two-tenant operational fixtures, MongoDB replica-set and Mailpit Compose services, health routes, standalone Docker image, and GitHub Actions CI.
- Ran all six database migrations and the deterministic seed against MongoDB 8, including integration coverage for overlapping-tenant repository isolation, atomic onboarding, authorized workspace projections, cross-tenant store rejection, invitation grant activation, and verified billing lifecycle projection.
- Validated the complete authenticated onboarding flow on desktop and mobile, including accessibility, database assertions, redirect behavior, and test-data cleanup.
- Validated business/store switching and member invitation, role/store update, cancellation, and removal on desktop and mobile, including accessibility and database assertions.
- Validated the owner billing console on desktop and mobile, including accessibility, interval switching, safe unconfigured-provider states, and proof that a successful-return URL cannot mutate entitlements.

## Pending tasks in the current slices

- Expand the live dashboard from accurate empty/current totals to bounded sales trends, store comparisons, and tenant-scoped activity feeds.
- Enforce mandatory 2FA on platform-super-admin routes and add the server-only bootstrap command and protected platform shell.
- Complete product edit/archive/detail, categories/tags/variants/images, CSV preview/import/export, inventory adjustment, and stock transfer workflows.

## Important decisions

- Better Auth organizations are the tenant identity; Qenvaro will not duplicate memberships.
- Better Auth and tenant-owned collections share canonical UUID strings, avoiding mixed BSON/string identity comparisons in scoped repositories.
- MongoDB is accessed with typed repositories and Zod, without an ORM.
- Money is stored as integer minor units. Inventory mutations use an append-only ledger and projection in a transaction.
- Pages remain usable with a deterministic development demo when local infrastructure is not running; production never enables demo authorization or billing bypass implicitly.
- Stripe is only for Qenvaro subscriptions and subscription truth comes from verified, idempotent webhooks.
- Signup trials are explicit, expiring access projections; they do not masquerade as paid Stripe subscriptions.
- Business choices are derived from signed-in Better Auth memberships. Store choice is session-local application state and never expands the membership’s active store assignments.
- Better Auth owns invitations and memberships; Qenvaro owns pending invitation-store grants and materializes them only after the invited identity has accepted.
- Better Auth owns Stripe Checkout, Portal, signature verification, and subscription rows. Qenvaro projects only post-verification subscription state into tenant entitlements and never treats a redirect as billing truth.
- Subscription mutation is owner-only. Tenant administrators can inspect plan and usage but cannot launch Checkout, Portal, cancellation, or restore actions.

## Exact next action if interrupted

Implement the platform security slice: add the server-only super-admin bootstrap command, require verified 2FA for every platform route, and build the first protected platform shell with aggregate tenant/subscription/verified-webhook health views that never expose tenant business records.
