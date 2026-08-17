# Deployment

## Local environment

Copy `.env.example` to `.env.local`, choose a 32+ character auth secret, then run:

```bash
docker compose up -d
pnpm install
pnpm db:migrate
pnpm db:seed
pnpm dev
```

MongoDB runs as a single-node replica set so transactions match production semantics. Mailpit exposes SMTP on `1025` and its UI on `8025`.
Use `EMAIL_PROVIDER=smtp` with the example SMTP host/port to complete verification, reset, and invitation flows through the local Mailpit inbox.
Set `DEVELOPMENT_SEED_PASSWORD` to a local value of at least 12 characters before `pnpm db:seed` when credential login is needed for the documented `*.example.test` seed identities. The seed refuses production, and no seed password is stored in source.

## Platform super-admin bootstrap

Platform roles are never accepted from signup, profile, organization, or admin request input. Bootstrap one or more existing accounts with this server-only process:

1. Create the account through the normal signup flow and complete email verification.
2. Set `SUPER_ADMIN_EMAILS` to a comma-separated allowlist in the server secret manager.
3. Run `pnpm platform:bootstrap-super-admin` from a trusted release or administrative environment with database access.
4. Sign in again and visit `/platform` to enroll and verify TOTP.

The command accepts no account argument. It only promotes verified emails already present in the environment allowlist, revokes pre-promotion sessions, and appends an idempotent platform audit. Missing and unverified accounts are counted without printing their addresses. Re-running the command is safe.

## External services

- **Google OAuth:** create a web application and register `${NEXT_PUBLIC_APP_URL}/api/auth/callback/google`; provide client ID/secret.
- **Stripe test mode:** create monthly/annual Prices for each public plan, set Price IDs, and forward events to `/api/auth/stripe/webhook`. Configure the Customer Portal for plan changes and cancellation. The installed Better Auth Stripe plugin verifies the raw signature and updates its subscription row before Qenvaro transactionally projects entitlements and durable event status. Exercise Checkout, Portal, `customer.subscription.*`, and webhook retries before production enablement.
- **MongoDB Atlas:** use a replica set, least-privilege database user, TLS, network restrictions, backups, and tested restore procedures.
- **Product images / Cloudinary:** create a restricted Cloudinary product environment and set `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET` only in the server secret manager. The application uploads through an authenticated same-origin route; never expose the API secret through a `NEXT_PUBLIC_*` variable. Configure provider usage alerts and review pending `productImages.cleanupStatus` and `mediaCleanupTasks` records operationally.
- **Expense receipts / Cloudinary:** the same server-only credentials back authenticated expense-receipt uploads. The route enforces tenant/store permission, MIME and 10 MB limits, generated keys, optimistic expense versions, and provider deletion if database attachment fails.
- **Other object storage:** the S3-compatible configuration remains available for future private exports and documents; it is not used for product images.
- **Email:** verify the sending domain and set Resend credentials. Keep invitation and reset links on the canonical app origin.

## Production checklist

Run migrations as a separate release step, bootstrap super-admin emails with the server-only CLI, then deploy the immutable Docker image behind TLS. The image starts `server.mjs`, which owns the Node HTTP server and attaches Next.js and Socket.IO to the same port. Configure the reverse proxy to preserve `Upgrade` and `Connection` headers for `/socket.io`, allow long-lived WebSocket connections, and keep the public origin in `NEXT_PUBLIC_APP_URL` exact. The current in-memory Socket.IO adapter is intentionally single-instance; before running multiple application replicas, add a shared Socket.IO adapter and sticky routing for polling connections, then test cross-instance delivery and recovery.

Migrations 12–21 cover CSV throttles, unit/customer normalization, POS, returns, and sales reporting. Migration 22 adds employee, attendance, leave, salary, payroll, and payslip indexes; migration 23 adds supplier, purchase, goods-receipt, and expense indexes; migrations 24–26 add tenant settings/custom roles, controlled data requests, notifications, platform flags/announcements/support/audit, tenant suspension scans, and user suspension visibility; migration 27 adds tenant-scoped managed expense categories; migration 28 adds tenant-scoped tax-rate names and one active default; migration 29 enforces authentication email, provider-account, tenant-membership, session, and verification lookup integrity; migration 30 adds tenant-unique active variant barcodes. Run `pnpm db:reconcile-usage` on a schedule and after bulk administrative repairs; it safely resets store, product, and member-plus-pending-invitation counters from source records.

Configure secrets in the platform secret manager, `NODE_ENV=production`, health probes, log collection, optional Sentry/OpenTelemetry, Mongo/Stripe alerts, backups, and webhook retry monitoring. Monitor repeated CSV `429` responses, catalog/report import-export job failures, failed Cloudinary cleanup records, stale webhook processing, active support grants, and tenant data requests without logging source rows. Treat the bootstrap environment and MongoDB credentials as privileged production access. Removing an address from `SUPER_ADMIN_EMAILS` prevents future bootstrap eligibility but does not revoke an existing role; revoke that global role only through a separate trusted administrative process.

Never run `db:seed` or `db:reset` in production. `ALLOW_DEV_BILLING_BYPASS=true` is rejected when `NODE_ENV=production`.
