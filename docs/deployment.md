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

## External services

- **Google OAuth:** create a web application and register `${NEXT_PUBLIC_APP_URL}/api/auth/callback/google`; provide client ID/secret.
- **Stripe test mode:** create monthly/annual Prices for each public plan, set Price IDs, and forward events to `/api/auth/stripe/webhook`. The installed Better Auth Stripe plugin verifies the raw signature before applying subscription updates and invoking the safe event-record callback.
- **MongoDB Atlas:** use a replica set, least-privilege database user, TLS, network restrictions, backups, and tested restore procedures.
- **Object storage:** create a private S3-compatible bucket, restricted service credentials, CORS for the application origin, lifecycle rules, and a separate public delivery host if desired.
- **Email:** verify the sending domain and set Resend credentials. Keep invitation and reset links on the canonical app origin.

## Production checklist

Run migrations as a separate release step, bootstrap super-admin emails with the server-only CLI, then deploy the immutable Docker image behind TLS. Configure secrets in the platform secret manager, `NODE_ENV=production`, health probes, log collection, optional Sentry/OpenTelemetry, Mongo/Stripe alerts, backups, and webhook retry monitoring.

Never run `db:seed` or `db:reset` in production. `ALLOW_DEV_BILLING_BYPASS=true` is rejected when `NODE_ENV=production`.
