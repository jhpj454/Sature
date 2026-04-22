"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

type ParsedRow = {
  first_name: string | null;
  last_name: string | null;
  company_name: string | null;
  email: string | null;
  phone: string | null;
};

const LABEL_STYLE: React.CSSProperties = {
  display: "block",
  fontSize: 11,
  fontFamily: "var(--font-instrument-sans)",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  color: "hsl(0,0%,50%)",
  marginBottom: 4,
};

const INPUT_STYLE: React.CSSProperties = {
  width: "100%",
  background: "hsl(220, 8%, 24%)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 8,
  padding: "8px 12px",
  color: "hsl(0,0%,100%)",
  fontFamily: "var(--font-instrument-sans)",
  fontSize: 14,
  outline: "none",
  boxSizing: "border-box",
};

function splitCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else { inQuotes = !inQuotes; }
    } else if (char === "," && !inQuotes) {
      values.push(current.trim()); current = "";
    } else {
      current += char;
    }
  }
  values.push(current.trim());
  return values;
}

function parseCsvText(text: string): ParsedRow[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = splitCsvLine(lines[0]).map((h) => h.toLowerCase().replace(/[^a-z0-9]+/g, "_"));
  const aliases: Record<keyof ParsedRow, string[]> = {
    first_name: ["first_name", "firstname", "first"],
    last_name: ["last_name", "lastname", "last", "surname"],
    company_name: ["company", "company_name", "business", "business_name", "account"],
    email: ["email", "email_address"],
    phone: ["phone", "phone_number", "mobile", "cell"],
  };
  const idx = Object.fromEntries(
    Object.entries(aliases).map(([target, keys]) => [
      target,
      headers.findIndex((h) => keys.includes(h)),
    ]),
  ) as Record<keyof ParsedRow, number>;

  return lines.slice(1).map((line) => {
    const vals = splitCsvLine(line);
    return {
      first_name: idx.first_name >= 0 ? vals[idx.first_name]?.trim() || null : null,
      last_name: idx.last_name >= 0 ? vals[idx.last_name]?.trim() || null : null,
      company_name: idx.company_name >= 0 ? vals[idx.company_name]?.trim() || null : null,
      email: idx.email >= 0 ? vals[idx.email]?.trim() || null : null,
      phone: idx.phone >= 0 ? vals[idx.phone]?.trim() || null : null,
    };
  }).filter((r) => r.first_name || r.last_name || r.company_name || r.email || r.phone);
}

async function parseExcelToCsvText(file: File): Promise<string> {
  const { read, utils } = await import("xlsx");
  const buffer = await file.arrayBuffer();
  const wb = read(buffer, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) throw new Error("No sheets found in file.");
  return utils.sheet_to_csv(ws);
}

