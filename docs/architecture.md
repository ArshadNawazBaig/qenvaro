# Architecture

## Shape

Qenvaro is a modular monolith deployed as one Next.js application with MongoDB, Cloudinary product-image delivery, object storage for future private documents, transactional email, and Stripe Billing. Module boundaries keep domain logic extractable without paying the operational cost of microservices today.

```mermaid
flowchart LR
  Browser[Browser] --> App[Next.js application]
  App --> Auth[Better Auth]
  App --> Services[Domain services]
  Auth --> Mongo[(MongoDB replica set)]
  Services --> Repos[Scoped repositories]
  Repos --> Mongo
  Services --> Storage[Cloudinary and object storage]
  Services --> Email[Email provider]
  Stripe[Stripe Billing] --> Webhook[Verified webhook route]
  Webhook --> Services
```

## Request boundary

1. A Server Component, Server Action, or Route Handler reads the authenticated Better Auth session.
2. The tenant slug is resolved to an organization and membership. The resulting server-only `TenantContext` includes permissions and allowed stores.
3. A thin adapter validates input with Zod and calls a service.
4. The service enforces permissions, plan entitlements, invariants, and idempotency.
5. A repository constructs a query beginning with the trusted tenant scope and returns a projection.
6. Sensitive successful and rejected actions emit structured audit events without secret values.

Product images use an authenticated Route Handler because bounded multipart files exceed the normal Server Action contract. The adapter verifies same-origin browser requests and tenant access, Cloudinary performs the image upload/normalization, and the product-image service transactionally attaches only validated provider metadata. Provider/database partial failures use compensating deletion plus durable cleanup state.

Product CSV operations also use authenticated Route Handlers. Uploads are UTF-8, same-origin, and bounded to 2 MB, 30 columns, 500 rows, and 1,000 characters per cell; JSON mutation bodies are streamed through a 64 KB ceiling. A user-owned 30-minute preview record supports explicit mapping, row validation, and reject/skip/update policy without changing the catalog. Commit rechecks tenant permissions, entitlement, quotas, tags, category state, SKU reservations, product versions, and authorized store context inside one transaction. Filtered exports are capped at 10,000 rows and spreadsheet-formula escaped.

The dashboard remains a read-heavy Server Component. A dedicated repository receives trusted tenant context and one of two Zod-bounded periods, aligns calendar buckets to the tenant timezone, and runs indexed sales/audit projections. Active-store trends never broaden beyond the selected authorized store; comparisons are capped to authorized active stores; and activity is both time/row bounded and allowlisted before safe summaries reach the view. Recharts is isolated to a narrow Client Component and receives serializable projection data with an equivalent screen-reader table.

First-workspace onboarding uses Better Auth to create the organization and owner membership, sets that organization on the authenticated session, then commits the tenant profile, first store, owner store assignment, signup-trial projection, and audit entry in one MongoDB transaction. A failed application transaction compensates by removing the just-created organization, so partial workspaces are not retained.

## Module boundary

Each real domain under `src/modules` owns its schemas, policies, calculations, and service orchestration. Shared infrastructure under `src/server` owns concerns that are domain-neutral: authentication, tenant context, database sessions, logging, email, and storage. Routes do not fetch the application's own HTTP API from the server.

## Reliability

- One cached `MongoClient` is shared per process.
- Ledger/projection workflows execute in retry-safe transactions.
- Event handlers keep provider event IDs and apply updates idempotently.
- Page sizes, request bodies, CSV previews, exports, dashboard date ranges, store rankings, and activity feeds are bounded. CSV request throttles use database-backed fixed windows so limits survive process restarts and multiple application instances. Tenant-sensitive results are not globally cached.
- Health routes reveal liveness/readiness only, never connection strings or configuration.
