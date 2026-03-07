import { runner } from "node-pg-migrate";
import { migrationBaseConfig } from "./migrate.config.mjs";

const directionArg = process.argv[2];

if (directionArg !== "up" && directionArg !== "down") {
  throw new Error('Usage: node scripts/migrate.mjs <up|down>');
}

const options = {
  ...migrationBaseConfig,
  direction: directionArg,
  count: directionArg === "down" ? 1 : undefined,
  verbose: true,
};

const migrated = await runner(options);

if (migrated.length === 0) {
  console.log(`No migrations to run for direction: ${directionArg}`);
} else {
  console.log(`Executed ${migrated.length} migration(s):`);
  for (const m of migrated) {
    console.log(`- ${m.name}`);
  }
}
