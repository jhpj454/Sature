import { PDFDocument, rgb, StandardFonts, degrees } from "pdf-lib";

export type CoiPdfData = {
  // Producer / Agency
  producerName: string;

  // Insured
  insuredName: string;

  // Policy
  policyNumber: string;
  lob: string;
  carrierName: string;
  effectiveDate: string;
  expirationDate: string;
  premiumAmount: number | string | null;

  // Limits (array of { coverage_type, limit_type, limit_amount })
  limits: Array<{ coverage_type: string; limit_type: string; limit_amount: number | string }>;

  // Coverages
  coverages: Array<{ coverage_name: string; description: string | null }>;

  // Certificate holder
  holderName: string;
  holderAddress: string | null;

  // Issuance
  issuedDate: string;
  coiRequestId: string;
};

function formatMoney(value: number | string | null): string {
  if (value === null || value === undefined) return "-";
  const n = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(n)) return "-";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

function shortDate(iso: string | null): string {
  if (!iso) return "-";
  const parts = iso.split("T")[0].split("-");
  if (parts.length !== 3) return iso;
  return `${parts[1]}/${parts[2]}/${parts[0]}`;
}

export async function generateCoiPdf(data: CoiPdfData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]); // US Letter
  const { width, height } = page.getSize();

  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const fontRegular = await doc.embedFont(StandardFonts.Helvetica);

  const BLACK = rgb(0, 0, 0);
  const GRAY = rgb(0.4, 0.4, 0.4);
  const LIGHT_GRAY = rgb(0.9, 0.9, 0.9);
  const RED = rgb(0.8, 0.1, 0.1);

  const margin = 36;
  let y = height - margin;

  function drawText(
    text: string,
    x: number,
    yPos: number,
    opts: { size?: number; font?: typeof fontBold; color?: ReturnType<typeof rgb> } = {},
  ) {
    page.drawText(text, {
      x,
      y: yPos,
      size: opts.size ?? 9,
      font: opts.font ?? fontRegular,
      color: opts.color ?? BLACK,
    });
  }

  function drawHLine(yPos: number, x1 = margin, x2 = width - margin, thickness = 0.5) {
    page.drawLine({ start: { x: x1, y: yPos }, end: { x: x2, y: yPos }, thickness, color: GRAY });
  }

  function drawRect(x: number, yPos: number, w: number, h: number, fillColor: ReturnType<typeof rgb>) {
    page.drawRectangle({ x, y: yPos, width: w, height: h, color: fillColor, borderWidth: 0 });
  }

  // ── SAMPLE WATERMARK ───────────────────────────────────────────
  page.drawText("SAMPLE — PENDING ACORD LICENSE", {
    x: 80,
    y: height / 2 - 20,
    size: 48,
    font: fontBold,
    color: rgb(0.85, 0.85, 0.85),
    rotate: degrees(45),
  });

  // ── HEADER ─────────────────────────────────────────────────────
  drawRect(margin, y - 16, width - margin * 2, 18, rgb(0.1, 0.1, 0.1));
  drawText("CERTIFICATE OF LIABILITY INSURANCE", margin + 4, y - 12, {
    font: fontBold,
    size: 11,
    color: rgb(1, 1, 1),
  });
  drawText(`DATE: ${shortDate(data.issuedDate)}`, width - margin - 120, y - 12, {
    font: fontRegular,
    size: 9,
    color: rgb(1, 1, 1),
  });
  y -= 28;

  // ── SAMPLE NOTICE ──────────────────────────────────────────────
  drawRect(margin, y - 12, width - margin * 2, 14, rgb(1, 0.95, 0.8));
  drawText(
    "THIS IS A SAMPLE CERTIFICATE. NOT FOR USE. PENDING ACORD VENDOR LICENSE.",
    margin + 4,
    y - 9,
    { font: fontBold, size: 7.5, color: RED },
  );
  y -= 22;

  // ── PRODUCER / INSURED ROW ─────────────────────────────────────
  const midX = width / 2;
  drawHLine(y);
  y -= 4;

  drawText("PRODUCER", margin, y, { font: fontBold, size: 7.5, color: GRAY });
  drawText("INSURED", midX + 4, y, { font: fontBold, size: 7.5, color: GRAY });
  y -= 12;

  drawText(data.producerName, margin, y, { font: fontBold, size: 9 });
  drawText(data.insuredName, midX + 4, y, { font: fontBold, size: 9 });
  y -= 20;

  // ── CARRIER ────────────────────────────────────────────────────
  drawHLine(y + 8);
  drawRect(margin, y - 2, width - margin * 2, 14, LIGHT_GRAY);
  drawText("INSURER(S) AFFORDING COVERAGE", margin + 4, y + 1, { font: fontBold, size: 7.5 });
  y -= 2;
  drawText(data.carrierName || "—", margin + 4, y - 11, { size: 9 });
  y -= 22;

  // ── COVERAGES HEADER ───────────────────────────────────────────
  drawHLine(y + 4);
  drawRect(margin, y - 2, width - margin * 2, 14, rgb(0.1, 0.1, 0.1));
  drawText("COVERAGES", margin + 4, y + 1, { font: fontBold, size: 9, color: rgb(1, 1, 1) });
  y -= 16;

  // ── POLICY SUMMARY ─────────────────────────────────────────────
  const col1 = margin;
  const col2 = margin + 110;
  const col3 = margin + 240;
  const col4 = margin + 330;
  const col5 = margin + 420;

  // Column headers
  drawRect(margin, y - 2, width - margin * 2, 12, LIGHT_GRAY);
  drawText("TYPE OF INSURANCE", col1 + 2, y, { font: fontBold, size: 7.5 });
  drawText("POLICY NUMBER", col2 + 2, y, { font: fontBold, size: 7.5 });
  drawText("EFF DATE", col3 + 2, y, { font: fontBold, size: 7.5 });
  drawText("EXP DATE", col4 + 2, y, { font: fontBold, size: 7.5 });
  drawText("LIMITS", col5 + 2, y, { font: fontBold, size: 7.5 });
  y -= 16;

  // Policy row
  drawText(data.lob, col1 + 2, y, { size: 9 });
  drawText(data.policyNumber, col2 + 2, y, { size: 9 });
  drawText(shortDate(data.effectiveDate), col3 + 2, y, { size: 9 });
  drawText(shortDate(data.expirationDate), col4 + 2, y, { size: 9 });
  drawText(formatMoney(data.premiumAmount), col5 + 2, y, { size: 9 });
  y -= 14;
  drawHLine(y + 2);

  // ── LIMITS TABLE ───────────────────────────────────────────────
  if (data.limits.length > 0) {
    y -= 4;
    drawRect(margin, y - 2, width - margin * 2, 12, LIGHT_GRAY);
    drawText("LIMITS", margin + 4, y, { font: fontBold, size: 7.5 });
    y -= 14;

    for (const limit of data.limits.slice(0, 12)) {
      const coverageLabel = limit.coverage_type.replace(/_/g, " ").toUpperCase();
      const limitLabel = limit.limit_type.replace(/_/g, " ");
      drawText(`${coverageLabel} — ${limitLabel}`, margin + 4, y, { size: 8, color: GRAY });
      drawText(formatMoney(limit.limit_amount), width - margin - 80, y, { font: fontBold, size: 8 });
      y -= 12;
    }
    y -= 4;
    drawHLine(y + 2);
  }

  // ── COVERAGES LIST ─────────────────────────────────────────────
  if (data.coverages.length > 0) {
    y -= 4;
    drawRect(margin, y - 2, width - margin * 2, 12, LIGHT_GRAY);
    drawText("COVERAGE DETAILS", margin + 4, y, { font: fontBold, size: 7.5 });
    y -= 14;

    for (const cov of data.coverages.slice(0, 8)) {
      drawText(`• ${cov.coverage_name}`, margin + 4, y, { size: 8, color: GRAY });
      if (cov.description) {
        drawText(cov.description.slice(0, 60), margin + 100, y, { size: 7.5, color: GRAY });
      }
      y -= 12;
    }
    y -= 4;
    drawHLine(y + 2);
  }

  // ── CERTIFICATE HOLDER ─────────────────────────────────────────
  y -= 8;
  drawRect(margin, y - 2, width / 2 - margin, 12, LIGHT_GRAY);
  drawText("CERTIFICATE HOLDER", margin + 4, y, { font: fontBold, size: 7.5 });
  y -= 14;

  drawText(data.holderName, margin + 4, y, { font: fontBold, size: 9 });
  y -= 12;
  if (data.holderAddress) {
    drawText(data.holderAddress, margin + 4, y, { size: 8, color: GRAY });
    y -= 12;
  }

  // ── FOOTER ─────────────────────────────────────────────────────
  y = margin + 24;
  drawHLine(y + 4);
  drawText(
    `Certificate ID: ${data.coiRequestId}  |  Issued: ${shortDate(data.issuedDate)}  |  ${data.producerName}`,
    margin,
    y,
    { size: 7, color: GRAY },
  );
  drawText(
    "ACORD 25 (2016/03) — SAMPLE ONLY — NOT A VALID ACORD CERTIFICATE",
    margin,
    y - 10,
    { size: 6.5, color: RED },
  );

  return doc.save();
}