export function ImportLeadsPanel({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<"upload" | "preview" | "done">("upload");
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [source, setSource] = useState("import");
  const [listName, setListName] = useState("");
  const [fileName, setFileName] = useState("");
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importedCount, setImportedCount] = useState(0);
  const [isDragOver, setIsDragOver] = useState(false);

  async function handleFile(file: File) {
    setParsing(true);
    setParseError(null);
    try {
      let csvText: string;
      const name = file.name.toLowerCase();
      if (name.endsWith(".xlsx") || name.endsWith(".xls") || name.endsWith(".ods")) {
        csvText = await parseExcelToCsvText(file);
      } else {
        csvText = await file.text();
      }
      const parsed = parseCsvText(csvText);
      if (parsed.length === 0) {
        setParseError("No valid rows found. Make sure your file has columns like first_name, last_name, company, email, or phone.");
        return;
      }
      setFileName(file.name);
      setListName(file.name.replace(/\.[^.]+$/, ""));
      setRows(parsed);
      setStep("preview");
    } catch (err) {
      setParseError(err instanceof Error ? err.message : "Failed to parse file.");
    } finally {
      setParsing(false);
    }
  }

  async function handleImport() {
    setImporting(true);
    setImportError(null);
    try {
      // Rebuild CSV from parsed rows
      const header = "first_name,last_name,company_name,email,phone";
      const csvLines = rows.map((r) =>
        [r.first_name, r.last_name, r.company_name, r.email, r.phone]
          .map((v) => (v ? `"${v.replace(/"/g, '""')}"` : ""))
          .join(","),
      );
      const csvContent = [header, ...csvLines].join("\n");
      const csvFile = new File([csvContent], `${listName || "import"}.csv`, { type: "text/csv" });

      const fd = new FormData();
      fd.append("file", csvFile);
      fd.append("source", source);
      if (listName) fd.append("list_name", listName);

      const res = await fetch("/api/crm/leads/import", {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      const json = await res.json() as { ok: boolean; data?: { created_count: number }; error?: string };
      if (!json.ok) throw new Error(json.error ?? "Import failed.");
      setImportedCount(json.data?.created_count ?? rows.length);
      setStep("done");
      setTimeout(() => { onClose(); router.refresh(); }, 1500);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Import failed.");
    } finally {
      setImporting(false);
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 49 }}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        style={{
          position: "fixed",
          right: 0,
          top: 0,
          bottom: 0,
          width: 520,
          background: "rgba(30, 30, 32, 0.98)",
          backdropFilter: "blur(24px)",
          borderLeft: "1px solid rgba(255,255,255,0.08)",
          zIndex: 50,
          overflowY: "auto",
          padding: 24,
          display: "flex",
          flexDirection: "column",
          gap: 20,
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h2 style={{ fontFamily: "var(--font-lora)", fontSize: "1.5rem", color: "hsl(0,0%,100%)", margin: 0 }}>
            Import Leads
          </h2>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", color: "hsl(0,0%,50%)", cursor: "pointer", fontSize: 20, padding: 4, lineHeight: 1 }}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {step === "upload" && (
          <>
            <p style={{ fontFamily: "var(--font-instrument-sans)", fontSize: 14, color: "hsl(0,0%,55%)", margin: 0 }}>
              Upload a CSV or Excel file. Supported columns: <span style={{ color: "hsl(0,0%,75%)" }}>first_name, last_name, company, email, phone</span>
            </p>

            {/* Drop zone */}
            <div
              onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragOver(false);
                const file = e.dataTransfer.files[0];
                if (file) void handleFile(file);
              }}
              onClick={() => fileInputRef.current?.click()}
              style={{
                border: `2px dashed ${isDragOver ? "rgba(255,255,255,0.30)" : "rgba(255,255,255,0.12)"}`,
                borderRadius: 12,
                padding: "40px 24px",
                textAlign: "center",
                cursor: "pointer",
                background: isDragOver ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.02)",
                transition: "border-color 0.15s, background 0.15s",
              }}
            >
              <div style={{ fontSize: 32, marginBottom: 12 }}>📂</div>
              <p style={{ fontFamily: "var(--font-instrument-sans)", fontSize: 14, color: "hsl(0,0%,70%)", margin: 0 }}>
                {parsing ? "Parsing file…" : "Drop your CSV or Excel file here, or click to browse"}
              </p>
              <p style={{ fontFamily: "var(--font-instrument-sans)", fontSize: 12, color: "hsl(0,0%,40%)", marginTop: 6 }}>
                .csv, .xlsx, .xls supported
              </p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx,.xls,.ods"
              style={{ display: "none" }}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f); }}
            />

            {parseError && (
              <p style={{ fontFamily: "var(--font-instrument-sans)", fontSize: 13, color: "#e05252", margin: 0 }}>
                {parseError}
              </p>
            )}
          </>
        )}

        {step === "preview" && (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div
                style={{
                  background: "rgba(255,255,255,0.06)",
                  border: "1px solid rgba(255,255,255,0.10)",
                  borderRadius: 8,
                  padding: "6px 12px",
                  fontFamily: "var(--font-instrument-sans)",
                  fontSize: 13,
                  color: "hsl(0,0%,70%)",
                }}
              >
                📄 {fileName}
              </div>
              <span style={{ fontFamily: "var(--font-instrument-sans)", fontSize: 13, color: "hsl(0,0%,50%)" }}>
                {rows.length} lead{rows.length !== 1 ? "s" : ""} found
              </span>
            </div>

            <div>
              <label style={LABEL_STYLE}>List Name</label>
              <input
                style={INPUT_STYLE}
                value={listName}
                onChange={(e) => setListName(e.target.value)}
                placeholder="e.g. Q2 Prospect List"
              />
            </div>

            <div>
              <label style={LABEL_STYLE}>Source</label>
              <select
                style={{ ...INPUT_STYLE, cursor: "pointer" }}
                value={source}
                onChange={(e) => setSource(e.target.value)}
              >
                <option value="import">Import</option>
                <option value="manual">Manual</option>
                <option value="referral">Referral</option>
                <option value="website">Website</option>
                <option value="social">Social</option>
                <option value="cold_call">Cold Call</option>
                <option value="other">Other</option>
              </select>
            </div>

            {/* Preview table */}
            <div
              style={{
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.07)",
                borderRadius: 10,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  maxHeight: 300,
                  overflowY: "auto",
                }}
              >
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                      {["Name / Company", "Email", "Phone"].map((h) => (
                        <th
                          key={h}
                          style={{
                            fontFamily: "var(--font-instrument-sans)",
                            fontSize: 11,
                            color: "hsl(0,0%,50%)",
                            textTransform: "uppercase",
                            letterSpacing: "0.05em",
                            padding: "8px 12px",
                            textAlign: "left",
                            fontWeight: 500,
                            position: "sticky",
                            top: 0,
                            background: "rgba(30, 30, 32, 0.95)",
                          }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 50).map((row, i) => {
                      const name = [row.first_name, row.last_name].filter(Boolean).join(" ") || row.company_name || "—";
                      return (
                        <tr key={i} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                          <td style={{ fontFamily: "var(--font-instrument-sans)", fontSize: 13, color: "hsl(0,0%,85%)", padding: "7px 12px" }}>
                            {name}
                            {row.company_name && (row.first_name || row.last_name) && (
                              <span style={{ color: "hsl(0,0%,45%)", fontSize: 11, marginLeft: 6 }}>{row.company_name}</span>
                            )}
                          </td>
                          <td style={{ fontFamily: "var(--font-instrument-sans)", fontSize: 13, color: "hsl(0,0%,60%)", padding: "7px 12px" }}>
                            {row.email ?? <span style={{ color: "hsl(0,0%,30%)" }}>—</span>}
                          </td>
                          <td style={{ fontFamily: "var(--font-instrument-sans)", fontSize: 13, color: "hsl(0,0%,60%)", padding: "7px 12px" }}>
                            {row.phone ?? <span style={{ color: "hsl(0,0%,30%)" }}>—</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {rows.length > 50 && (
                  <p style={{ fontFamily: "var(--font-instrument-sans)", fontSize: 12, color: "hsl(0,0%,40%)", padding: "8px 12px" }}>
                    + {rows.length - 50} more rows not shown
                  </p>
                )}
              </div>
            </div>

            {importError && (
              <p style={{ fontFamily: "var(--font-instrument-sans)", fontSize: 13, color: "#e05252", margin: 0 }}>
                {importError}
              </p>
            )}

            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => void handleImport()}
                disabled={importing}
                style={{
                  background: "#3762e3",
                  color: "#fff",
                  border: "none",
                  borderRadius: 8,
                  padding: "10px 20px",
                  fontFamily: "var(--font-instrument-sans)",
                  fontSize: 14,
                  fontWeight: 500,
                  cursor: importing ? "not-allowed" : "pointer",
                  opacity: importing ? 0.6 : 1,
                }}
              >
                {importing ? "Importing…" : `Import ${rows.length} Lead${rows.length !== 1 ? "s" : ""}`}
              </button>
              <button
                onClick={() => { setStep("upload"); setRows([]); setParseError(null); }}
                style={{
                  background: "rgba(255,255,255,0.06)",
                  color: "hsl(0,0%,70%)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: 8,
                  padding: "10px 16px",
                  fontFamily: "var(--font-instrument-sans)",
                  fontSize: 14,
                  cursor: "pointer",
                }}
              >
                Choose Different File
              </button>
            </div>
          </>
        )}

        {step === "done" && (
          <div style={{ textAlign: "center", padding: "32px 0" }}>
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: "50%",
                background: "rgba(16, 185, 129, 0.15)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 16px",
                fontSize: 28,
              }}
            >
              ✓
            </div>
            <p style={{ fontFamily: "var(--font-instrument-sans)", fontSize: 16, color: "hsl(160, 60%, 70%)", margin: 0 }}>
              {importedCount} lead{importedCount !== 1 ? "s" : ""} imported successfully
            </p>
          </div>
        )}
      </div>
    </>
  );
}
