"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { Select } from "@/app/components/ui/select";

type ContactCreatePanelProps = {
  accountId: string;
};

export function ContactCreatePanel({ accountId }: ContactCreatePanelProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [debugDetails, setDebugDetails] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function onSubmit(formData: FormData) {
    setError(null);
    setSuccess(null);
    setDebugDetails(null);

    const payload = {
      first_name: String(formData.get("first_name") ?? "").trim(),
      last_name: String(formData.get("last_name") ?? "").trim(),
      email: String(formData.get("email") ?? "").trim() || null,
      phone: String(formData.get("phone") ?? "").trim() || null,
      preferred_contact_method:
        String(formData.get("preferred_contact_method") ?? "").trim() || null,
      do_not_contact: formData.get("do_not_contact") === "on",
    };

    startTransition(async () => {
      try {
        const response = await fetch(`/api/accounts/${accountId}/contacts`, {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });

        const rawText = await response.text();
        const body = rawText
          ? (() => {
              try {
                return JSON.parse(rawText) as { error?: string; message?: string };
              } catch {
                return null;
              }
            })()
          : null;
        if (!response.ok) {
          const backendMessage =
            body?.error ??
            body?.message ??
            `Unable to create contact (status ${response.status}).`;
          if (process.env.NODE_ENV !== "production") {
            setDebugDetails(
              `Request: /api/accounts/${accountId}/contacts\nStatus: ${response.status}\nResponse: ${rawText.slice(0, 500) || "(empty response body)"}`,
            );
          }
          throw new Error(backendMessage);
        }

        setSuccess("Contact created.");
        setOpen(false);
        router.refresh();
      } catch (caughtError) {
        setError(
          caughtError instanceof Error ? caughtError.message : "Unable to create contact.",
        );
      }
    });
  }

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)} size="sm">
        Create Contact
      </Button>
    );
  }

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4">
      <form action={onSubmit} className="grid gap-3 md:grid-cols-2">
        <label className="text-sm">
          <span className="mb-1 block text-zinc-500">First Name</span>
          <Input name="first_name" required />
        </label>

        <label className="text-sm">
          <span className="mb-1 block text-zinc-500">Last Name</span>
          <Input name="last_name" required />
        </label>

        <label className="text-sm">
          <span className="mb-1 block text-zinc-500">Email</span>
          <Input name="email" type="email" />
        </label>

        <label className="text-sm">
          <span className="mb-1 block text-zinc-500">Phone</span>
          <Input name="phone" type="tel" />
        </label>

        <label className="text-sm">
          <span className="mb-1 block text-zinc-500">Preferred Contact Method</span>
          <Select defaultValue="" name="preferred_contact_method">
            <option value="">None</option>
            <option value="email">email</option>
            <option value="phone">phone</option>
            <option value="text">text</option>
          </Select>
        </label>

        <label className="flex items-center gap-2 text-sm text-zinc-700">
          <input className="h-4 w-4 rounded border-zinc-300" name="do_not_contact" type="checkbox" />
          Do not contact
        </label>

        <div className="flex items-end gap-2">
          <Button disabled={isPending} size="sm" type="submit">
            {isPending ? "Saving..." : "Save Contact"}
          </Button>
          <Button
            disabled={isPending}
            onClick={() => {
              setOpen(false);
              setError(null);
              setSuccess(null);
              setDebugDetails(null);
            }}
            size="sm"
            type="button"
            variant="outline"
          >
            Cancel
          </Button>
        </div>

        {success ? <p className="md:col-span-2 text-sm text-emerald-700">{success}</p> : null}
        {error ? <p className="md:col-span-2 text-sm text-rose-600">{error}</p> : null}
        {process.env.NODE_ENV !== "production" && debugDetails ? (
          <pre className="md:col-span-2 overflow-x-auto rounded bg-zinc-100 p-3 text-xs text-zinc-700 whitespace-pre-wrap">
            {debugDetails}
          </pre>
        ) : null}
      </form>
    </div>
  );
}
