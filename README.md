# Qenvaro

Qenvaro is a multi-tenant retail and service operations SaaS built as a Next.js modular monolith. The first delivery focuses on secure tenancy foundations and a polished catalog/dashboard slice; progress is tracked honestly in [PLANS.md](./PLANS.md).

## Quick start

1. Install Node.js 22+ and pnpm 11.
2. Copy `.env.example` to `.env.local` and set a random `BETTER_AUTH_SECRET`.
3. Start MongoDB and Mailpit with `docker compose up -d`.
4. Run `pnpm install`, `pnpm db:migrate`, and `pnpm db:seed`.
5. Start the app with `pnpm dev` and visit `http://localhost:3000`.

The UI can be previewed without MongoDB using its deterministic development demo, including read-only product details, images, categories, tags, option groups, and variants. Live tenants can create, inspect, edit, and archive products at `/app/{tenantSlug}/products`, import and export filtered catalog data on Growth or higher plans, manage Cloudinary-hosted product galleries from each product detail screen, manage categories at `/app/{tenantSlug}/products/categories`, manage reusable product tags at `/app/{tenantSlug}/products/tags`, and configure product-specific options and sellable variants. The CSV workflow includes a downloadable template, explicit column mapping and existing-SKU policy, row-level preview/validation, a downloadable error report, and an atomic audited commit. Mutations, authentication, billing projections, platform security, and tenant isolation tests require the replica set. Catalog edits use optimistic concurrency. Product and zero-stock variant archive preserve inventory records, while category, tag, option, image, and import safeguards protect lifecycle invariants. Product image uploads remain safely disabled until all three server-only `CLOUDINARY_*` credentials are configured. The tenant billing console is available at `/app/{tenantSlug}/settings/billing`; without Stripe test credentials it remains safely read-only.

Database-backed checks run with `RUN_INTEGRATION_TESTS=true pnpm test:integration`. The authenticated onboarding, workspace/team/billing/product/category/CSV lifecycle, and platform-2FA browser flows run on desktop and mobile with `RUN_ONBOARDING_E2E=true RUN_WORKSPACE_E2E=true RUN_PLATFORM_E2E=true pnpm test:e2e`; they create isolated identities and remove them afterward. Tag, variant, and product-image lifecycle behavior is covered by the integration suite, while their responsive read-only surfaces are covered by the catalog browser test. Mailpit is available at `http://localhost:8025` for local verification, reset, and invitation messages.

To bootstrap a platform super administrator, first create and verify the account, put its normalized email in the server-only `SUPER_ADMIN_EMAILS` setting, and run `pnpm platform:bootstrap-super-admin`. The command accepts no email argument, promotes only verified configured accounts, revokes their existing sessions, and records an idempotent platform audit. After signing in again, visit `/platform`; the security gateway requires authenticator enrollment and current-session verification before any aggregate platform metadata is loaded.

See [deployment](./docs/deployment.md), [architecture](./docs/architecture.md), and [security](./docs/security.md) for production configuration.
