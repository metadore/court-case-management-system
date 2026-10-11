import { PDFDocument, rgb, StandardFonts } from "pdf-lib";

// ── Types ────────────────────────────────────────────────────────────────────

export interface CaseData {
  caseNumber: string;
  title: string;
  type: string;
  status: string;
  filedAt: Date | string;
  description: string | null;
  assignedJudge: { firstName: string; lastName: string } | null;
  parties: Array<{
    name: string;
    role: string;
    email?: string | null;
    phone?: string | null;
  }>;
  hearings: Array<{
    type: string;
    status: string;
    scheduledAt: Date | string;
    durationMins: number;
    judge: { firstName: string; lastName: string };
  }>;
  documents: Array<{
    title: string;
    type: string;
    version: number;
    filedAt: Date | string;
    uploadedBy: { firstName: string; lastName: string };
  }>;
}

export interface DocketEntry {
  date: Date | string;
  type: string;
  description: string;
  actor: string;
}

// ── PDF Generation ─────────────────────────────────────────────────────────

function formatDate(date: Date | string): string {
  const d = new Date(date);
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function formatDateTime(date: Date | string): string {
  const d = new Date(date);
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function wrapText(text: string, maxWidth: number, font: any, fontSize: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const testWidth = font.widthOfTextAtSize(testLine, fontSize);

    if (testWidth > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines;
}

/**
 * Generate a case summary / docket report as a PDF.
 */
export async function generateCaseSummaryPdf(
  caseData: CaseData,
  docketEntries?: DocketEntry[],
): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontSmall = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const pageWidth = 612; // US Letter
  const pageHeight = 792;
  const margin = 50;
  const contentWidth = pageWidth - margin * 2;
  let y = pageHeight - margin;

  function getCurrentPage() {
    const pages = pdfDoc.getPages();
    const page = pages[pages.length - 1];
    if (page) return page;
    y = pageHeight - margin;
    return pdfDoc.addPage([pageWidth, pageHeight]);
  }

  function addPage() {
    pdfDoc.addPage([pageWidth, pageHeight]);
    y = pageHeight - margin;
  }

  function drawDivider() {
    y -= 4;
    const page = getCurrentPage();
    page.drawLine({
      start: { x: margin, y },
      end: { x: pageWidth - margin, y },
      thickness: 0.5,
      color: rgb(0.6, 0.6, 0.6),
    });
    y -= 8;
  }

  function ensureSpace(needed: number) {
    if (y < margin + needed) {
      addPage();
    }
  }

  function drawText(
    text: string,
    opts: {
      size?: number;
      bold?: boolean;
      color?: [number, number, number];
      x?: number;
    } = {},
  ) {
    const size = opts.size ?? 10;
    const currentFont = opts.bold ? fontBold : font;
    const color = opts.color ?? [0, 0, 0];
    const x = opts.x ?? margin;

    ensureSpace(size);
    const page = getCurrentPage();
    page.drawText(text, { x, y, size, font: currentFont, color: rgb(color[0], color[1], color[2]) });
    y -= size * 1.5;
  }

  function drawWrappedText(
    text: string,
    opts: {
      size?: number;
      bold?: boolean;
      color?: [number, number, number];
      maxWidth?: number;
    } = {},
  ) {
    const size = opts.size ?? 10;
    const maxWidth = opts.maxWidth ?? contentWidth;
    const lines = wrapText(text, maxWidth, fontSmall, size);
    for (const line of lines) {
      drawText(line, opts);
    }
  }

  function drawSectionHeader(title: string) {
    drawText(title, { size: 13, bold: true, color: [0.11, 0.3, 0.6] });
    drawDivider();
  }

  function drawField(label: string, value: string) {
    if (!value) return;
    drawText(`${label}:  ${value}`, { size: 9 });
  }

  // ═════════════════════════════════════════════════════════════════════════
  // COVER / HEADER
  // ═════════════════════════════════════════════════════════════════════════

  drawText("TPT COURT SYSTEM", { size: 18, bold: true, color: [0.11, 0.3, 0.6] });
  drawText("Case Summary Report", { size: 14, bold: true, color: [0.3, 0.3, 0.3] });
  drawText(`Generated: ${formatDateTime(new Date())}`, { size: 8, color: [0.5, 0.5, 0.5] });
  y -= 6;
  drawDivider();

  // ═════════════════════════════════════════════════════════════════════════
  // CASE INFORMATION
  // ═════════════════════════════════════════════════════════════════════════

  drawSectionHeader("Case Information");

  drawField("Case Number", caseData.caseNumber);
  drawField("Title", caseData.title);
  drawField("Type", caseData.type);
  drawField("Status", caseData.status);
  drawField("Filed Date", formatDate(caseData.filedAt));

  if (caseData.assignedJudge) {
    drawField("Assigned Judge", `${caseData.assignedJudge.firstName} ${caseData.assignedJudge.lastName}`);
  }

  if (caseData.description) {
    drawWrappedText(`Description: ${caseData.description}`, { size: 9 });
  }

  y -= 4;

  // ═════════════════════════════════════════════════════════════════════════
  // PARTIES
  // ═════════════════════════════════════════════════════════════════════════

  if (caseData.parties.length > 0) {
    drawSectionHeader("Parties");

    for (const party of caseData.parties) {
      const partyInfo = [`${party.name} (${party.role})`];
      if (party.email) partyInfo.push(`Email: ${party.email}`);
      if (party.phone) partyInfo.push(`Phone: ${party.phone}`);
      drawText(partyInfo.join(" | "), { size: 9 });
      y -= 2;
    }
    y -= 2;
  }

  // ═════════════════════════════════════════════════════════════════════════
  // HEARINGS
  // ═════════════════════════════════════════════════════════════════════════

  if (caseData.hearings.length > 0) {
    drawSectionHeader("Hearings");

    for (const hearing of caseData.hearings) {
      const judgeName = `${hearing.judge.firstName} ${hearing.judge.lastName}`;
      drawText(
        `${formatDateTime(hearing.scheduledAt)} - ${hearing.type} (${hearing.status})`,
        { size: 9, bold: true },
      );
      drawText(`Judge: ${judgeName} | Duration: ${hearing.durationMins} mins`, { size: 8, color: [0.4, 0.4, 0.4] });
      y -= 4;
    }
    y -= 2;
  }

  // ═════════════════════════════════════════════════════════════════════════
  // DOCUMENTS
  // ═════════════════════════════════════════════════════════════════════════

  if (caseData.documents.length > 0) {
    drawSectionHeader("Filed Documents");

    for (const doc of caseData.documents) {
      const uploader = `${doc.uploadedBy.firstName} ${doc.uploadedBy.lastName}`;
      drawText(`${doc.title} (${doc.type}) v${doc.version}`, { size: 9, bold: true });
      drawText(`Filed by: ${uploader} on ${formatDate(doc.filedAt)}`, { size: 8, color: [0.4, 0.4, 0.4] });
      y -= 4;
    }
    y -= 2;
  }

  // ═════════════════════════════════════════════════════════════════════════
  // DOCKET ENTRIES (timeline)
  // ═════════════════════════════════════════════════════════════════════════

  if (docketEntries && docketEntries.length > 0) {
    // Ensure space for docket section
    ensureSpace(160);
    drawSectionHeader("Case Docket / Timeline");

    for (const entry of docketEntries) {
      drawText(`${formatDateTime(entry.date)}`, { size: 8, bold: true, color: [0.3, 0.3, 0.3] });
      drawText(`[${entry.type}] ${entry.description}`, { size: 9 });
      drawText(`By: ${entry.actor}`, { size: 7, color: [0.5, 0.5, 0.5] });
      y -= 6;
    }
  }

  // ═════════════════════════════════════════════════════════════════════════
  // FOOTER
  // ═════════════════════════════════════════════════════════════════════════

  const pageCount = pdfDoc.getPageCount();
  for (let i = 0; i < pageCount; i++) {
    const page = pdfDoc.getPages()[i];
    if (page) {
      page.drawText(`Page ${i + 1} of ${pageCount}`, {
        x: margin, y: 20, size: 8, font, color: rgb(0.5, 0.5, 0.5),
      });
      page.drawText(`Case: ${caseData.caseNumber}`, {
        x: pageWidth - margin - 80, y: 20, size: 8, font, color: rgb(0.5, 0.5, 0.5),
      });
    }
  }

  return Buffer.from(await pdfDoc.save());
}