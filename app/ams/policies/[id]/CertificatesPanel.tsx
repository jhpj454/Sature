"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/app/lib/apiClient";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { formatDate } from "@/app/ams/_lib/format";

export type IssuedCoi = {
  id: string;
  status: string;
  issued_at: string;
  issued_by_name: string | null;
  holder_name: string | null;
  holder_address: string | null;
};

export function CertificatesPanel({
  initialData,
  policyId,
}: {
  initialData: IssuedCoi[];
  policyId: string;
}) {
  const router = useRouter();
  const [showModal, setShowModal] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [holderName, setHolderName] = useState("");
  const [holderAddress, setHolderAddress] = useState("");

  async function handleIssue(e: React.FormEvent) {
    e.preventDefault();
    setIsSaving(true);
    setError(null);

    try {
      const res = await apiFetch<{ ok: true; data: { coi_request_id: string } }>(
        `/api/ams/policies/${policyId}/coi`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            holder_name: holderName.trim(),
            holder_address: holderAddress.trim() || null,
          }),
        },
      );

      // Trigger download immediately in a new tab
      window.open(
        `/api/ams/policies/${policyId}/coi/${res.data.coi_request_id}/download`,
        "_blank",
      );

      setShowModal(false);
      setHolderName("");
      setHolderAddress("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to issue certificate.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-medium">Certificates of Insurance</h2>
          <p className="mt-0.5 text-xs text-amber-600">
            Sample certificates only — pending ACORD vendor license.
          </p>
        </div>
        <Button onClick={() => setShowModal(true)} size="sm">
          Issue Certificate
        </Button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-zinc-100 text-left text-zinc-600">
            <tr>
              <th className="px-3 py-2">Certificate Holder</th>
              <th className="px-3 py-2">Address</th>
              <th className="px-3 py-2">Issued By</th>
              <th className="px-3 py-2">Date Issued</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {initialData.length === 0 ? (
              <tr>
                <td className="px-3 py-8 text-center text-zinc-500" colSpan={5}>
                  No certificates issued for this policy.
                </td>
              </tr>
            ) : (
              initialData.map((coi) => (
                <tr className="border-t border-zinc-200" key={coi.id}>
                  <td className="px-3 py-2 font-medium">{coi.holder_name ?? "—"}</td>
                  <td className="px-3 py-2 text-zinc-500">{coi.holder_address ?? "—"}</td>
                  <td className="px-3 py-2 text-zinc-500">{coi.issued_by_name ?? "—"}</td>
                  <td className="px-3 py-2">{formatDate(coi.issued_at)}</td>
                  <td className="px-3 py-2">
                    <a
                      className="text-xs text-blue-700 hover:underline"
                      href={`/api/ams/policies/${policyId}/coi/${coi.id}/download`}
                      rel="noreferrer"
                      target="_blank"
                    >
                      Download
                    </a>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-lg rounded-lg border border-zinc-200 bg-white p-6 shadow-xl">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h3 className="font-semibold text-zinc-900">Issue Certificate</h3>
                <p className="mt-1 text-sm text-zinc-500">
                  Enter the certificate holder details. Policy and coverage data will be
                  pulled from this policy automatically.
                </p>
              </div>
              <Button onClick={() => setShowModal(false)} size="sm" variant="outline">
                Close
              </Button>
            </div>

            <form className="space-y-4" onSubmit={handleIssue}>
              <label className="block space-y-1">
                <span className="text-sm text-zinc-600">Certificate holder name</span>
                <Input
                  onChange={(e) => setHolderName(e.target.value)}
                  placeholder="ABC Construction Co."
                  required
                  value={holderName}
                />
              </label>
              <label className="block space-y-1">
                <span className="text-sm text-zinc-600">Holder address</span>
                <Input
                  onChange={(e) => setHolderAddress(e.target.value)}
                  placeholder="123 Main St, Springfield, IL 62701"
                  value={holderAddress}
                />
              </label>

              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                This will generate a <strong>sample certificate</strong> marked with a watermark.
                The official ACORD 25 form will be available once the ACORD vendor license is
                obtained.
              </div>

              {error ? <p className="text-sm text-rose-600">{error}</p> : null}

              <div className="flex gap-2">
                <Button disabled={isSaving} type="submit">
                  {isSaving ? "Generating..." : "Issue & Download"}
                </Button>
                <Button onClick={() => setShowModal(false)} type="button" variant="outline">
                  Cancel
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </section>
  );
}
