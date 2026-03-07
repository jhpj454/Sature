import { config as loadDotenv } from "dotenv";
import process from "node:process";
import {
  closeRenewalAutomationJobPool,
  runRenewalAutomationJob,
} from "../../src/server/jobs/renewals-job.mjs";

loadDotenv({ path: ".env.local" });

async function main() {
  const scopeArg = process.argv.find((arg) => arg.startsWith("--scope="));
  const scope = scopeArg?.split("=")[1] ?? "all";

  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not configured.");
  }

  if (scope !== "all") {
    throw new Error("Only --scope=all is supported for the CLI runner.");
  }

  const result = await runRenewalAutomationJob({
    initiatedByUserId: null,
    requestMeta: {
      requestId: "cli:run-renewals",
      ipAddress: null,
      userAgent: "cli:run-renewals",
    },
  });

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);

  await closeRenewalAutomationJobPool();
}

main().catch(async (error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  await closeRenewalAutomationJobPool().catch(() => undefined);
  process.exitCode = 1;
});
