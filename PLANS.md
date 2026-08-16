# Qenvaro implementation plan

Last updated: 2026-08-16

## Current status

Phase 0 is implemented and validated, including a completed image-inspired admin design refinement checkpoint. Phase 1, Phase 2, and the first security-bounded part of Phase 6 are in progress through a coherent identity/tenant/catalog/platform slice. The repository began empty; it now builds and runs with verified auth entry flows, transactional organization/first-store onboarding, membership-authorized business and store switching, tenant team administration, owner-controlled Stripe billing, mandatory per-session 2FA for the aggregate-only platform shell, an authenticated tenant dashboard, and tenant-scoped product, category, and tag lifecycles.

## Phases

| Phase | Scope                                                                                              | Status      |
| ----- | -------------------------------------------------------------------------------------------------- | ----------- |
| 0     | Next.js foundation, design system, MongoDB, environment, logging, tests, Docker, CI, documentation | Complete    |
| 1     | Better Auth, organizations, onboarding, RBAC, tenant/store shell, Stripe plan projection           | In progress |
| 2     | Products, categories, inventory ledger, CSV, tenant dashboard                                      | In progress |
| 3     | Customers, sales, returns, receipts and atomic inventory integration                               | Pending     |
| 4     | Employees, attendance, leave, compensation and operational payroll                                 | Pending     |
| 5     | Suppliers, purchases, receiving, expenses and reports                                              | Pending     |
| 6     | Platform administration, break-glass support controls and hardening                                | In progress |

## Completed tasks

- Recorded the modular-monolith, tenancy, authorization, UI, and definition-of-done rules in `AGENTS.md`.
- Selected stable Node 22, Next.js, React, TypeScript, MongoDB driver, Better Auth, Tailwind, Vitest, and Playwright foundations.
- Added root environment, lint, TypeScript, formatting, shadcn, and package configuration.
- Added warm light/dark design tokens, responsive public/auth/tenant shells, pricing, dashboard, and image-inspired product catalog views.
- Reworked the tenant admin experience into a restrained enterprise system: consistent pure-white light-mode structural surfaces with an ink dark-mode variant, a canonical compound card system shared across application and marketing views, expandable route groups, clear business/store context, a consolidated performance workspace, an exception-led action rail, stable accessible charts, and purposeful setup/empty states backed by live tenant data.
- Wired Better Auth MongoDB, email/password, verification, reset, Google configuration, organization invitations, admin, 2FA, database-backed rate limits, and organization Stripe subscription plugins.
- Added resource/action permissions, server-derived tenant context, store scoping, typed product repository, centralized plans/quotas, integer money helpers, and safe CSV escaping.
- Implemented atomic simple-product creation with default variant, opening inventory ledger/projection, quota enforcement, and an append-only audit event.
- Implemented tenant-scoped product detail, permission-gated catalog edits, optimistic version checks, synchronized default-variant SKU/pricing, idempotent audited archive, and authorized-store inventory summaries without permitting catalog mutations to alter inventory state.
- Implemented category list/create/edit/archive with normalized tenant uniqueness, optimistic concurrency, transactional product-assignment rename cascades, audited mutations, archive safeguards, URL-backed filters, and read-only demo/viewer states.
- Implemented tag list/create/edit/archive with stable identifier assignments, normalized tenant uniqueness, optimistic concurrency, audited mutations, active-product archive safeguards, product create/edit/detail integration, URL-backed catalog filtering, and read-only demo/viewer states.
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
- Ran all nine database migrations and the deterministic seed against MongoDB 8, including integration coverage for overlapping-tenant repository isolation, atomic onboarding, authorized workspace projections, cross-tenant store rejection, invitation grant activation, verified billing lifecycle projection, category/tag lifecycles, and platform security boundaries.
- Validated the complete authenticated onboarding flow on desktop and mobile, including accessibility, database assertions, redirect behavior, and test-data cleanup.
- Validated business/store switching and member invitation, role/store update, cancellation, and removal on desktop and mobile, including accessibility and database assertions.
- Validated the owner billing console on desktop and mobile, including accessibility, interval switching, safe unconfigured-provider states, and proof that a successful-return URL cannot mutate entitlements.
- Added an environment-allowlisted, server-only platform-super-admin bootstrap command that promotes only verified existing accounts, revokes pre-promotion sessions, emits an idempotent audit, and accepts no public or ad-hoc role input.
- Added mandatory platform TOTP enrollment and per-session second-factor assurance, including recovery-code support, lockout/throttling, a data-free security gateway, and fresh-session verification after sign-in.
- Added a responsive protected platform shell and aggregate-only tenant entitlement, subscription, verified Stripe event, migration, and database-health overview. The repository never queries tenant business collections.
- Ran all nine database migrations and validated platform bootstrap/access/aggregate boundaries in integration tests plus TOTP enrollment, stale-session rejection, re-verification, fresh login, and accessibility on desktop and mobile.
- Validated product create/detail/edit/archive on desktop and mobile with accessibility and database assertions, plus integration evidence for cross-tenant denial, stale-write rejection, audit events, and unchanged inventory levels/movements during archive.
- Validated category create/rename/assignment safeguard/archive on desktop and mobile with accessibility and database assertions, plus integration evidence for per-tenant uniqueness, rename cascades, stale-write rejection, permission enforcement, and retained historical assignments.
- Validated tag normalized uniqueness, tenant isolation, product assignment reads, stable rename behavior, stale-write rejection, permission enforcement, archive safeguards, and retained historical assignments in integration tests.

