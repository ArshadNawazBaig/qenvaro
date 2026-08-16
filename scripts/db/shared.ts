import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { MongoClient } from "mongodb";

for (const file of [".env.local", ".env"]) {
  if (existsSync(file)) loadEnvFile(file);
}

export function getScriptDatabase() {
  const uri = process.env.MONGODB_URI;
  const databaseName = process.env.MONGODB_DATABASE ?? "qenvaro";
  if (!uri)
    throw new Error("MONGODB_URI is required. Configure .env.local first.");
  if (process.env.NODE_ENV === "production")
    throw new Error(
      "Development database scripts cannot run with NODE_ENV=production.",
    );
  const client = new MongoClient(uri, { appName: "qenvaro-script" });
  return { client, databaseName };
}
