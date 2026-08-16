# Qenvaro engineering guide

## Repository layout

- `src/app`: Next.js App Router pages, layouts, route handlers, and server actions. Keep route files thin.
- `src/components`: reusable UI primitives and composed application components.
- `src/modules`: domain schemas, types, services, and policies grouped by business capability.
- `src/server`: server-only infrastructure for auth, database, repositories, logging, email, storage, and tenant context.
- `src/config`: branding, plans, navigation, and validated environment configuration.
- `scripts`: idempotent database migrations and development seed/reset commands.
- `tests`: integration and end-to-end tests. Unit tests live beside the code they cover.
- `docs`: architecture, data model, authorization, security, and deployment references.

## Architecture rules

- This is a modular monolith. Page components compose; services enforce business rules; repositories query MongoDB.
- React components never access MongoDB or secrets. Client components must be narrowly scoped to interactivity.
- Server Components call server services directly. Route handlers adapt HTTP and Server Actions adapt forms; neither owns domain logic.
- Put Zod validation at trust boundaries. Money uses integer minor units and an ISO currency code.
- Use the shared cached MongoDB client. Important multi-document mutations use transactions and idempotency keys.
- Do not add an abstraction without two concrete use cases.

## Commands

- Develop: `pnpm dev`
- Build/start: `pnpm build`, `pnpm start`
- Quality: `pnpm lint`, `pnpm typecheck`, `pnpm format:check`
- Tests: `pnpm test`, `pnpm test:integration`, `pnpm test:e2e`
- Database: `pnpm db:migrate`, `pnpm db:seed`, `pnpm db:reset`

## Security and multi-tenancy

- Derive `tenantId`, membership, permissions, and allowed stores on the server. Never trust tenant, role, plan, price, stock, salary, or total values from a client.
- Every tenant query starts with trusted `tenantId`; store-owned queries also enforce authorized `storeId`. Cross-tenant misses return non-revealing not-found responses.
- Repositories accept `TenantContext`; unscoped tenant collection access is prohibited outside migrations and reconciliation scripts.
- Platform roles are server-controlled. Tenant authorization is resource/action based. UI gates are never the only control.
- Inventory is changed only through the inventory service and its append-only ledger. Sensitive changes create append-only audit entries.
- Never log secrets, tokens, credentials, full payment data, salary values, or unnecessary personal data.

## UI conventions

- Use semantic theme tokens and shared shadcn-style primitives. Avoid component-level hex colors.
- Warm light theme is the default; dark mode, keyboard focus, reduced motion, and WCAG AA contrast are required.
- Table/filter state belongs in URL search parameters. Large lists use bounded server pagination.
- All asynchronous views require meaningful loading, empty, error, and permission-denied states.
- Enabled navigation points only to a working route.

## Definition of done

A slice is done when authorization and tenant isolation are enforced server-side, schemas and indexes support its queries, relevant tests pass, the UI is responsive and accessible, docs and `PLANS.md` are truthful, and `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` succeed.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
