"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Select } from "@/app/components/ui/select";

type StageOption = {
  id: string;
  name: string;
};

export function DealStageSelect({
  dealId,
  currentStageId,
  stages,
}: {
  dealId: string;
  currentStageId: string;
  stages: StageOption[];
}) {
  const router = useRouter();
  const [value, setValue] = useState(currentStageId);
  const [isSaving, setIsSaving] = useState(false);

  return (
    <Select
      className="h-8 w-full text-xs"
      disabled={isSaving}
      onChange={async (event) => {
        const nextStageId = event.target.value;
        const previousStageId = value;
        setValue(nextStageId);
        setIsSaving(true);
        const response = await fetch(`/api/crm/deals/${dealId}`, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pipeline_stage_id: nextStageId }),
        });
        setIsSaving(false);
        if (!response.ok) {
          setValue(previousStageId);
          const payload = (await response.json().catch(() => null)) as { error?: string } | null;
          window.alert(payload?.error ?? "Unable to move deal.");
          return;
        }
        router.refresh();
      }}
      value={value}
    >
      {stages.map((stage) => (
        <option key={stage.id} value={stage.id}>
          {stage.name}
        </option>
      ))}
    </Select>
  );
}
