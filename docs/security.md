# Security model

## Trust boundaries

- Sessions use secure HTTP-only cookies. Tenant/store/role/plan/price/stock/total fields from clients are untrusted.
- Inputs are parsed into known primitives with Zod; repositories construct MongoDB expressions and never spread request objects into filters or updates.
- Tenant repositories require trusted server context and always scope queries. Object keys are generated server-side and include non-guessable identifiers.
- Business switch targets are joined back to the signed-in user’s membership. Active-store selections are revalidated against active tenant store assignments before they affect a query.
- Better Auth owns invitation acceptance and membership state. Pending application store grants are tenant-scoped and activated idempotently only for the accepted membership.
- Better Auth verifies the raw Stripe webhook signature and updates its subscription row before invoking Qenvaro’s projection callback. The callback persists event identity/status and updates organization entitlements transactionally and idempotently; failed verified events remain visible for retry.

## Controls

- Email verification, password reset, safe redirects, optional 2FA, and persistent rate limits protect account entry points.
- Uploads enforce MIME/type/size policy and use presigned URLs. MongoDB never stores image binaries.
- Logs and audits omit passwords, tokens, salary values, payment details, and unnecessary PII. Production responses omit stack traces.
- Security headers deny framing and sniffing and restrict browser capabilities. A deployment-specific Content Security Policy must be finalized against its asset providers.
- Production rejects development billing bypass and development seeds.
- Sensitive changes use fresh-session/reauthentication where supported.
- Subscription mutations are authorized twice: Qenvaro requires `billing:manage`, and Better Auth’s organization reference callback independently requires the owner role. Checkout/Portal redirects never grant access.

## Required evidence

Tests cover tenant/store/entity IDOR, privilege escalation, platform-role mass assignment, salary access, plan quota races, webhook replay, invalid workflow transitions, CSV formula injection, and malicious upload metadata. Security findings block release.

This application provides operational reporting and payroll workflows; it does not claim jurisdiction-specific tax, payroll, or statutory-accounting compliance.
