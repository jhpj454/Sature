"use client";

import { useState } from "react";
import { ManagePipelinesModal } from "@/app/crm/_components/ManagePipelinesModal";

type Props = {
  label?: string;
};

export function ManagePipelinesModalTrigger({ label = "Manage Pipelines" }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        style={{
          background: "rgba(51, 51, 51, 0.60)",
          backdropFilter: "blur(12px)",
          border: "1px solid rgba(255,255,255,0.10)",
          borderRadius: "8px",
          padding: "7px 16px",
          color: "hsl(0,0%,80%)",
          fontSize: "13px",
          fontFamily: "var(--font-instrument-sans)",
          cursor: "pointer",
          transition: "background 0.12s, border-color 0.12s",
          whiteSpace: "nowrap",
        }}
      >
        {label}
      </button>
      {open ? <ManagePipelinesModal onClose={() => setOpen(false)} /> : null}
    </>
  );
}
