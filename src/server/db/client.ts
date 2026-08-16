import "server-only";
import { MongoClient, type Db } from "mongodb";
import { env } from "@/config/env";

declare global {
  var __qenvaroMongoClient: MongoClient | undefined;
  var __qenvaroMongoClientPromise: Promise<MongoClient> | undefined;
}

function createClient(): MongoClient {
  const uri = env.MONGODB_URI ?? "mongodb://127.0.0.1:27017/?replicaSet=rs0";
  return new MongoClient(uri, {
    appName: "qenvaro",
    maxPoolSize: 20,
    minPoolSize: env.NODE_ENV === "production" ? 2 : 0,
    retryWrites: true,
  });
}

export function getMongoClientHandle(): MongoClient {
  globalThis.__qenvaroMongoClient ??= createClient();
  return globalThis.__qenvaroMongoClient;
}

export function getMongoClient(): Promise<MongoClient> {
  if (!env.MONGODB_URI)
    return Promise.reject(
      new Error("MONGODB_URI is required for database operations."),
    );
  globalThis.__qenvaroMongoClientPromise ??= getMongoClientHandle().connect();
  return globalThis.__qenvaroMongoClientPromise;
}

export async function getDatabase(): Promise<Db> {
  return (await getMongoClient()).db(env.MONGODB_DATABASE);
}
