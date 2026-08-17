# Qenvaro

Qenvaro is a production-oriented, multi-tenant retail and service operations SaaS built as a Next.js modular monolith. It includes secure identity and billing, catalog and inventory, customers and sales, workforce and operational payroll, purchasing and expenses, tenant governance, and a protected platform control plane.

## Quick start

1. Install Node.js 22+ and pnpm 11.
2. Copy `.env.example` to `.env.local` and set a random 32+ character `BETTER_AUTH_SECRET`.
3. Run `docker compose up -d` to start the MongoDB replica set and Mailpit.
4. Run `pnpm install`, `pnpm db:migrate`, and `pnpm db:seed`.
5. Start with `pnpm dev` and open `http://localhost:3000`. The custom Node server runs Next.js and the authenticated Socket.IO notification gateway on the same port.

The explicit `/app/demo` workspace provides responsive, read-only product, inventory, sales, workforce, purchasing, report, notification, and settings surfaces without authorizing mutations. Authenticated workspaces always use database-backed membership, permission, store, plan, and tenant scope.

## Useful commands

```bash
pnpm dev
pnpm lint
pnpm typecheck
pnpm test
RUN_INTEGRATION_TESTS=true pnpm test:integration
pnpm test:e2e
pnpm build
pnpm db:migrate
pnpm db:seed
pnpm db:reconcile-usage
```

`db:seed` and `db:reset` refuse production. The seed always creates deterministic verified identities for the platform administrator and Northstar owner, administrator, manager, cashier, inventory manager, HR manager, accountant, and employee roles. Set a local `DEVELOPMENT_SEED_PASSWORD` (12+ characters) before seeding to add credential accounts for those users; the owner login is `owner@northstar.example.test`, and the same owner belongs to both seeded businesses. The platform identity is `platform@qenvaro.example.test` and still requires TOTP before platform access. Without that environment value, identity and membership fixtures are created without reusable credentials. `db:reconcile-usage` is a safe administrative reconciliation for store, product, and member/invitation quota counters.

Product and expense-receipt uploads use Cloudinary when all three `CLOUDINARY_*` server credentials are configured. Stripe is exclusively for Qenvaro organization subscriptions; verified webhooks—not redirect URLs—control entitlements. Without provider credentials, the relevant controls remain safely disabled.

To bootstrap a platform super administrator, create and verify the account normally, add its normalized email to server-only `SUPER_ADMIN_EMAILS`, run `pnpm platform:bootstrap-super-admin`, sign in again, and visit `/platform`. The command accepts no email argument, revokes old sessions, and emits an idempotent audit. Platform access then requires TOTP enrollment and current-session verification.

See [PLANS.md](./PLANS.md), [architecture](./docs/architecture.md), [data model](./docs/data-model.md), [authorization](./docs/rbac.md), [security](./docs/security.md), and [deployment](./docs/deployment.md).
