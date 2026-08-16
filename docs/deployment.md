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
- **Other object storage:** the S3-compatible configuration remains available for future private exports and documents; it is not used for product images.
- **Email:** verify the sending domain and set Resend credentials. Keep invitation and reset links on the canonical app origin.

## Production checklist

Run migrations as a separate release step, bootstrap super-admin emails with the server-only CLI, then deploy the immutable Docker image behind TLS. Migration 12 provisions product-import preview/job indexes, migration 13 provisions TTL cleanup for application request throttles, migration 16 creates tenant default units and backfills product assignments, and migration 17 normalizes legacy customer profiles and adds their tenant lifecycle query indexes. Configure secrets in the platform secret manager, `NODE_ENV=production`, health probes, log collection, optional Sentry/OpenTelemetry, Mongo/Stripe alerts, backups, and webhook retry monitoring. Monitor repeated CSV `429` responses and import/export job failures without logging source rows. Treat the bootstrap environment and MongoDB credentials as privileged production access. Removing an address from `SUPER_ADMIN_EMAILS` prevents future bootstrap eligibility but does not revoke an existing role; a dedicated audited revocation workflow remains pending.

Never run `db:seed` or `db:reset` in production. `ALLOW_DEV_BILLING_BYPASS=true` is rejected when `NODE_ENV=production`.
