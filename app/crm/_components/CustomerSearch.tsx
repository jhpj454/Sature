"use client";

import { useState, useRef, useEffect } from "react";

type Customer = { id: string; legal_name: string };

export function CustomerSearch({
  value,
  onChange,
  inputStyle,
  placeholder,
}: {
  value: string;
  onChange: (id: string) => void;
  inputStyle: React.CSSProperties;
  placeholder?: string;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Customer[]>([]);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // If value is cleared externally, reset display
  useEffect(() => {
    if (!value) {
      setQuery("");
    }
  }, [value]);

  function handleInput(e: React.ChangeEvent<HTMLInputElement>) {
    const q = e.target.value;
    setQuery(q);
    onChange("");
    setOpen(true);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      if (!q.trim()) { setResults([]); return; }
      try {
        const res = await fetch(`/api/crm/customers?search=${encodeURIComponent(q)}&page_size=8`);
        const json = await res.json();
        if (json.ok && Array.isArray(json.data)) {
          setResults(json.data);
        }
      } catch {
        // ignore
      }
    }, 200);
  }

  function select(c: Customer) {
    setQuery(c.legal_name);
    onChange(c.id);
    setOpen(false);
    setResults([]);
  }

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      <input
        style={inputStyle}
        value={query}
        onChange={handleInput}
        onFocus={() => { if (results.length > 0) setOpen(true); }}
        placeholder={placeholder ?? "Search customer name…"}
        autoComplete="off"
      />
      {open && results.length > 0 && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            right: 0,
            background: "rgba(28, 28, 28, 0.98)",
            backdropFilter: "blur(12px)",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 8,
            zIndex: 500,
            overflow: "hidden",
            boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
          }}
        >
          {results.map((c, i) => (
            <div
              key={c.id}
              onMouseDown={() => select(c)}
              style={{
                padding: "9px 12px",
                fontSize: 14,
                fontFamily: "var(--font-instrument-sans)",
                color: "hsl(0,0%,85%)",
                cursor: "pointer",
                borderBottom: i < results.length - 1 ? "1px solid rgba(255,255,255,0.06)" : "none",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.06)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLDivElement).style.background = "transparent";
              }}
            >
              {c.legal_name}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
