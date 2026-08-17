# Qenvaro implementation plan

Last updated: 2026-08-17

## Current status

All six implementation phases and the repository release gate are complete. The application covers authenticated multi-tenant onboarding and billing, catalog and inventory, customers and sales, employees and operational payroll, purchasing and expenses, tenant settings/governance, and a two-factor-protected platform control plane. The final tree passed formatting, lint, strict type checking, 101 unit tests, 91 MongoDB integration tests, 20 enabled desktop/mobile Playwright tests, migration/seed/reconciliation checks, the production build, and the security/diff review on 2026-08-17.

## Phases

| Phase | Scope                                                                              | Status   |
| ----- | ---------------------------------------------------------------------------------- | -------- |
| 0     | Foundation, design system, MongoDB, environment, tests, Docker, CI, documentation  | Complete |
| 1     | Identity, tenancy, onboarding, RBAC/custom roles, settings, Stripe billing, shells | Complete |
| 2     | Products, variants, Cloudinary media, CSV, inventory ledger, dashboard             | Complete |
| 3     | Customers, point of sale, receipts, returns/refunds, sales reports                 | Complete |
| 4     | Employees, account links, attendance, leave, salary profiles, payroll, payslips    | Complete |
| 5     | Suppliers, purchase orders, approval/receiving, expenses, operational reports      | Complete |
| 6     | Platform administration, suspension, support controls, hardening and documentation | Complete |

## Delivered capabilities

- Better Auth email/password, verification, reset, Google OAuth configuration, invitations, organization tenancy, account 2FA, mandatory platform TOTP, and per-session platform assurance.
- Transactional onboarding with first store, explicit signup trial, business/store switching, fixed resource/action roles, store grants, and Business-plan custom roles whose allowlisted permissions are merged into server authorization.
- Central plan catalog, Stripe Checkout/Portal, verified webhook entitlement projection, paid-through cancellation behavior, past-due grace, suspended-tenant billing recovery, atomic quotas, and a production-safe usage reconciliation command.
- Responsive white-surface tenant shell and canonical shared card system across dashboard, catalog, inventory, customers, sales, employees, purchasing, settings, governance, and reports.
- Tenant-scoped categories, tags, units, simple/variant products, Cloudinary galleries, availability, safe CSV preview/import/export, append-only inventory movements, adjustments, transfers, and low-stock policy/alerts.
- Server-authoritative POS totals, split recorded tenders, immutable snapshots, atomic receipts/inventory/revenue/audit, partial/final returns, refunds, and tenant-calendar sales reporting.
- Employee lifecycle and account links, store assignments, attendance, leave, salary profiles, compensation isolation, payroll preparation/review/approval/finalization/reversal, immutable payslips, and explicit operational-payroll limitations.
- Supplier lifecycle, purchase snapshots and state machine, partial/final goods receipts, atomic stock integration, approved-only expenses, Cloudinary receipts, and operational purchasing/expense reporting.
- Business, regional, tax, numbering, inventory, integration-readiness, store, team, role, security, data export/deletion-request, notification, and advanced audit settings.
- Platform tenant/usage detail, global users and identity suspension, plans, subscriptions/trials/payment attention, verified webhooks, release flags, announcements, health, platform audit, tenant suspension/reactivation, and reason-required time-limited revocable support grants. The platform deliberately provides no tenant business-record browser.
- Twenty-nine versioned MongoDB migrations, deterministic isolated seed identities and operational data, development-only seed/reset safeguards, replica-set Docker Compose, Mailpit, health probes, standalone image, and CI.
- Privacy and terms placeholders are present and visibly marked for legal review.

## Important decisions

- Better Auth organizations and memberships are canonical tenant identities; application collections use the same opaque string IDs.
- Every business query starts with trusted tenant scope, and store scope comes from active membership assignments. Browser-hidden controls are never authorization.
- Money uses integer minor units. Inventory movements are append-only; levels are transactional projections. Completed commercial and payroll evidence is reversed or archived, never edited away.
- Stripe processes only the Qenvaro subscription. Tenant customer payment methods are operational records behind a provider interface.
- Subscription truth comes only from verified, idempotent webhooks. Successful return URLs never activate access.
- Cloudinary stores product and expense-receipt media behind authenticated same-origin server routes with generated keys, type/size validation, compensation, and cleanup evidence.
- Custom roles can grant only an explicit operational permission allowlist, only on Business/Enterprise, and never grant a capability the assigning administrator does not hold. Owner, billing, membership, tenant-deletion, and settings authority remain fixed-role controls.
- Full tenant audit browsing is a Business feature, but sensitive events are recorded on every plan. Audits omit tokens, passwords, payment credentials, compensation values, and unnecessary PII.
- Operational payroll and reports do not claim jurisdiction-specific payroll, tax, or statutory-accounting compliance.
- Platform support grants are disabled by default, reason-required, bounded to 15–120 minutes, visible, revocable, and audited. They do not create an unrestricted tenant-record view.

## Release gate

Passed on the final tree:

- `pnpm format:check`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `RUN_INTEGRATION_TESTS=true pnpm test:integration`
- relevant and full `pnpm test:e2e` projects
- `pnpm build`
- migration, deterministic seed, usage reconciliation, security search, and complete diff review

## Exact next action if interrupted

No implementation phase remains. For a production deployment, replace the intentionally marked privacy/terms placeholders with counsel-approved text, configure production Google, Stripe, email, Cloudinary, MongoDB, and observability secrets, run `pnpm db:migrate`, deploy the verified build, bootstrap allowlisted platform administrators, and execute provider-specific smoke tests in the target environment.
