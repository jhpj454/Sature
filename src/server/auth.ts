import crypto from "node:crypto";
import { cookies } from "next/headers";

export const SESSION_COOKIE_NAME = "session_token";
const SESSION_TTL_DAYS = 7;

export function buildSessionCookieValue(agencyId: string, sessionToken: string) {
  return `${agencyId}:${sessionToken}`;
}

export function parseSessionCookieValue(rawValue: string | undefined) {
  if (!rawValue) {
    return null;
  }

  const separatorIdx = rawValue.indexOf(":");
  if (separatorIdx <= 0 || separatorIdx === rawValue.length - 1) {
    return null;
  }

  return {
    agencyId: rawValue.slice(0, separatorIdx),
    sessionToken: rawValue.slice(separatorIdx + 1),
  };
}

export function generateSessionToken() {
  return crypto.randomBytes(32).toString("hex");
}

export function getSessionExpiryDate() {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + SESSION_TTL_DAYS);
  return expiresAt;
}

export async function setSessionCookie(value: string, expiresAt: Date) {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    expires: expiresAt,
    path: "/",
  });
}

export async function clearSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 0,
    expires: new Date(0),
    path: "/",
  });
}
