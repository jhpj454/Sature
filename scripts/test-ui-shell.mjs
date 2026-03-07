import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";

async function startDevServer(port) {
  for (const candidate of ["http://127.0.0.1:3000", `http://127.0.0.1:${port}`]) {
    const probe = await fetch(`${candidate}/login`, { redirect: "manual" }).catch(() => null);
    if (probe && (probe.status === 200 || probe.status === 307 || probe.status === 308)) {
      return { child: null, baseUrl: candidate };
    }
  }

  let logs = "";
  const child = spawn("npm", ["run", "dev", "--", "--port", String(port)], {
    cwd: process.cwd(),
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  child.stdout.on("data", (chunk) => {
    logs += chunk.toString();
  });
  child.stderr.on("data", (chunk) => {
    logs += chunk.toString();
  });

  const baseUrl = `http://127.0.0.1:${port}`;
  const start = Date.now();
  while (Date.now() - start < 120000) {
    if (child.exitCode !== null) {
      throw new Error(`Dev server exited with code ${child.exitCode}\n${logs}`);
    }

    const probe = await fetch(`${baseUrl}/login`, { redirect: "manual" }).catch(() => null);
    if (probe && (probe.status === 200 || probe.status === 307 || probe.status === 308)) {
      return { child, baseUrl };
    }

    await delay(500);
  }

  child.kill("SIGTERM");
  throw new Error(`Dev server startup timeout\n${logs}`);
}

async function stopDevServer(child) {
  if (!child || child.killed) return;
  child.kill("SIGTERM");
  await delay(500);
  if (!child.killed) {
    child.kill("SIGKILL");
  }
}

async function getRoute(baseUrl, path) {
  return fetch(`${baseUrl}${path}`, {
    method: "GET",
    redirect: "manual",
  });
}

function isRedirectStatus(status) {
  return status === 302 || status === 303 || status === 307 || status === 308;
}

async function main() {
  const { child, baseUrl } = await startDevServer(3135);

  try {
    const loginRes = await getRoute(baseUrl, "/login");
    assert.equal(loginRes.status, 200, "Expected /login to be reachable");

    for (const path of ["/ams", "/crm", "/marketing", "/admin"]) {
      const res = await getRoute(baseUrl, path);
      assert.equal(
        isRedirectStatus(res.status),
        true,
        `Expected unauthenticated ${path} to redirect, got ${res.status}`,
      );

      const location = res.headers.get("location") ?? "";
      assert.equal(
        location.includes("/login"),
        true,
        `Expected ${path} to redirect to /login, got location=${location}`,
      );
    }

    process.stdout.write("UI shell route/auth boundary smoke checks passed.\n");
  } finally {
    await stopDevServer(child);
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exitCode = 1;
});
