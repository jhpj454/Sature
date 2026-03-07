import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";
import { config as loadDotenv } from "dotenv";

loadDotenv({ path: ".env.local" });

const CSR_EMAIL = "csr@saturate.dev";
const CSR_PASSWORD = "SaturateDev123!";

async function startDevServer(port) {
  for (const candidate of ["http://127.0.0.1:3000", `http://127.0.0.1:${port}`]) {
    const probe = await fetch(`${candidate}/api/auth/me`).catch(() => null);
    if (probe && (probe.status === 401 || probe.status === 200)) {
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

    const probe = await fetch(`${baseUrl}/api/auth/me`).catch(() => null);
    if (probe && (probe.status === 401 || probe.status === 200)) {
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

async function apiRequest(baseUrl, method, path, body, cookie) {
  const headers = { "Content-Type": "application/json" };
  if (cookie) {
    headers.Cookie = cookie;
  }

  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await response.text();
  return {
    response,
    text,
    json: text ? JSON.parse(text) : null,
  };
}

async function main() {
  const { child, baseUrl } = await startDevServer(3138);

  try {
    const login = await apiRequest(baseUrl, "POST", "/api/auth/login", {
      email: CSR_EMAIL,
      password: CSR_PASSWORD,
    });

    assert.equal(login.response.status, 200, `CSR login failed: ${login.text}`);
    const cookie = login.response.headers.get("set-cookie")?.split(";")[0];
    assert.ok(cookie, "Missing session cookie after CSR login");

    const me = await apiRequest(baseUrl, "GET", "/api/auth/me", undefined, cookie);
    assert.equal(me.response.status, 200, `Failed to load /api/auth/me: ${me.text}`);
    assert.ok(me.json?.user_id, "Missing user_id in session payload");

    const queue = await apiRequest(
      baseUrl,
      "GET",
      `/api/work-queue?assigned_to_user_id=${encodeURIComponent(me.json.user_id)}`,
      undefined,
      cookie,
    );

    assert.equal(queue.response.status, 200, queue.text);
    assert.equal(queue.json?.ok, true, "Expected ok=true from work queue endpoint");
    assert.ok(Array.isArray(queue.json?.data), "Expected work queue data array");

    process.stdout.write("AMS work queue checks passed.\n");
  } finally {
    await stopDevServer(child);
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exitCode = 1;
});
