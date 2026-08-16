"use client";

import { createAuthClient } from "better-auth/react";
import {
  adminClient,
  organizationClient,
  twoFactorClient,
} from "better-auth/client/plugins";

export const authClient = createAuthClient({
  plugins: [organizationClient(), adminClient(), twoFactorClient()],
});
