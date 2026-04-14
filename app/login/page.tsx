"use client";

/*
Manual test checklist:
1) Open /login while logged out and verify form renders.
2) Submit valid producer credentials -> lands on /crm.
3) Submit valid csr credentials -> lands on /ams.
4) Submit valid marketing credentials -> lands on /marketing.
5) Submit valid admin credentials -> lands on /admin.
6) Visit /ams as producer and verify redirect to /crm.
7) Visit /crm as csr and verify redirect to /ams.
*/

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchMe, homeRouteForRole, login } from "@/app/lib/auth";

const DEV_USERS = [
  "admin@saturate.dev",
  "csr@saturate.dev",
  "producer@saturate.dev",
  "marketing@saturate.dev",
];

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isChecking, setIsChecking] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const checkSession = async () => {
      try {
        const me = await fetchMe();
        if (isMounted && me) {
          router.replace(homeRouteForRole(me.role));
          return;
        }
      } catch {
        // Keep user on login screen if session check fails.
      }

      if (isMounted) {
        setIsChecking(false);
      }
    };

    void checkSession();

    return () => {
      isMounted = false;
    };
  }, [router]);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const response = await login(email.trim().toLowerCase(), password);
      router.replace(homeRouteForRole(response.user.role));
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Login failed.");
      setIsSubmitting(false);
    }
  }

  if (isChecking) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="w-full max-w-md rounded-2xl border border-white/60 bg-white/75 p-6 shadow-lg backdrop-blur-xl">
          <p className="text-sm text-zinc-500">Checking session...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl border border-white/60 bg-white/75 p-6 shadow-xl backdrop-blur-xl">
        <h1 className="text-2xl font-semibold text-zinc-900">Sature</h1>
        <p className="mt-1 text-sm text-zinc-500">Sign in to your workspace.</p>

        <form className="mt-6 space-y-4" onSubmit={onSubmit}>
          <label className="block text-sm">
            <span className="mb-1 block text-zinc-600">Email</span>
            <input
              autoComplete="email"
              className="w-full rounded border border-zinc-300 px-3 py-2 outline-none ring-zinc-300 focus:ring"
              onChange={(event) => setEmail(event.target.value)}
              required
              type="email"
              value={email}
            />
          </label>

          <label className="block text-sm">
            <span className="mb-1 block text-zinc-600">Password</span>
            <input
              autoComplete="current-password"
              className="w-full rounded border border-zinc-300 px-3 py-2 outline-none ring-zinc-300 focus:ring"
              onChange={(event) => setPassword(event.target.value)}
              required
              type="password"
              value={password}
            />
          </label>

          {error ? <p className="text-sm text-rose-600">{error}</p> : null}

          <button
            className="w-full rounded-lg bg-zinc-800 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={isSubmitting}
            type="submit"
          >
            {isSubmitting ? "Signing in..." : "Sign In"}
          </button>
        </form>

        {process.env.NODE_ENV !== "production" ? (
          <div className="mt-6 rounded-xl border border-white/60 bg-white/50 p-3 backdrop-blur-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              Switch Account (Dev)
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              Click an email to fill the login form. Dev password: <span className="font-medium text-zinc-700">SaturateDev123!</span>
            </p>
            <div className="mt-3 space-y-2">
              {DEV_USERS.map((devEmail) => (
                <button
                  className="block w-full rounded-lg border border-white/60 bg-white/50 px-2 py-1.5 text-left text-sm text-zinc-700 transition-colors hover:bg-white/80"
                  key={devEmail}
                  onClick={() => setEmail(devEmail)}
                  type="button"
                >
                  {devEmail}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
