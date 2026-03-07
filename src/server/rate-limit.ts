type RateLimitEntry = {
  count: number;
  resetAt: number;
};

const loginAttempts = new Map<string, RateLimitEntry>();
const WINDOW_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;

export function getRateLimitKey(ip: string | null, email: string) {
  return `${ip ?? "unknown"}:${email.toLowerCase()}`;
}

export function isRateLimited(key: string): boolean {
  const now = Date.now();
  const entry = loginAttempts.get(key);

  if (!entry) {
    return false;
  }

  if (entry.resetAt <= now) {
    loginAttempts.delete(key);
    return false;
  }

  return entry.count >= MAX_ATTEMPTS;
}

export function recordFailedAttempt(key: string) {
  const now = Date.now();
  const entry = loginAttempts.get(key);

  if (!entry || entry.resetAt <= now) {
    loginAttempts.set(key, {
      count: 1,
      resetAt: now + WINDOW_MS,
    });
    return;
  }

  loginAttempts.set(key, {
    count: entry.count + 1,
    resetAt: entry.resetAt,
  });
}

export function clearAttempts(key: string) {
  loginAttempts.delete(key);
}
