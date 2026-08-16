import { getScriptDatabase } from "./shared";

async function main() {
  const { client, databaseName } = getScriptDatabase();
  if (!databaseName.startsWith("qenvaro"))
    throw new Error(`Refusing to reset unexpected database: ${databaseName}`);
  try {
    await client.connect();
    await client.db(databaseName).dropDatabase();
    process.stdout.write(
      `Dropped development database ${databaseName}. Run migrations and seed next.\n`,
    );
  } finally {
    await client.close();
  }
}

await main();
