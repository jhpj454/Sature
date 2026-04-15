"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { Select } from "@/app/components/ui/select";
import { Modal } from "@/app/components/ui/modal";

type UserOption = {
  id: string;
  display_name: string;
  role: string;
};

type CustomerCreatePanelProps = {
  users: UserOption[];
};

export function CustomerCreatePanel({ users }: CustomerCreatePanelProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const producers = users.filter((user) => user.role === "producer" || user.role === "admin");
  const csrs = users.filter((user) => user.role === "csr" || user.role === "admin");

  function onSubmit(formData: FormData) {
    setError(null);
    const payload = {
      account_name: String(formData.get("account_name") ?? "").trim(),
      account_type: String(formData.get("account_type") ?? ""),
      status: String(formData.get("status") ?? ""),
      assigned_producer_id: String(formData.get("assigned_producer_id") ?? "") || null,
      assigned_csr_id: String(formData.get("assigned_csr_id") ?? "") || null,
    };

    startTransition(async () => {
      try {
        const response = await fetch("/api/accounts", {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });

        const body = (await response.json().catch(() => null)) as
          | { error?: string; data?: { id: string } }
          | null;

        if (!response.ok || !body?.data?.id) {
          throw new Error(body?.error ?? "Unable to create customer.");
        }

        setOpen(false);
        router.push(`/ams/accounts/${body.data.id}`);
        router.refresh();
      } catch (caughtError) {
        setError(
          caughtError instanceof Error ? caughtError.message : "Unable to create customer.",
        );
      }
    });
  }

  return (
    <>
      <Button onClick={() => setOpen(true)} size="sm">
        Create Customer
      </Button>
      <Modal
        onClose={() => {
          setOpen(false);
          setError(null);
        }}
        open={open}
        subtitle="Add a new customer to the agency management system."
        title="Create Customer"
      >
        <form
          action={onSubmit}
          className="grid gap-3 md:grid-cols-2"
        >
          <label className="text-sm">
            <span className="mb-1 block text-slate-400">Customer Name</span>
            <Input name="account_name" required />
          </label>

          <label className="text-sm">
            <span className="mb-1 block text-slate-400">Type</span>
            <Select defaultValue="commercial" name="account_type">
              <option value="commercial">commercial</option>
              <option value="personal">personal</option>
            </Select>
          </label>

          <label className="text-sm">
            <span className="mb-1 block text-slate-400">Status</span>
            <Select defaultValue="prospect" name="status">
              <option value="prospect">prospect</option>
              <option value="client">client</option>
              <option value="lost">lost</option>
            </Select>
          </label>

          <label className="text-sm">
            <span className="mb-1 block text-slate-400">Assigned Producer</span>
            <Select defaultValue="" name="assigned_producer_id">
              <option value="">None</option>
              {producers.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.display_name}
                </option>
              ))}
            </Select>
          </label>

          <label className="text-sm">
            <span className="mb-1 block text-slate-400">Assigned CSR</span>
            <Select defaultValue="" name="assigned_csr_id">
              <option value="">None</option>
              {csrs.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.display_name}
                </option>
              ))}
            </Select>
          </label>

          {error ? (
            <p className="md:col-span-2 text-sm text-rose-500">{error}</p>
          ) : null}

          <div className="md:col-span-2 flex items-center gap-2 pt-2">
            <Button disabled={isPending} size="sm" type="submit">
              {isPending ? "Creating..." : "Save Customer"}
            </Button>
            <Button
              disabled={isPending}
              onClick={() => {
                setOpen(false);
                setError(null);
              }}
              size="sm"
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
