import "server-only";
import { stripe } from "@better-auth/stripe";
import { betterAuth } from "better-auth";
import { mongodbAdapter } from "better-auth/adapters/mongodb";
import { nextCookies } from "better-auth/next-js";
import { admin } from "better-auth/plugins/admin";
import { organization } from "better-auth/plugins/organization";
import { twoFactor } from "better-auth/plugins/two-factor";
import Stripe from "stripe";
import { brand } from "@/config/brand";
import { env } from "@/config/env";
import { plans } from "@/config/plans";
import { projectVerifiedStripeEvent } from "@/modules/billing/stripe-projection";
import { getMongoClientHandle } from "@/server/db/client";
import { sendTransactionalEmail } from "@/server/email/provider";
import { betterAuthOrganizationRoles, betterAuthPlatformRoles } from "./access";

const mongoClient = getMongoClientHandle();
const database = mongoClient.db(env.MONGODB_DATABASE);
const buildOnlySecret =
  process.env.NEXT_PHASE === "phase-production-build"
    ? `${crypto.randomUUID()}${crypto.randomUUID()}`
    : undefined;
const organizationPlugin = organization({
  roles: betterAuthOrganizationRoles,
  creatorRole: "owner",
  membershipLimit: 100,
  invitationExpiresIn: 60 * 60 * 48,
  requireEmailVerificationOnInvitation: true,
  sendInvitationEmail: async (data) => {
    const url = new URL("/accept-invitation", env.NEXT_PUBLIC_APP_URL);
    url.searchParams.set("id", data.id);
    await sendTransactionalEmail({
      to: data.email,
      kind: "invitation",
      actionUrl: url.toString(),
      organizationName: data.organization.name,
    });
  },
});
const corePlugins = [
  organizationPlugin,
  admin({
    roles: betterAuthPlatformRoles,
    defaultRole: "user",
    adminRoles: ["PLATFORM_SUPER_ADMIN"],
    impersonationSessionDuration: 0,
  }),
  twoFactor({ issuer: brand.name }),
  nextCookies(),
];

const stripePlugin =
  env.STRIPE_SECRET_KEY && env.STRIPE_WEBHOOK_SECRET
    ? stripe({
        stripeClient: new Stripe(env.STRIPE_SECRET_KEY),
        stripeWebhookSecret: env.STRIPE_WEBHOOK_SECRET,
        createCustomerOnSignUp: false,
        organization: { enabled: true },
        subscription: {
          enabled: true,
          requireEmailVerification: true,
          plans: [
            {
              name: plans.starter.key,
              priceId: env.STRIPE_STARTER_MONTHLY_PRICE_ID,
              annualDiscountPriceId: env.STRIPE_STARTER_ANNUAL_PRICE_ID,
              limits: plans.starter.limits,
              freeTrial: { days: 14 },
            },
            {
              name: plans.growth.key,
              priceId: env.STRIPE_GROWTH_MONTHLY_PRICE_ID,
              annualDiscountPriceId: env.STRIPE_GROWTH_ANNUAL_PRICE_ID,
              limits: plans.growth.limits,
              freeTrial: { days: 14 },
            },
            {
              name: plans.business.key,
              priceId: env.STRIPE_BUSINESS_MONTHLY_PRICE_ID,
              annualDiscountPriceId: env.STRIPE_BUSINESS_ANNUAL_PRICE_ID,
              limits: plans.business.limits,
              freeTrial: { days: 14 },
            },
          ],
          authorizeReference: async ({ user, referenceId, action }) => {
            const membership = await database
              .collection<{ role: string }>("member")
              .findOne(
                { organizationId: referenceId, userId: user.id },
                { projection: { role: 1 } },
              );
            if (!membership) return false;
            const roles = membership.role.split(",").map((role) => role.trim());
            return action === "list-subscription"
              ? roles.some((role) => role === "owner" || role === "admin")
              : roles.includes("owner");
          },
        },
        onEvent: projectVerifiedStripeEvent,
      })
    : null;
const plugins = stripePlugin ? [stripePlugin, ...corePlugins] : corePlugins;

export const auth = betterAuth({
  appName: brand.name,
  baseURL: env.NEXT_PUBLIC_APP_URL,
  secret: env.BETTER_AUTH_SECRET ?? buildOnlySecret,
  trustedOrigins: [env.NEXT_PUBLIC_APP_URL],
  database: mongodbAdapter(database, {
    client: mongoClient,
    transaction: true,
  }),
  advanced: {
    cookiePrefix: "qenvaro",
    database: {
      generateId: () => crypto.randomUUID(),
      defaultFindManyLimit: 100,
    },
    defaultCookieAttributes: {
      httpOnly: true,
      sameSite: "lax",
      secure: env.NODE_ENV === "production",
    },
  },
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    minPasswordLength: 12,
    maxPasswordLength: 128,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) =>
      sendTransactionalEmail({
        to: user.email,
        kind: "password-reset",
        actionUrl: url,
      }),
  },
  emailVerification: {
    sendOnSignUp: true,
    sendOnSignIn: true,
    expiresIn: 60 * 60,
    sendVerificationEmail: async ({ user, url }) =>
      sendTransactionalEmail({
        to: user.email,
        kind: "verification",
        actionUrl: url,
      }),
  },
  account: { accountLinking: { enabled: true, trustedProviders: ["google"] } },
  socialProviders:
    env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
      ? {
          google: {
            clientId: env.GOOGLE_CLIENT_ID,
            clientSecret: env.GOOGLE_CLIENT_SECRET,
          },
        }
      : {},
  rateLimit: {
    enabled: true,
    storage: "database",
    window: 60,
    max: 100,
    customRules: {
      "/sign-in/email": { window: 60, max: 10 },
      "/sign-up/email": { window: 60 * 10, max: 5 },
      "/request-password-reset": { window: 60 * 10, max: 5 },
      "/organization/invite-member": { window: 60 * 10, max: 20 },
    },
  },
  plugins,
});
