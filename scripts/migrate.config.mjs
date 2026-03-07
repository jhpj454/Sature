import path from "node:path";
import { config as loadDotenv } from "dotenv";

loadDotenv({ path: path.resolve(process.cwd(), ".env.local") });

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required in .env.local for migrations.");
}

export const migrationBaseConfig = {
  databaseUrl: process.env.DATABASE_URL,
  dir: path.resolve(process.cwd(), "migrations"),
  migrationsTable: "pgmigrations",
  checkOrder: true,
};
