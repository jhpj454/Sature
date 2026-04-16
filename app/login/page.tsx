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
        <div className="w-full max-w-md rounded-2xl border border-white/50 dark:border-white/[0.06] bg-white/45 dark:bg-[#252528] p-6 shadow-lg backdrop-blur-xl dark:backdrop-blur-none dark:shadow-none">
          <p className="text-sm text-slate-400 dark:text-[#9da5b4]">Checking session...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl border border-white/50 dark:border-white/[0.06] bg-white/45 dark:bg-[#252528] p-6 shadow-xl backdrop-blur-xl dark:backdrop-blur-none dark:shadow-none">
        <h1 className="text-2xl font-semibold text-slate-800 dark:text-[#e8eaf0]">Sature</h1>
        <p className="mt-1 text-sm text-slate-400 dark:text-[#9da5b4]">Sign in to your workspace.</p>

        <form className="mt-6 space-y-4" onSubmit={onSubmit}>
          <label className="block text-sm">
            <span className="mb-1 block text-slate-500 dark:text-[#9da5b4]">Email</span>
            <input
              autoComplete="email"
              className="w-full rounded-lg border border-slate-300/40 dark:border-white/[0.08] bg-transparent dark:bg-[rgba(255,255,255,0.06)] px-3 py-2 text-slate-800 dark:text-[#e8eaf0] placeholder:text-slate-400 dark:placeholder:text-[#9da5b4] outline-none ring-zinc-300 dark:ring-white/20 focus:ring"
              onChange={(event) => setEmail(event.target.value)}
              required
              type="email"
              value={email}
            />
          </label>

          <label className="block text-sm">
            <span className="mb-1 block text-slate-500 dark:text-[#9da5b4]">Password</span>
            <input
              autoComplete="current-password"
              className="w-full rounded-lg border border-slate-300/40 dark:border-white/[0.08] bg-transparent dark:bg-[rgba(255,255,255,0.06)] px-3 py-2 text-slate-800 dark:text-[#e8eaf0] placeholder:text-slate-400 dark:placeholder:text-[#9da5b4] outline-none ring-zinc-300 dark:ring-white/20 focus:ring"
              onChange={(event) => setPassword(event.target.value)}
              required
              type="password"
              value={password}
            />
          </label>

          {error ? <p className="text-sm text-rose-500">{error}</p> : null}

          <button
            className="w-full rounded-lg bg-slate-800 dark:bg-[rgba(255,255,255,0.12)] dark:hover:bg-[rgba(255,255,255,0.18)] px-3 py-2 text-sm font-medium text-white dark:text-[#e8eaf0] transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={isSubmitting}
            type="submit"
          >
            {isSubmitting ? "Signing in..." : "Sign In"}
          </button>
        </form>

        {process.env.NODE_ENV !== "production" ? (
          <div className="mt-6 rounded-xl border border-white/50 dark:border-white/[0.06] bg-white/30 dark:bg-[rgba(255,255,255,0.04)] p-3 backdrop-blur-xl dark:backdrop-blur-none">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-[#9da5b4]">
              Switch Account (Dev)
            </p>
            <p className="mt-1 text-xs text-slate-400 dark:text-[#9da5b4]">
              Click an email to fill the login form. Dev password: <span className="font-medium text-slate-700 dark:text-[#e8eaf0]">SaturateDev123!</span>
            </p>
            <div className="mt-3 space-y-2">
              {DEV_USERS.map((devEmail) => (
                <button
                  className="block w-full rounded-lg border border-white/50 dark:border-white/[0.08] bg-white/30 dark:bg-[rgba(255,255,255,0.06)] px-2 py-1.5 text-left text-sm text-slate-700 dark:text-[#e8eaf0] transition-colors hover:bg-white/80 dark:hover:bg-[rgba(255,255,255,0.12)]"
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
