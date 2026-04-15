"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { apiFetch } from "@/app/lib/apiClient";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { Select } from "@/app/components/ui/select";
import { Modal } from "@/app/components/ui/modal";

type StageOption = {
  id: string;
  name: string;
};

type AccountOption = {
  id: string;
  account_name: string;
};

type ProducerOption = {
  id: string;
  display_name: string;
};

export function CreateDealModal({
  pipelineId,
  stages,
  accounts,
  producers,
}: {
  pipelineId: string;
  stages: StageOption[];
  accounts: AccountOption[];
  producers: ProducerOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const defaultStage = useMemo(() => stages[0]?.id ?? "", [stages]);

  if (!pipelineId) {
    return (
      <Button disabled size="sm">
        Create Deal
      </Button>
    );
  }

  return (
    <>
      <Button onClick={() => setOpen(true)} size="sm">
        Create Deal
      </Button>
      <Modal
        onClose={() => setOpen(false)}
        open={open}
        subtitle="Capture a producer opportunity with estimated revenue as the primary metric."
        title="Create Deal"
      >
        <form
          className="grid gap-4 md:grid-cols-2"
          onSubmit={async (event) => {
            event.preventDefault();
            setIsSaving(true);
            setError(null);
            const formData = new FormData(event.currentTarget);
            const payload = {
              pipeline_id: pipelineId,
              pipeline_stage_id: String(formData.get("pipeline_stage_id") || defaultStage),
              account_id: String(formData.get("account_id") || "") || null,
              producer_user_id: String(formData.get("producer_user_id") || "") || null,
              name: String(formData.get("name") || "").trim(),
              estimated_revenue: Number(formData.get("estimated_revenue") || 0),
              estimated_premium: String(formData.get("estimated_premium") || "")
                ? Number(formData.get("estimated_premium"))
                : null,
              estimated_commission_pct: String(formData.get("estimated_commission_pct") || "")
                ? Number(formData.get("estimated_commission_pct")) / 100
                : null,
              expected_close_date:
                String(formData.get("expected_close_date") || "") || null,
              next_step: String(formData.get("next_step") || "") || null,
            };

            try {
              await apiFetch("/api/crm/deals", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
              });
              setOpen(false);
              router.refresh();
            } catch (caught) {
              setError(caught instanceof Error ? caught.message : "Unable to create deal.");
            } finally {
              setIsSaving(false);
            }
          }}
        >
          <label className="space-y-1 md:col-span-2">
            <span className="text-sm text-slate-500">Deal name</span>
            <Input name="name" placeholder="Main Street Manufacturing renewal" required />
          </label>
          <label className="space-y-1">
            <span className="text-sm text-slate-500">Stage</span>
            <Select defaultValue={defaultStage} name="pipeline_stage_id">
              {stages.map((stage) => (
                <option key={stage.id} value={stage.id}>
                  {stage.name}
                </option>
              ))}
            </Select>
          </label>
          <label className="space-y-1">
            <span className="text-sm text-slate-500">Owner</span>
            <Select defaultValue="" name="producer_user_id">
              <option value="">Current producer</option>
              {producers.map((producer) => (
                <option key={producer.id} value={producer.id}>
                  {producer.display_name}
                </option>
              ))}
            </Select>
          </label>
          <label className="space-y-1">
            <span className="text-sm text-slate-500">Customer</span>
            <Select defaultValue="" name="account_id">
              <option value="">No linked customer</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.account_name}
                </option>
              ))}
            </Select>
          </label>
          <label className="space-y-1">
            <span className="text-sm text-slate-500">Expected close date</span>
            <Input name="expected_close_date" type="date" />
          </label>
          <label className="space-y-1">
            <span className="text-sm text-slate-500">Estimated revenue</span>
            <Input min="0" name="estimated_revenue" required step="0.01" type="number" />
          </label>
          <label className="space-y-1">
            <span className="text-sm text-slate-500">Estimated premium</span>
            <Input min="0" name="estimated_premium" step="0.01" type="number" />
          </label>
          <label className="space-y-1">
            <span className="text-sm text-slate-500">Commission %</span>
            <Input max="100" min="0" name="estimated_commission_pct" step="0.01" type="number" />
          </label>
          <label className="space-y-1 md:col-span-2">
            <span className="text-sm text-slate-500">Next step</span>
            <Input name="next_step" placeholder="Call insured to confirm proposal review" />
          </label>
          {error ? <p className="text-sm text-rose-500 md:col-span-2">{error}</p> : null}
          <div className="flex items-center gap-2 md:col-span-2 pt-2">
            <Button disabled={isSaving} type="submit">
              {isSaving ? "Saving..." : "Create Deal"}
            </Button>
            <Button onClick={() => setOpen(false)} type="button" variant="outline">
              Cancel
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
