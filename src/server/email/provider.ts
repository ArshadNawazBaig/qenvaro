import "server-only";
import nodemailer from "nodemailer";
import { Resend } from "resend";
import { brand } from "@/config/brand";
import { env } from "@/config/env";
import { logger } from "@/server/logging/logger";

type EmailKind =
  | "verification"
  | "password-reset"
  | "invitation"
  | "subscription"
  | "low-stock";
interface TransactionalEmail {
  to: string;
  kind: EmailKind;
  actionUrl?: string;
  organizationName?: string;
}
const copy: Record<
  EmailKind,
  { subject: string; heading: string; action: string }
> = {
  verification: {
    subject: `Verify your ${brand.name} email`,
    heading: "Verify your email",
    action: "Verify email",
  },
  "password-reset": {
    subject: `Reset your ${brand.name} password`,
    heading: "Reset your password",
    action: "Reset password",
  },
  invitation: {
    subject: `You’re invited to ${brand.name}`,
    heading: "Join your team",
    action: "Accept invitation",
  },
  subscription: {
    subject: `${brand.name} billing update`,
    heading: "Subscription update",
    action: "View billing",
  },
  "low-stock": {
    subject: "Products need attention",
    heading: "Low-stock alert",
    action: "Review inventory",
  },
};

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export async function sendTransactionalEmail(
  message: TransactionalEmail,
): Promise<void> {
  const content = copy[message.kind];
  if (env.EMAIL_PROVIDER === "log") {
    logger.info(
      { emailKind: message.kind },
      "Development email generated; URL and recipient redacted",
    );
    return;
  }
  const organization = message.organizationName
    ? ` for ${escapeHtml(message.organizationName)}`
    : "";
  const action = message.actionUrl
    ? `<a href="${escapeHtml(message.actionUrl)}" style="display:inline-block;background:#2459d3;color:white;text-decoration:none;padding:11px 18px;border-radius:8px;font-weight:600">${content.action}</a>`
    : "";
  const html = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#202124"><h1>${content.heading}</h1><p>This message was sent by ${brand.name}${organization}.</p>${action}<p style="margin-top:28px;color:#687078;font-size:13px">If you did not request this, you can ignore this email.</p></div>`;
  if (env.EMAIL_PROVIDER === "smtp") {
    const transport = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: false,
    });
    await transport.sendMail({
      from: env.EMAIL_FROM,
      to: message.to,
      subject: content.subject,
      html,
    });
    return;
  }
  if (!env.RESEND_API_KEY)
    throw new Error("RESEND_API_KEY is required when EMAIL_PROVIDER=resend.");
  const resend = new Resend(env.RESEND_API_KEY);
  const { error } = await resend.emails.send({
    from: env.EMAIL_FROM,
    to: message.to,
    subject: content.subject,
    html,
  });
  if (error)
    throw new Error(`Email provider rejected ${message.kind} message.`);
}