## Pending tasks in the current slices

- Expand the live dashboard from accurate empty/current totals to bounded sales trends, store comparisons, and tenant-scoped activity feeds.
- Complete variants/images, CSV preview/import/export, inventory adjustment, and stock transfer workflows.

## Important decisions

- Better Auth organizations are the tenant identity; Qenvaro will not duplicate memberships.
- Better Auth and tenant-owned collections share canonical UUID strings, avoiding mixed BSON/string identity comparisons in scoped repositories.
- MongoDB is accessed with typed repositories and Zod, without an ORM.
- Money is stored as integer minor units. Inventory mutations use an append-only ledger and projection in a transaction.
- Category records are the taxonomy authority. Active/draft products retain the category name for efficient catalog filtering; category rename updates those assignments transactionally, while archived products retain their historical category snapshot.
- Tag records use stable opaque identifiers. Products store a bounded set of tag IDs, so tag display-name and color updates never rewrite product records. Only active tenant tags can be assigned, and a tag cannot be archived while an active or draft product references it; archived products retain historical assignments.
- Pages remain usable with a deterministic development demo when local infrastructure is not running; production never enables demo authorization or billing bypass implicitly.
- The reference-inspired shell exposes only implemented destinations. The dashboard prioritizes operational hierarchy over decorative card grids; demo charts remain clearly labeled, while authenticated workspaces render honest empty analytics until tenant activity exists.
- Stripe is only for Qenvaro subscriptions and subscription truth comes from verified, idempotent webhooks.
- Signup trials are explicit, expiring access projections; they do not masquerade as paid Stripe subscriptions.
- Business choices are derived from signed-in Better Auth memberships. Store choice is session-local application state and never expands the membership’s active store assignments.
- Better Auth owns invitations and memberships; Qenvaro owns pending invitation-store grants and materializes them only after the invited identity has accepted.
- Better Auth owns Stripe Checkout, Portal, signature verification, and subscription rows. Qenvaro projects only post-verification subscription state into tenant entitlements and never treats a redirect as billing truth.
- Subscription mutation is owner-only. Tenant administrators can inspect plan and usage but cannot launch Checkout, Portal, cancellation, or restore actions.
- Platform role assignment is not a request capability. The trusted bootstrap reads only `SUPER_ADMIN_EMAILS`, requires verified existing users, revokes existing sessions on promotion, and records the change.
- Platform authorization requires exact global role membership, account-level TOTP enrollment, and an unexpired assurance for the current Better Auth session. The security gateway is the sole pre-assurance route and exposes no platform data.
- Platform reporting is metadata-only and aggregate by default. Break-glass tenant access remains unimplemented and disabled.

## Exact next action if interrupted

Implement tenant-scoped product variants and option groups with unique SKU enforcement, validated server actions, optimistic concurrency, audited lifecycle behavior, and inventory-safe assignment rules.
