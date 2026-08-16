# Qenvaro

Qenvaro is a multi-tenant retail and service operations SaaS built as a Next.js modular monolith. The first delivery focuses on secure tenancy foundations and a polished catalog/dashboard slice; progress is tracked honestly in [PLANS.md](./PLANS.md).

## Quick start

1. Install Node.js 22+ and pnpm 11.
2. Copy `.env.example` to `.env.local` and set a random `BETTER_AUTH_SECRET`.
3. Start MongoDB and Mailpit with `docker compose up -d`.
4. Run `pnpm install`, `pnpm db:migrate`, and `pnpm db:seed`.
5. Start the app with `pnpm dev` and visit `http://localhost:3000`.

The UI can be previewed without MongoDB using its deterministic development demo, but mutations, authentication, billing projections, and tenant isolation tests require the replica set. The tenant billing console is available at `/app/{tenantSlug}/settings/billing`; without Stripe test credentials it remains safely read-only.

Database-backed checks run with `RUN_INTEGRATION_TESTS=true pnpm test:integration`. The authenticated onboarding and workspace/team browser flows run on desktop and mobile with `RUN_ONBOARDING_E2E=true RUN_WORKSPACE_E2E=true pnpm test:e2e`; they create isolated identities and remove them afterward. Mailpit is available at `http://localhost:8025` for local verification, reset, and invitation messages.

See [deployment](./docs/deployment.md), [architecture](./docs/architecture.md), and [security](./docs/security.md) for production configuration.
