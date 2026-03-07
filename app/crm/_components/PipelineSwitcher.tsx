"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Select } from "@/app/components/ui/select";

type PipelineOption = {
  id: string;
  name: string;
};

export function PipelineSwitcher({
  pipelines,
  selectedPipelineId,
}: {
  pipelines: PipelineOption[];
  selectedPipelineId: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return (
    <Select
      aria-label="Pipeline"
      className="min-w-[220px]"
      onChange={(event) => {
        const next = new URLSearchParams(searchParams.toString());
        if (event.target.value) {
          next.set("pipeline_id", event.target.value);
        } else {
          next.delete("pipeline_id");
        }
        next.delete("pipeline_stage_id");
        const query = next.toString();
        router.push(query ? `${pathname}?${query}` : pathname);
      }}
      value={selectedPipelineId ?? ""}
    >
      {pipelines.map((pipeline) => (
        <option key={pipeline.id} value={pipeline.id}>
          {pipeline.name}
        </option>
      ))}
    </Select>
  );
}
