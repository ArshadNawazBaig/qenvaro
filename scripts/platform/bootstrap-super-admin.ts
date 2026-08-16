import { getScriptDatabase } from "../db/shared";
import { bootstrapConfiguredSuperAdmins } from "./bootstrap-service";

const emails = (process.env.SUPER_ADMIN_EMAILS ?? "")
  .split(",")
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean);
const { client, databaseName } = getScriptDatabase({ allowProduction: true });

try {
  await client.connect();
  const result = await bootstrapConfiguredSuperAdmins(
    client.db(databaseName),
    emails,
  );
  process.stdout.write(
    [
      "Platform super-admin bootstrap complete.",
      `Configured: ${result.configured}`,
      `Promoted: ${result.promoted}`,
      `Already configured: ${result.alreadyConfigured}`,
      `Missing accounts: ${result.missing}`,
      `Unverified accounts: ${result.unverified}`,
      "Promoted users must sign in again and complete platform two-factor verification.",
    ].join("\n") + "\n",
  );
} finally {
  await client.close();
}
