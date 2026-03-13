import { safeApiFetchJson } from "@/app/ams/_lib/api";
import { InlineError } from "@/app/ams/_components/InlineError";
import { UsersPageClient } from "./_components/UsersPageClient";

type User = {
  id: string;
  display_name: string;
  email: string;
  role: string;
  status: string;
  last_login_at: string | null;
  created_at: string;
};

export default async function AdminUsersPage() {
  const res = await safeApiFetchJson<{ ok: true; data: User[] }>("/api/admin/users");

  if (!res.ok) {
    return <InlineError details={res.errorMessage} retryHref="/admin/users" />;
  }

  const users = res.data.data ?? [];

  return (
    <div className="space-y-2">
      <UsersPageClient initialUsers={users} />
    </div>
  );
}
