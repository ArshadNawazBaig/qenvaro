import "server-only";
import pino from "pino";
import { env } from "@/config/env";

export const logger = pino({
  name: "qenvaro",
  level: env.LOG_LEVEL,
  redact: {
    paths: [
      "password",
      "token",
      "authorization",
      "cookie",
      "salary",
      "amountMinor",
      "paymentMethod",
      "req.headers.authorization",
      "req.headers.cookie",
    ],
    censor: "[REDACTED]",
  },
  base: { service: "qenvaro-web", environment: env.NODE_ENV },
});
