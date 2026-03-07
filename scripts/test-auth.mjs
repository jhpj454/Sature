import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";
import { config as loadDotenv } from "dotenv";

loadDotenv({ path: ".env.local" });

const TEST_EMAIL = process.env.TEST_AUTH_EMAIL ?? "admin@saturate.dev";
const TEST_PASSWORD = process.env.TEST_AUTH_PASSWORD ?? "SaturateDev123!";

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
    json: text ? JSON.parse(text) : null,
    text,
  };
}

function firstCookiePair(setCookieHeader) {
  if (!setCookieHeader) {
    return null;
  }

  return setCookieHeader.split(";")[0] ?? null;
}

async function main() {
  const { child, baseUrl } = await startDevServer(3134);

  try {
    const loginRes = await apiRequest(baseUrl, "POST", "/api/auth/login", {
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
    });

    assert.equal(loginRes.response.status, 200, `login failed: ${loginRes.text}`);
    const loginSetCookie = loginRes.response.headers.get("set-cookie");
    assert.ok(loginSetCookie, "login should set auth cookie");
    const cookie = firstCookiePair(loginSetCookie);
    assert.ok(cookie && cookie.startsWith("session_token="));

    const meBeforeLogout = await apiRequest(baseUrl, "GET", "/api/auth/me", undefined, cookie);
    assert.equal(
      meBeforeLogout.response.status,
      200,
      `expected /api/auth/me to succeed before logout: ${meBeforeLogout.text}`,
    );
    assert.equal(meBeforeLogout.json?.ok, true);

    const logoutRes = await apiRequest(baseUrl, "POST", "/api/auth/logout", undefined, cookie);
    assert.equal(logoutRes.response.status, 200, `logout failed: ${logoutRes.text}`);
    assert.equal(logoutRes.json?.ok, true);

    const logoutSetCookie = logoutRes.response.headers.get("set-cookie") ?? "";
    assert.match(
      logoutSetCookie,
      /session_token=/,
      "logout should send session_token clearing cookie",
    );

    const meAfterLogout = await apiRequest(baseUrl, "GET", "/api/auth/me", undefined, cookie);
    assert.equal(
      meAfterLogout.response.status,
      401,
      `expected old cookie to be unauthorized after logout: ${meAfterLogout.text}`,
    );

    const logoutGetRes = await apiRequest(baseUrl, "GET", "/api/auth/logout", undefined, cookie);
    assert.equal(logoutGetRes.response.status, 405);

    process.stdout.write("Auth login/logout integration checks passed.\n");
  } finally {
    await stopDevServer(child);
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exitCode = 1;
});
