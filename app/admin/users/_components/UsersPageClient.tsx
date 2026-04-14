"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiFetch } from "@/app/lib/apiClient";
import { DataTable } from "@/app/ams/_components/DataTable";
import { StatusBadge } from "@/app/ams/_components/StatusBadge";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { Select } from "@/app/components/ui/select";

type User = {
  id: string;
  display_name: string;
  email: string;
  role: string;
  status: string;
  last_login_at: string | null;
  created_at: string;
};

type EditState = {
  userId: string;
  display_name: string;
  role: string;
  status: string;
};

function formatDate(iso: string | null) {
  if (!iso) return "Never";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function InviteModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ display_name: string; email: string; tempPassword: string } | null>(null);

  if (created) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/20 backdrop-blur-sm p-4">
        <div className="w-full max-w-md rounded-lg border border-slate-200/30 bg-white p-6 shadow-xl">
          <h2 className="text-lg font-semibold text-slate-800">User Created</h2>
          <p className="mt-1 text-sm text-slate-400">
            Share these credentials with <strong>{created.display_name}</strong>. The temporary
            password is shown only once.
          </p>
          <div className="mt-4 space-y-3 rounded-lg border border-slate-200/30 bg-white/30 p-4 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="text-slate-400">Email</span>
              <span className="font-mono text-slate-800">{created.email}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-slate-400">Temp password</span>
              <span className="font-mono font-semibold tracking-widest text-slate-800">
                {created.tempPassword}
              </span>
            </div>
          </div>
          <p className="mt-3 text-xs text-amber-600">
            This password will not be shown again. Make sure to copy it now.
          </p>
          <div className="mt-5 flex gap-2">
            <Button
              onClick={() => {
                void navigator.clipboard.writeText(
                  `Email: ${created.email}\nPassword: ${created.tempPassword}`,
                );
              }}
              size="sm"
              variant="outline"
            >
              Copy credentials
            </Button>
            <Button
              onClick={() => {
                onCreated();
                onClose();
              }}
              size="sm"
            >
              Done
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/20 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-lg border border-slate-200/30 bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-800">Add User</h2>
            <p className="mt-1 text-sm text-slate-400">
              Create a new user for your agency. A temporary password will be generated.
            </p>
          </div>
          <Button onClick={onClose} size="sm" variant="outline">
            Close
          </Button>
        </div>
        <form
          className="mt-5 space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setIsSaving(true);
            setError(null);
            const fd = new FormData(e.currentTarget);
            try {
              const res = await apiFetch<{
                ok: true;
                data: { user: User; tempPassword: string };
              }>("/api/admin/users", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  display_name: String(fd.get("display_name") || "").trim(),
                  email: String(fd.get("email") || "").trim(),
                  role: String(fd.get("role") || "csr"),
                }),
              });
              setCreated({
                display_name: res.data.user.display_name,
                email: res.data.user.email,
                tempPassword: res.data.tempPassword,
              });
            } catch (err) {
              setError(err instanceof Error ? err.message : "Failed to create user.");
            } finally {
              setIsSaving(false);
            }
          }}
        >
          <label className="block space-y-1">
            <span className="text-sm text-slate-500">Full name</span>
            <Input name="display_name" placeholder="Jane Smith" required />
          </label>
          <label className="block space-y-1">
            <span className="text-sm text-slate-500">Email</span>
            <Input name="email" placeholder="jane@agency.com" required type="email" />
          </label>
          <label className="block space-y-1">
            <span className="text-sm text-slate-500">Role</span>
            <Select className="w-full" defaultValue="csr" name="role">
              <option value="csr">CSR</option>
              <option value="producer">Producer</option>
              <option value="marketing">Marketing</option>
              <option value="admin">Admin</option>
            </Select>
          </label>
          {error ? <p className="text-sm text-rose-500">{error}</p> : null}
          <div className="flex gap-2">
            <Button disabled={isSaving} type="submit">
              {isSaving ? "Creating..." : "Create User"}
            </Button>
            <Button onClick={onClose} type="button" variant="outline">
              Cancel
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function EditModal({
  state,
  onClose,
  onSaved,
}: {
  state: EditState;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState(state.display_name);
  const [role, setRole] = useState(state.role);
  const [status, setStatus] = useState(state.status);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/20 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-lg border border-slate-200/30 bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <h2 className="text-lg font-semibold text-slate-800">Edit User</h2>
          <Button onClick={onClose} size="sm" variant="outline">
            Close
          </Button>
        </div>
        <form
          className="mt-5 space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setIsSaving(true);
            setError(null);
            try {
              await apiFetch(`/api/admin/users/${state.userId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ display_name: displayName, role, status }),
              });
              onSaved();
              onClose();
            } catch (err) {
              setError(err instanceof Error ? err.message : "Failed to save changes.");
            } finally {
              setIsSaving(false);
            }
          }}
        >
          <label className="block space-y-1">
            <span className="text-sm text-slate-500">Full name</span>
            <Input
              onChange={(e) => setDisplayName(e.target.value)}
              required
              value={displayName}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-sm text-slate-500">Role</span>
            <Select className="w-full" onChange={(e) => setRole(e.target.value)} value={role}>
              <option value="csr">CSR</option>
              <option value="producer">Producer</option>
              <option value="marketing">Marketing</option>
              <option value="admin">Admin</option>
            </Select>
          </label>
          <label className="block space-y-1">
            <span className="text-sm text-slate-500">Status</span>
            <Select className="w-full" onChange={(e) => setStatus(e.target.value)} value={status}>
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
            </Select>
          </label>
          {error ? <p className="text-sm text-rose-500">{error}</p> : null}
          <div className="flex gap-2">
            <Button disabled={isSaving} type="submit">
              {isSaving ? "Saving..." : "Save Changes"}
            </Button>
            <Button onClick={onClose} type="button" variant="outline">
              Cancel
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function UsersPageClient({ initialUsers }: { initialUsers: User[] }) {
  const router = useRouter();
  const [showInvite, setShowInvite] = useState(false);
  const [editState, setEditState] = useState<EditState | null>(null);

  const columns = [
    {
      key: "name",
      header: "Name",
      render: (u: User) => (
        <span className="font-medium text-slate-800">{u.display_name}</span>
      ),
    },
    {
      key: "email",
      header: "Email",
      render: (u: User) => <span className="text-slate-500">{u.email}</span>,
    },
    {
      key: "role",
      header: "Role",
      render: (u: User) => (
        <span className="inline-flex rounded-full bg-white/30 px-2 py-0.5 text-xs font-medium capitalize text-slate-700">
          {u.role}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (u: User) => <StatusBadge value={u.status} />,
    },
    {
      key: "last_login",
      header: "Last login",
      render: (u: User) => (
        <span className="text-slate-400">{formatDate(u.last_login_at)}</span>
      ),
    },
    {
      key: "actions",
      header: "",
      render: (u: User) => (
        <Button
          onClick={() =>
            setEditState({
              userId: u.id,
              display_name: u.display_name,
              role: u.role,
              status: u.status,
            })
          }
          size="sm"
          variant="outline"
        >
          Edit
        </Button>
      ),
    },
  ];

  return (
    <>
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-800">Users</h1>
          <p className="mt-1 text-sm text-slate-400">
            {initialUsers.filter((u) => u.status === "active").length} active ·{" "}
            {initialUsers.length} total
          </p>
        </div>
        <Button onClick={() => setShowInvite(true)} size="sm">
          Add User
        </Button>
      </div>

      <div className="mt-5">
        <DataTable
          columns={columns}
          emptyMessage="No users yet."
          rowKey={(u) => u.id}
          rows={initialUsers}
        />
      </div>

      {showInvite ? (
        <InviteModal
          onClose={() => setShowInvite(false)}
          onCreated={() => router.refresh()}
        />
      ) : null}

      {editState ? (
        <EditModal
          onClose={() => setEditState(null)}
          onSaved={() => router.refresh()}
          state={editState}
        />
      ) : null}
    </>
  );
}
